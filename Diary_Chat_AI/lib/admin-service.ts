import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {getDatabase} from './database';
import {loadAllAccounts,summarizeAccount,directoryView} from './admin-directory';
export function adminProvider(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw Error('Admin account directory setup is pending. Configure SUPABASE_SECRET_KEY on the server.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export async function getDirectory(params:URLSearchParams){
 const client=adminProvider();
 const users=await loadAllAccounts(p=>client.auth.admin.listUsers(p));
 const profiles=new Map<string,any>();
 const db=getDatabase();
 for(let i=0;i<users.length;i+=400){const ids=users.slice(i,i+400).map(u=>u.id);if(!ids.length)continue;
  const rows=db.prepare('SELECT id,username,name,country,language,timezone FROM profiles WHERE id IN ('+ids.map(()=>'?').join(',')+')').all(...ids);
  for(const row of rows)profiles.set(String(row.id),row);
 }
 const access=new Map(db.prepare('SELECT id,state FROM account_access').all().map(r=>[String(r.id),String(r.state)]));
 return {...directoryView(users.map(u=>({...summarizeAccount(u,profiles.get(u.id)),access:access.get(u.id)||'active',protected:u.id===process.env.ADMIN_USER_ID})),params),pendingDeletions:db.prepare("SELECT id,target_email AS email FROM account_access WHERE state='deleting' ORDER BY updated").all()};
}
