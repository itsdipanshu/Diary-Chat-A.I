import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'diary-import-')),database=join(dir,'target.sqlite'),source=join(dir,'export.json'),map=join(dir,'map.json');
writeFileSync(source,JSON.stringify({profiles:[{id:'old',username:'alice',name:'Alice'}],records:[{id:'record',owner:'old',kind:'diary',data:{body:'Test'},updated:1}],messages:[{id:'message',sender:'old',recipient:'unmapped',body:'Private',created:1}]}));writeFileSync(map,JSON.stringify({old:'12345678-1234-1234-1234-123456789abc'}));
const run=()=>spawnSync(process.execPath,['scripts/migrate-data.mjs',source,map],{env:{...process.env,DATABASE_PATH:database},encoding:'utf8'});
try{const first=run();assert.equal(first.status,0,first.stderr);let db=new DatabaseSync(database);assert.equal(db.prepare('SELECT owner FROM records').get().owner,'12345678-1234-1234-1234-123456789abc');assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n,0);db.close();assert.notEqual(run().status,0);db=new DatabaseSync(database);assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,1);db.close();console.log('Migration passed: owner remapping, unmapped chat exclusion, duplicate refusal and rollback. Synthetic data only.');}finally{rmSync(dir,{recursive:true});}
