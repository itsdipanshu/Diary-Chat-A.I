import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getDb } from './database';
import { loadAllAccounts, summarizeAccount, directoryView } from './admin-directory';

export function adminProvider() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Admin account directory setup is pending. Configure SUPABASE_SECRET_KEY on the server.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
}

export async function getDirectory(params: URLSearchParams) {
  const client = adminProvider();
  const db = getDb();

  const users = await loadAllAccounts((p) => client.auth.admin.listUsers(p));

  // Fetch all profiles in batches of 400
  const profiles = new Map<string, any>();
  for (let i = 0; i < users.length; i += 400) {
    const ids = users.slice(i, i + 400).map((u) => u.id);
    if (!ids.length) continue;
    const { data: rows } = await db
      .from('profiles')
      .select('id,username,name,country,language,timezone')
      .in('id', ids);
    for (const row of rows ?? []) profiles.set(String(row.id), row);
  }

  const { data: accessRows } = await db.from('account_access').select('id,state');
  const access = new Map((accessRows ?? []).map((r: any) => [String(r.id), String(r.state)]));

  const { data: pendingRows } = await db
    .from('account_access')
    .select('id,target_email')
    .eq('state', 'deleting')
    .order('updated');

  return {
    ...directoryView(
      users.map((u) => ({
        ...summarizeAccount(u, profiles.get(u.id)),
        access: access.get(u.id) || 'active',
        protected: u.id === process.env.ADMIN_USER_ID,
      })),
      params
    ),
    pendingDeletions: (pendingRows ?? []).map((r: any) => ({ id: r.id, email: r.target_email })),
  };
}
