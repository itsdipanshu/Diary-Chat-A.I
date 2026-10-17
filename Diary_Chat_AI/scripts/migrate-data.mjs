// Offline import: node scripts/migrate-data.mjs exported-rows.json identity-map.json
// No passwords or AI credentials are imported. Users reconnect AI providers themselves.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,copyFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const [source,mapFile]=process.argv.slice(2);if(!source||!mapFile)throw Error('Usage: node scripts/migrate-data.mjs export.json identity-map.json');
const data=JSON.parse(readFileSync(source,'utf8')),mapping=JSON.parse(readFileSync(mapFile,'utf8'));
const destination=resolve(process.env.DATABASE_PATH||'data/diary.sqlite');mkdirSync(dirname(destination),{recursive:true});
// Run with the application stopped. Refuse copying a database with a live WAL.
if(existsSync(destination+'-wal'))throw Error('Stop the app and checkpoint/close the database before importing.');
if(existsSync(destination))copyFileSync(destination,destination+'.backup-'+Date.now());
const db=new DatabaseSync(destination);if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'").get()){db.exec(readFileSync('drizzle/0000_nice_lilith.sql','utf8'));}
const cols=db.prepare('PRAGMA table_info(profiles)').all();for(const col of ['country','language','timezone'])if(!cols.some(c=>c.name===col))db.exec(`ALTER TABLE profiles ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for(const id of Object.values(mapping))if(!uuid.test(id))throw Error('Map each old user ID to a verified Supabase user UUID.');
const counts={profiles:0,records:0,messages:0,skipped:0};db.exec('BEGIN IMMEDIATE');try{
 for(const p of data.profiles||[]){const owner=mapping[p.id];if(!owner){counts.skipped++;continue;}db.prepare('INSERT INTO profiles(id,username,name,bio,avatar,country,language,timezone) VALUES(?,?,?,?,?,?,?,?)').run(owner,p.username,p.name,p.bio||'',p.avatar||'',p.country||'',p.language||'',p.timezone||'');counts.profiles++;}
 for(const r of data.records||[]){const owner=mapping[r.owner];if(!owner){counts.skipped++;continue;}if(!['diary','calendar','brand'].includes(r.kind))throw Error('Invalid record kind');const value=typeof r.data==='string'?r.data:JSON.stringify(r.data);JSON.parse(value);db.prepare('INSERT INTO records(id,owner,kind,data,updated) VALUES(?,?,?,?,?)').run(r.id,owner,r.kind,value,r.updated);counts.records++;}
 for(const m of data.messages||[]){const sender=mapping[m.sender],recipient=mapping[m.recipient];if(!sender||!recipient){counts.skipped++;continue;}db.prepare('INSERT INTO messages(id,sender,recipient,body,created) VALUES(?,?,?,?,?)').run(m.id,sender,recipient,m.body,m.created);counts.messages++;}
 db.exec('COMMIT');console.log(counts);
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
