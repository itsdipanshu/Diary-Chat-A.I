import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Singleton admin client (server-only, never exposed to browser) ────────────
let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('DATABASE_URL not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.');
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
  });
  return _client;
}

// ── Lightweight query helpers ─────────────────────────────────────────────────
// These mirror the old D1/SQLite `DB` interface so call-sites need minimal edits.
//
// Usage:
//   const row  = await DB.from('profiles').select('*').eq('id', id).single()
//   const rows = await DB.from('profiles').select('*').eq('owner', id)
//
// For complex multi-table queries use getDb() directly.

export const DB = {
  from: (table: string) => getDb().from(table),
};
