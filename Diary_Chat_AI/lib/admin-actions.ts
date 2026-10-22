import { getDb } from './database';
import { purgeAccountData } from './account-access';

const operations = ['pause', 'resume', 'block', 'delete'];

export async function manageAccount(provider: any, adminId: string, input: any) {
  const id = String(input.id || ''), action = String(input.action || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !operations.includes(action))
    throw new Error('Invalid account action.');
  if (id === adminId || id === process.env.ADMIN_USER_ID)
    throw new Error('The developer account is protected.');

  const db = getDb();
  const { data: existingData } = await db.from('account_access').select('state,target_email').eq('id', id).maybeSingle();
  let existing = existingData;

  if (existing?.state === 'deleted') {
    if (action === 'delete') return { ok: true, message: 'Account already deleted.' };
    throw new Error('This account has been deleted.');
  }

  const lookup = await provider.getUserById(id);
  const missing = lookup.error && (lookup.error.status === 404 || lookup.error.code === 'user_not_found');
  if (lookup.error && !(action === 'delete' && existing?.state === 'deleting' && missing))
    throw new Error('Could not verify the target account. Please retry.');
  const user = lookup.data?.user;
  if (!user && !(action === 'delete' && existing?.state === 'deleting' && missing))
    throw new Error('Account not found.');

  const email = String(user?.email || existing?.target_email || '').toLowerCase();
  if (action === 'delete' && String(input.confirmation || '').trim().toLowerCase() !== (email || id))
    throw new Error('Type the account email exactly to confirm deletion.');

  // Re-read after remote lookup to detect concurrent state changes.
  const { data: refetchedData } = await db.from('account_access').select('state,target_email').eq('id', id).maybeSingle();
  existing = refetchedData;
  if ((existing?.state === 'deleting' || existing?.state === 'deleted') && action !== 'delete')
    throw new Error('Deletion is in progress or complete. Access cannot be restored.');

  const state = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : action === 'block' ? 'blocked' : 'deleting';

  await db.from('account_access').upsert(
    { id, state, target_email: action === 'delete' ? email : '', updated: Date.now() },
    { onConflict: 'id' }
  );
  await db.from('admin_audit').insert({ actor: adminId, target: id, action: action === 'delete' ? 'delete_started' : action, created: Date.now() });

  if (action !== 'delete') {
    return {
      ok: true,
      message: action === 'resume' ? 'Account access restored.' : action === 'pause' ? 'Account access paused until you resume it.' : 'Account blocked until you explicitly unblock it.',
    };
  }

  try {
    if (!missing) {
      const result = await provider.deleteUser(id, false);
      if (result.error && result.error.status !== 404 && result.error.code !== 'user_not_found')
        throw new Error('Provider deletion failed.');
    }
    await purgeAccountData(id);
    await db.from('admin_audit').insert({ actor: adminId, target: id, action: 'delete_completed', created: Date.now() });
    return { ok: true, message: 'Account and its app data deleted.' };
  } catch {
    return { ok: false, pending: true, message: 'Access is blocked, but deletion is not complete. Use Retry deletion to finish. No success has been recorded.' };
  }
}
