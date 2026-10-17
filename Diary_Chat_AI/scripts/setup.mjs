import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(existsSync('.env.local')){console.log('.env.local already exists; left unchanged.');}else{const template=readFileSync('.env.example','utf8').replace(/^KEY_ENCRYPTION_SECRET=$/m,'KEY_ENCRYPTION_SECRET='+randomBytes(32).toString('hex'));writeFileSync('.env.local',template,{mode:0o600});console.log('Created .env.local with a private encryption secret. Add Supabase settings; keep this file private.');}
