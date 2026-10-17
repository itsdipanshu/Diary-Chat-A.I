import {getDatabase} from './database';
export function accessState(id:string):string{return String(getDatabase().prepare('SELECT state FROM account_access WHERE id=?').get(id)?.state||'active');}
export function ensureActive(id:string){if(accessState(id)!=='active')throw Error('Your account access is restricted. Contact the app administrator.');}
export function purgeAccountData(userId:string){
 const db=getDatabase();
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('DELETE FROM records WHERE owner=?').run(userId);
  db.prepare('DELETE FROM credentials WHERE owner=?').run(userId);
  db.prepare('DELETE FROM messages WHERE sender=? OR recipient=?').run(userId,userId);
  db.prepare('DELETE FROM chat_contacts WHERE owner=? OR peer=?').run(userId,userId);
  db.prepare('DELETE FROM chat_pins WHERE owner=? OR peer=?').run(userId,userId);
  db.prepare('DELETE FROM chat_requests WHERE sender=? OR recipient=?').run(userId,userId);
  db.prepare('DELETE FROM profiles WHERE id=?').run(userId);
  db.prepare("INSERT INTO account_access(id,state,target_email,updated) VALUES(?,'deleted','',?) ON CONFLICT(id) DO UPDATE SET state='deleted',target_email='',updated=excluded.updated").run(userId,Date.now());
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
let lastSync=0;
export async function syncGhostProfiles(){
 const now=Date.now();
 if(now-lastSync<10000||!process.env.SUPABASE_SECRET_KEY||!process.env.NEXT_PUBLIC_SUPABASE_URL)return;
 lastSync=now;
 try{
  const {createClient}=await import('@supabase/supabase-js');
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
  const {data,error}=await admin.auth.admin.listUsers({perPage:1000});
  if(error||!data?.users)return;
  const activeIds=new Set(data.users.map(u=>u.id));
  const db=getDatabase();
  const localProfiles=db.prepare('SELECT id FROM profiles').all();
  for(const p of localProfiles){
   const pid=String(p.id);
   if(!activeIds.has(pid)){
    purgeAccountData(pid);
   }
  }
 }catch{}
}
