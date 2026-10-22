import { sameOrigin } from '../../../../lib/auth-validation';
import { manageAccount } from '../../../../lib/admin-actions';
import { getUser } from '../../../../lib/supabase/server';
import { isAdmin } from '../../../../lib/admin-access';
import { getDirectory, adminProvider } from '../../../../lib/admin-service';

export const dynamic = 'force-dynamic';

const reply = (body: any, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });

export async function GET(req: Request) {
  try {
    const user = await getUser();
    if (!user) return reply({ error: 'Please sign in.' }, 401);
    if (!isAdmin(user)) return reply({ error: 'Access denied.' }, 403);
    return reply(await getDirectory(new URL(req.url).searchParams));
  } catch {
    return reply({ error: 'The account directory could not be loaded. Check the server admin configuration and try again.' }, 503);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req.headers.get('origin'))) return reply({ error: 'Invalid origin.' }, 403);
    const user = await getUser();
    if (!user) return reply({ error: 'Please sign in.' }, 401);
    if (!isAdmin(user)) return reply({ error: 'Access denied.' }, 403);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: 'Request too large.' }, 413);
    const result = await manageAccount(adminProvider().auth.admin, user.userId, JSON.parse(raw));
    return reply(result, result.pending ? 503 : 200);
  } catch {
    return reply({ error: 'Action could not be completed. Check the selected account and confirmation, then refresh. The developer account is protected.' }, 400);
  }
}
