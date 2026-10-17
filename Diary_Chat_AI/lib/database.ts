import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
let database:DatabaseSync;
export function getDatabase(){
 if(database)return database;
 const filename=resolve(process.env.DATABASE_PATH||'data/diary.sqlite');mkdirSync(dirname(filename),{recursive:true});database=new DatabaseSync(filename);
 database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 const exists=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'").get();
 if(!exists)database.exec(readFileSync(resolve('drizzle/0000_nice_lilith.sql'),'utf8'));
 const columns=database.prepare('PRAGMA table_info(profiles)').all();
 for(const name of ['country','language','timezone'])if(!columns.some(c=>c.name===name))database.exec(`ALTER TABLE profiles ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
 database.exec("CREATE TABLE IF NOT EXISTS account_access (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('active','paused','blocked','deleting','deleted')), target_email TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS chat_requests (id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), created INTEGER NOT NULL, updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS chat_pins (owner TEXT NOT NULL, peer TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (owner, peer)); CREATE TABLE IF NOT EXISTS chat_contacts (owner TEXT NOT NULL, peer TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (owner, peer)); CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender, recipient);");
 return database;
}
// Preserve the parameterized D1 query interface while moving to a persistent Node host.
export const DB={prepare(sql:string){return {bind(...args:any[]){return {async first(){return getDatabase().prepare(sql).get(...args)||null;},async all(){return {results:getDatabase().prepare(sql).all(...args)};},async run(){return getDatabase().prepare(sql).run(...args);}};}};}};
