import 'server-only';
import { getDb } from './database';

// ── Access state ─────────────────────────────────────────────────────────────

export async function accessState(id: string): Promise<string> {
  const { data } = await getDb()
    .from('account_access')
    .select('state')
    .eq('id', id)
    .maybeSingle();
  return data?.state ?? 'active';
}

export async function ensureActive(id: string): Promise<void> {
  if ((await accessState(id)) !== 'active')
    throw new Error('Your account access is restricted. Contact the app administrator.');
}

// ── Purge all data for a user (hard delete) ──────────────────────────────────

export async function purgeAccountData(userId: string): Promise<void> {
  const db = getDb();
  // Supabase Postgres — run deletes in order (no FK constraints assumed)
  await db.from('records').delete().eq('owner', userId);
  await db.from('credentials').delete().eq('owner', userId);
  await db.from('messages').delete().or(`sender.eq.${userId},recipient.eq.${userId}`);
  await db.from('chat_contacts').delete().or(`owner.eq.${userId},peer.eq.${userId}`);
  await db.from('chat_pins').delete().or(`owner.eq.${userId},peer.eq.${userId}`);
  await db.from('chat_requests').delete().or(`sender.eq.${userId},recipient.eq.${userId}`);
  await db.from('profiles').delete().eq('id', userId);
  await db.from('account_access').upsert(
    { id: userId, state: 'deleted', target_email: '', updated: Date.now() },
    { onConflict: 'id' }
  );
}

// ── Ghost-profile sync (remove app profiles for deleted Supabase auth users) ──

let lastSync = 0;

export async function syncGhostProfiles(): Promise<void> {
  const now = Date.now();
  if (
    now - lastSync < 10000 ||
    !process.env.SUPABASE_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) return;
  lastSync = now;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false } }
    );
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data?.users) return;
    const activeIds = new Set(data.users.map((u: any) => u.id));
    const db = getDb();
    const { data: profiles } = await db.from('profiles').select('id');
    if (!profiles) return;
    for (const p of profiles) {
      if (!activeIds.has(p.id)) {
        await purgeAccountData(p.id);
      }
    }
  } catch { /* best-effort */ }
}
