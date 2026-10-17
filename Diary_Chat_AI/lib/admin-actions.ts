import type {DatabaseSync} from 'node:sqlite';
import {purgeAccountData} from './account-access';
const operations=['pause','resume','block','delete'];
export async function manageAccount(db:DatabaseSync,provider:any,adminId:string,input:any){
 const id=String(input.id||''),action=String(input.action||'');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!operations.includes(action))throw Error('Invalid account action.');
 if(id===adminId||id===process.env.ADMIN_USER_ID)throw Error('The developer account is protected.');
 let existing=db.prepare('SELECT state,target_email FROM account_access WHERE id=?').get(id);
 if(existing?.state==='deleted'){if(action==='delete')return {ok:true,message:'Account already deleted.'};throw Error('This account has been deleted.');}
 const lookup=await provider.getUserById(id);
 const missing=lookup.error&&(lookup.error.status===404||lookup.error.code==='user_not_found');
 if(lookup.error&&!(action==='delete'&&existing?.state==='deleting'&&missing))throw Error('Could not verify the target account. Please retry.');
 const user=lookup.data?.user;
 if(!user&&!(action==='delete'&&existing?.state==='deleting'&&missing))throw Error('Account not found.');
 const email=String(user?.email||existing?.target_email||'').toLowerCase();
 if(action==='delete'&&String(input.confirmation||'').trim().toLowerCase()!==(email||id))throw Error('Type the account email exactly to confirm deletion.');
 // Re-read after the remote lookup; never resume a concurrently deleting account.
 existing=db.prepare('SELECT state,target_email FROM account_access WHERE id=?').get(id);
 if((existing?.state==='deleting'||existing?.state==='deleted')&&action!=='delete')throw Error('Deletion is in progress or complete. Access cannot be restored.');
 const event=(name:string)=>db.prepare('INSERT INTO admin_audit(actor,target,action,created) VALUES(?,?,?,?)').run(adminId,id,name,Date.now());
 const state=action==='pause'?'paused':action==='resume'?'active':action==='block'?'blocked':'deleting';
 db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO account_access(id,state,target_email,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,target_email=excluded.target_email,updated=excluded.updated').run(id,state,action==='delete'?email:'',Date.now());event(action==='delete'?'delete_started':action);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 if(action!=='delete')return {ok:true,message:action==='resume'?'Account access restored.':action==='pause'?'Account access paused until you resume it.':'Account blocked until you explicitly unblock it.'};
 try{
  if(!missing){const result=await provider.deleteUser(id,false);if(result.error&&result.error.status!==404&&result.error.code!=='user_not_found')throw Error('Provider deletion failed.');}
  purgeAccountData(id);
   event('delete_completed');
  return {ok:true,message:'Account and its app data deleted.'};
 }catch{return {ok:false,pending:true,message:'Access is blocked, but deletion is not complete. Use Retry deletion to finish. No success has been recorded.'};}
}
