import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SECRET_KEY?.trim();
if(!email||!url||!key)throw Error('Set ADMIN_EMAIL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the server environment first.');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
let matches=[],complete=false;
for(let page=1;page<=50;page++){
 const {data,error}=await client.auth.admin.listUsers({page,perPage:1000});
 if(error)throw Error('Could not read accounts. Check the server Supabase secret key.');
 matches.push(...data.users.filter(u=>u.email?.toLowerCase()===email));
 if(data.users.length<1000){complete=true;break;}
}
if(!complete)throw Error('Directory too large for automatic binding. Verify the UUID manually in Supabase.');
if(matches.length!==1||!matches[0].email_confirmed_at)throw Error('Exactly one verified account must match ADMIN_EMAIL. Sign up and verify that email first.');
const id=matches[0].id;
if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Unexpected user ID.');
if(process.env.ADMIN_USER_ID&&process.env.ADMIN_USER_ID!==id)throw Error('An existing admin ID differs. No change made; review the server configuration manually.');
if(!existsSync('.env.local')){console.log('Verified account. Set ADMIN_USER_ID='+id+' in your hosting environment and restart.');}
else{const source=readFileSync('.env.local','utf8');const next=/^ADMIN_USER_ID=.*$/m.test(source)?source.replace(/^ADMIN_USER_ID=.*$/m,'ADMIN_USER_ID='+id):source+'\nADMIN_USER_ID='+id+'\n';writeFileSync('.env.local',next,{mode:0o600});console.log('Verified admin account bound in .env.local. Restart the app. For hosted deployment set ADMIN_USER_ID='+id+' in the server environment.');}
