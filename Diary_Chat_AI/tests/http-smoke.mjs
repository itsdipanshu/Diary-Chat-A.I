import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=3197,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,APP_URL:base,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
try{
 let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(base+'/login');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,log);
 let r=await fetch(base,{redirect:'manual'});assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/login');
 r=await fetch(base+'/login');const html=await r.text();assert.equal(r.status,200);for(const text of ['Welcome back','Continue with Google','Create account','setup is pending'])assert(html.includes(text),text);assert.match(r.headers.get('cache-control'),/no-store/);
 r=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'load'})});assert.equal(r.status,401);
 r=await fetch(base+'/auth/update-password',{redirect:'manual'});assert.equal(r.status,307);
 r=await fetch(base+'/api/auth',{method:'POST',headers:{origin:'https://evil.test'},body:JSON.stringify({action:'login'})});assert.equal(r.status,403);
 r=await fetch(base+'/api/admin/users');assert.equal(r.status,401);
 r=await fetch(base+'/admin',{redirect:'manual'});assert.equal(r.status,307);
 console.log('Production HTTP smoke passed: login render, configuration disclosure, cache headers, root redirect, anonymous API rejection, password route protection and auth origin rejection.');
}finally{server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
