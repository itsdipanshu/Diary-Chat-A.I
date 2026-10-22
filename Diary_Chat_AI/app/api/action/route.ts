import { ensureActive, purgeAccountData, syncGhostProfiles, accessState } from '../../../lib/account-access';
import { DB } from '../../../lib/database';
import { getUser } from '../../../lib/supabase/server';
import { username, clean, parsePlan } from '../../../lib/core';

const providers = ['openrouter', 'gemini', 'groq'];
const base = (p: string) => p === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.groq.com/openai/v1';

async function crypt(value: string, decode = false) {
  if (!process.env.KEY_ENCRYPTION_SECRET) throw new Error('Key vault is not configured.');
  const bytes = new TextEncoder().encode(process.env.KEY_ENCRYPTION_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  if (decode) {
    const all = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12)));
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...iv, ...enc));
}

async function models(provider: string, key: string) {
  if (provider === 'openrouter') {
    const check = await fetch(base(provider) + '/key', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(25000) });
    if (!check.ok) throw new Error('Invalid OpenRouter key or unavailable account.');
  }
  const url = provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' : base(provider) + '/models';
  const r = await fetch(url, { headers: provider === 'gemini' ? { 'x-goog-api-key': key } : { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('Connection failed. Check the key, provider access and quota.');
  const j: any = await r.json();
  return provider === 'gemini'
    ? (j.models || []).filter((x: any) => x.supportedGenerationMethods?.includes('generateContent')).map((x: any) => ({ id: x.name.replace('models/', ''), name: x.displayName }))
    : (j.data || []).filter((x: any) => provider !== 'groq' || (!x.id.includes('whisper') && !x.id.includes('guard') && !x.id.includes('embed'))).map((x: any) => ({ id: x.id, name: x.name || x.id }));
}

async function ai(c: any, prompt: string, json = false) {
  const key = await crypt(c.cipher, true);
  let url, body: any, headers;
  if (c.provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(c.model) + ':generateContent';
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    body = { contents: [{ parts: [{ text: prompt }] }] };
    if (json) body.generationConfig = { responseMimeType: 'application/json' };
  } else {
    url = base(c.provider) + '/chat/completions';
    headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
    body = { model: c.model, messages: [{ role: 'user', content: prompt }], max_tokens: 8192 };
    if (json) body.response_format = { type: 'json_object' };
  }
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('AI request failed (' + r.status + '). Check model access, credits and rate limits.');
  const j: any = await r.json();
  const text = c.provider === 'gemini'
    ? j.candidates?.[0]?.content?.parts?.map((x: any) => x.text || '').join('')
    : j.choices?.[0]?.message?.content;
  if (!text) throw new Error('The model returned no text. Try another model.');
  return text;
}

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
    const user = await getUser();
    if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
    const u = user.userId;
    const raw = await req.text();
    if (raw.length > 1800000) throw new Error('Request is too large.');
    const b = JSON.parse(raw);
    const act = b.action;
    const db = DB;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const first = async (table: string, filters: Record<string, any>, select = '*') => {
      let q = db.from(table).select(select);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v) as any;
      const { data } = await (q as any).maybeSingle();
      return data ?? null;
    };

    const all = async (table: string, filters: Record<string, any>, select = '*', opts?: { order?: string; limit?: number }) => {
      let q = db.from(table).select(select);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v) as any;
      if (opts?.order) q = (q as any).order(opts.order, { ascending: false });
      if (opts?.limit) q = (q as any).limit(opts.limit);
      const { data } = await q;
      return data ?? [];
    };

    const run = async (fn: () => any) => { await ensureActive(u); return await fn(); };

    // ── load ─────────────────────────────────────────────────────────────────
    if (act === 'load') {
      syncGhostProfiles().catch(() => {});
      const [profile, recordRows, keyRows] = await Promise.all([
        first('profiles', { id: u }),
        all('records', { owner: u }, '*', { order: 'updated' }),
        all('credentials', { owner: u }, 'provider,model'),
      ]);
      return Response.json({
        profile,
        name: user.fullName || 'Friend',
        records: recordRows.map((x: any) => ({ ...x, data: JSON.parse(x.data) })),
        keys: keyRows,
      });
    }

    // ── profile ───────────────────────────────────────────────────────────────
    if (act === 'profile') {
      const handle = username(b.username);
      const { data: existingWithUsername } = await db.from('profiles').select('id').eq('username', handle).neq('id', u).maybeSingle();
      if (existingWithUsername) {
        let isDead = (await accessState(existingWithUsername.id)) === 'deleted';
        if (!isDead && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
            const { error } = await admin.auth.admin.getUserById(existingWithUsername.id);
            if (error && (error.status === 404 || (error as any).code === 'user_not_found' || error.message?.includes('not found'))) isDead = true;
          } catch { /* best-effort */ }
        }
        if (isDead) await purgeAccountData(existingWithUsername.id);
        else throw new Error('This username is already taken. Choose another.');
      }
      const avatarStr = typeof b.avatar === 'string' && (b.avatar.startsWith('data:image/') || b.avatar.startsWith('http') || b.avatar.startsWith('/')) ? b.avatar.slice(0, 1500000) : '';
      await run(() => db.from('profiles').upsert(
        { id: u, username: handle, name: clean(b.name, 80), bio: String(b.bio || '').slice(0, 300), avatar: avatarStr, country: String(b.country || '').slice(0, 100), language: String(b.language || '').slice(0, 100), timezone: String(b.timezone || '').slice(0, 100) },
        { onConflict: 'id' }
      ));
      return Response.json({ ok: true });
    }

    // ── save ──────────────────────────────────────────────────────────────────
    if (act === 'save') {
      if (!['diary', 'calendar', 'brand'].includes(b.kind)) throw new Error('Invalid record type.');
      const id = String(b.id || crypto.randomUUID());
      const { data: existing } = await db.from('records').select('owner').eq('id', id).maybeSingle();
      if (existing && existing.owner !== u) return Response.json({ error: 'Not allowed' }, { status: 403 });
      const data = JSON.stringify(b.data);
      if (data.length > 1200000) throw new Error('Record is too large.');
      await run(() => db.from('records').upsert({ id, owner: u, kind: b.kind, data, updated: Date.now() }, { onConflict: 'id' }));
      return Response.json({ id });
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (act === 'remove') {
      await run(() => db.from('records').delete().eq('id', String(b.id)).eq('owner', u));
      return Response.json({ ok: true });
    }

    // ── key ───────────────────────────────────────────────────────────────────
    if (act === 'key') {
      if (!providers.includes(b.provider)) throw new Error('Unknown provider.');
      if (b.remove) {
        await run(() => db.from('credentials').delete().eq('owner', u).eq('provider', b.provider));
        return Response.json({ ok: true });
      }
      const { data: existingKey } = await db.from('credentials').select('*').eq('owner', u).eq('provider', b.provider).maybeSingle();
      const key = b.key ? clean(b.key, 1000) : existingKey ? await crypt(existingKey.cipher, true) : '';
      if (!key) throw new Error('Enter an API key.');
      const list = await models(b.provider, key);
      if (b.test) return Response.json({ models: list });
      const model = clean(b.model, 150);
      if (!list.some((x: any) => x.id === model)) throw new Error('Select a model returned by the provider.');
      const cipher = await crypt(key);
      await run(() => db.from('credentials').upsert(
        { id: u + ':' + b.provider, owner: u, provider: b.provider, cipher, model },
        { onConflict: 'id' }
      ));
      return Response.json({ ok: true });
    }

    // ── generate / rewrite ────────────────────────────────────────────────────
    if (act === 'generate' || act === 'rewrite') {
      const creds = await all('credentials', { owner: u });
      const primary = creds.find((c: any) => c.provider === b.provider);
      if (!primary) throw new Error('Connect this AI provider in Settings first.');
      let prompt = '';
      if (act === 'generate') {
        clean(b.brand, 150); clean(b.topic, 500); clean(b.platform, 120); clean(b.language, 120);
        prompt = 'Create a 30-day social media plan. Return valid JSON {"posts":[30 objects]}, each with day (1-30), topic, caption (engaging, concise 2-3 sentences), hashtags (array of 3-5 tags), contentType, time (HH:MM). Follow the requested language, script and dialect for all content. Adapt formats to the requested platform; never assume Instagram if a different platform is specified. Distinct, useful posts. Complete all 30 posts in valid JSON without truncation. Brand brief: ' + JSON.stringify({ brand: b.brand, topic: b.topic, platform: b.platform, tone: b.tone, audience: b.audience, language: b.language, instructions: b.instructions, goal: b.goal });
      } else {
        prompt = 'Rewrite the following text. Return only the rewritten text. Do not invent personal facts. Instruction: ' + clean(b.instruction, 300) + '\nText: ' + clean(b.text, 15000);
      }
      let result, used, last;
      const credList: any[] = b.fallback ? [primary, ...creds.filter((c: any) => c !== primary)] : [primary];
      for (const c of credList) {
        try {
          if (act === 'generate' && b.mode === 'fast') {
            const batches = await Promise.all([1, 11, 21].map(day => ai(c, prompt + ' OVERRIDE: return exactly 10 posts, covering days ' + day + ' through ' + (day + 9) + ' only.', true)));
            const combined = batches.flatMap(raw => { const j = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); const posts = Array.isArray(j) ? j : j.posts; if (!Array.isArray(posts) || posts.length !== 10) throw new Error('Incomplete batch. Try standard mode.'); return posts; });
            result = JSON.stringify({ posts: combined });
          } else {
            result = await ai(c, prompt, act === 'generate');
          }
          if (act === 'generate' && b.mode === 'quality') {
            const reviewer: any = creds.find((x: any) => x.provider !== c.provider) || c;
            result = await ai(reviewer, 'Review and improve this 30-post plan. Preserve exactly 30 objects, all required fields and brand facts. Return JSON only. Original instructions: ' + prompt + '\nDraft: ' + result, true);
            used = c.provider + ' + review: ' + reviewer.provider;
          } else { used = c.provider; }
          break;
        } catch (e) { last = e; }
      }
      if (!result) throw last || new Error('Generation failed.');
      return Response.json(act === 'generate' ? { posts: parsePlan(result, b.start), provider: used } : { text: result, provider: used });
    }

    // ── search ────────────────────────────────────────────────────────────────
    if (act === 'search') {
      syncGhostProfiles().catch(() => {});
      const q = String(b.query || '').trim().toLowerCase();
      if (q.length < 2) return Response.json({ users: [] });
      const safeQ = q.replace(/[%_]/g, '') + '%';
      const { data: blockedIds } = await DB.from('account_access').select('id').in('state', ['deleted', 'deleting', 'blocked']);
      const blocked = (blockedIds ?? []).map((r: any) => r.id);
      let query = DB.from('profiles').select('id,username,name,bio,avatar').ilike('username', safeQ).neq('id', u).limit(20);
      if (blocked.length) query = (query as any).not('id', 'in', `(${blocked.join(',')})`);
      const { data: users } = await query;
      return Response.json({ users: users ?? [] });
    }

    // ── open_chat ─────────────────────────────────────────────────────────────
    if (act === 'open_chat') {
      const peerId = String(b.peer || '');
      if (peerId && peerId !== u) {
        await run(() => db.from('chat_contacts').upsert({ owner: u, peer: peerId, created: Date.now() }, { onConflict: 'owner,peer', ignoreDuplicates: true }));
      }
      return Response.json({ ok: true });
    }

    // ── pin ───────────────────────────────────────────────────────────────────
    if (act === 'pin') {
      const peerId = String(b.peer || '');
      if (!peerId) throw new Error('Peer required');
      const { data: pinExists } = await db.from('chat_pins').select('peer').eq('owner', u).eq('peer', peerId).maybeSingle();
      if (pinExists) {
        await run(() => db.from('chat_pins').delete().eq('owner', u).eq('peer', peerId));
        return Response.json({ ok: true, pinned: false });
      } else {
        await run(() => db.from('chat_pins').upsert({ owner: u, peer: peerId, created: Date.now() }, { onConflict: 'owner,peer' }));
        return Response.json({ ok: true, pinned: true });
      }
    }

    // ── chat_request ──────────────────────────────────────────────────────────
    if (act === 'chat_request') {
      const peerId = String(b.peer || '');
      if (!peerId) throw new Error('Peer required');
      const status = b.status === 'accepted' ? 'accepted' : 'declined';
      const reqId = [u, peerId].sort().join(':');
      await run(() => db.from('chat_requests').upsert(
        { id: reqId, sender: b.sender || peerId, recipient: u, status, created: Date.now(), updated: Date.now() },
        { onConflict: 'id' }
      ));
      if (status === 'accepted') {
        await db.from('chat_contacts').upsert({ owner: u, peer: peerId, created: Date.now() }, { onConflict: 'owner,peer', ignoreDuplicates: true });
        await db.from('chat_contacts').upsert({ owner: peerId, peer: u, created: Date.now() }, { onConflict: 'owner,peer', ignoreDuplicates: true });
      }
      return Response.json({ ok: true, status });
    }

    // ── threads ───────────────────────────────────────────────────────────────
    if (act === 'threads') {
      syncGhostProfiles().catch(() => {});
      // Fetch contacts + messages + pins + requests for this user, then join in JS
      const [contacts, pinRows, msgRows, reqRows, blockedRows, profileRows] = await Promise.all([
        db.from('chat_contacts').select('peer').eq('owner', u),
        db.from('chat_pins').select('peer').eq('owner', u),
        db.from('messages').select('sender,recipient,created').or(`sender.eq.${u},recipient.eq.${u}`),
        db.from('chat_requests').select('*').or(`sender.eq.${u},recipient.eq.${u}`),
        db.from('account_access').select('id').in('state', ['deleted', 'deleting', 'blocked']),
        db.from('profiles').select('id,username,name,avatar,bio'),
      ]);
      const blocked = new Set((blockedRows.data ?? []).map((r: any) => r.id));
      const pinned = new Set((pinRows.data ?? []).map((r: any) => r.peer));
      const peerIds = new Set<string>();
      for (const c of contacts.data ?? []) peerIds.add(c.peer);
      for (const m of msgRows.data ?? []) { peerIds.add(m.sender === u ? m.recipient : m.sender); }
      for (const r of reqRows.data ?? []) { peerIds.add(r.sender === u ? r.recipient : r.sender); }
      peerIds.delete(u);

      const profileMap = new Map((profileRows.data ?? []).filter((p: any) => !blocked.has(p.id) && peerIds.has(p.id)).map((p: any) => [p.id, p]));

      const lastMsg = new Map<string, number>();
      for (const m of msgRows.data ?? []) {
        const peer = m.sender === u ? m.recipient : m.sender;
        lastMsg.set(peer, Math.max(lastMsg.get(peer) ?? 0, m.created));
      }
      for (const c of contacts.data ?? []) lastMsg.set(c.peer, lastMsg.get(c.peer) ?? 0);

      const reqMap = new Map((reqRows.data ?? []).map((r: any) => {
        const peer = r.sender === u ? r.recipient : r.sender;
        return [peer, r];
      }));

      const rows = [...profileMap.values()].map((p: any) => {
        const req = reqMap.get(p.id);
        return {
          ...p,
          last: lastMsg.get(p.id) ?? 0,
          pinned: pinned.has(p.id) ? 1 : 0,
          request_status: req?.status ?? (lastMsg.has(p.id) ? 'accepted' : 'none'),
          request_sender: req?.sender ?? '',
        };
      }).sort((a, b) => b.pinned - a.pinned || b.last - a.last);

      return Response.json({ users: rows });
    }

    // ── chat ──────────────────────────────────────────────────────────────────
    if (act === 'chat') {
      const peerId = String(b.peer);
      const reqId = [u, peerId].sort().join(':');
      const [reqData, pinData, msgs] = await Promise.all([
        db.from('chat_requests').select('*').eq('id', reqId).maybeSingle(),
        db.from('chat_pins').select('peer').eq('owner', u).eq('peer', peerId).maybeSingle(),
        db.from('messages').select('*').or(`and(sender.eq.${u},recipient.eq.${peerId}),and(sender.eq.${peerId},recipient.eq.${u})`).order('created', { ascending: true }).limit(200),
      ]);
      const req = reqData.data;
      const messages = msgs.data ?? [];
      return Response.json({
        messages,
        self: u,
        pinned: !!pinData.data,
        request: req ?? (messages.length > 0 ? { status: 'accepted', sender: u, recipient: peerId } : { status: 'none' }),
      });
    }

    // ── send ──────────────────────────────────────────────────────────────────
    if (act === 'send') {
      const { data: selfProfile } = await db.from('profiles').select('id').eq('id', u).maybeSingle();
      if (!selfProfile) throw new Error('Create your profile first.');
      const peerId = String(b.peer);
      if (peerId === u) throw new Error('Recipient not found.');
      const { data: peerProfile } = await db.from('profiles').select('id').eq('id', peerId).maybeSingle();
      if (!peerProfile) throw new Error('Recipient not found.');

      await db.from('chat_contacts').upsert({ owner: u, peer: peerId, created: Date.now() }, { onConflict: 'owner,peer', ignoreDuplicates: true });
      await db.from('chat_contacts').upsert({ owner: peerId, peer: u, created: Date.now() }, { onConflict: 'owner,peer', ignoreDuplicates: true });

      const reqId = [u, peerId].sort().join(':');
      const { data: existingReq } = await db.from('chat_requests').select('id').eq('id', reqId).maybeSingle();
      if (!existingReq) {
        await db.from('chat_requests').insert({ id: reqId, sender: u, recipient: peerId, status: 'pending', created: Date.now(), updated: Date.now() });
      }
      await run(() => db.from('messages').insert({ id: crypto.randomUUID(), sender: u, recipient: peerId, body: clean(b.text, 4000), created: Date.now() }));
      return Response.json({ ok: true });
    }

    throw new Error('Unknown action.');
  } catch (e: any) {
    console.error('[API action error]', e.message);
    const msg = String(e.message || 'Something went wrong.');
    return Response.json(
      { error: msg.includes('duplicate') || msg.includes('unique') ? 'This username is already taken. Choose another.' : msg },
      { status: 400 }
    );
  }
}
