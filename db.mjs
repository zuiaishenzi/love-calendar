import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,scryptSync} from 'node:crypto';

const userSchema=`CREATE TABLE users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, salt TEXT NOT NULL,
 ledger_id INTEGER NOT NULL REFERENCES ledgers(id), seat INTEGER NOT NULL CHECK(seat IN (1,2)),
 email TEXT UNIQUE COLLATE NOCASE, email_enabled INTEGER NOT NULL DEFAULT 1 CHECK(email_enabled IN (0,1)),
 UNIQUE(ledger_id,seat));`;
export function openDatabase(dir) {
 mkdirSync(dir,{recursive:true});
 const db=new DatabaseSync(path.join(dir,'calendar.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
 const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
 const legacy=existing&&!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='ledger_id');
 if(legacy) {
  const backup=path.join(dir,`before-v1.3-${Date.now()}.sqlite`);
  db.prepare('VACUUM INTO ?').run(backup);
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
   db.exec('CREATE TABLE ledgers(id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);');
   db.prepare('INSERT INTO ledgers(id,code) VALUES(1,?)').run(randomBytes(12).toString('hex').toUpperCase());
   db.exec(userSchema.replace('CREATE TABLE users','CREATE TABLE users_v3'));
   db.exec(`INSERT INTO users_v3(id,name,hash,salt,ledger_id,seat) SELECT id,name,hash,salt,1,id FROM users;
    DROP TABLE users; ALTER TABLE users_v3 RENAME TO users;
    ALTER TABLE memories ADD COLUMN ledger_id INTEGER REFERENCES ledgers(id);
    UPDATE memories SET ledger_id=1;`);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}finally{db.exec('PRAGMA foreign_keys=ON');}
 }
 db.exec('CREATE TABLE IF NOT EXISTS ledgers(id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);');
 if(!existing)db.exec(userSchema);
 db.exec(`
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER);
 CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY,day TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,author INTEGER REFERENCES users(id),updated INTEGER NOT NULL,ledger_id INTEGER NOT NULL REFERENCES ledgers(id));
 CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,mime TEXT NOT NULL,data BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS verification(email TEXT NOT NULL,purpose TEXT NOT NULL,owner INTEGER NOT NULL DEFAULT 0,digest TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,tries INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(email,purpose,owner));
 CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL REFERENCES ledgers(id),creator INTEGER REFERENCES users(id),title TEXT NOT NULL,base_day TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('solar','lunar')),month INTEGER NOT NULL,day INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
 CREATE TABLE IF NOT EXISTS deliveries(reminder_id INTEGER REFERENCES reminders(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id),day TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,error TEXT,PRIMARY KEY(reminder_id,user_id,day));
 CREATE INDEX IF NOT EXISTS memories_ledger_day ON memories(ledger_id,day);
 CREATE TRIGGER IF NOT EXISTS immutable_membership BEFORE UPDATE OF ledger_id,seat ON users BEGIN SELECT RAISE(ABORT,'membership is permanent'); END;
 CREATE TRIGGER IF NOT EXISTS memory_same_ledger_insert BEFORE INSERT ON memories WHEN NEW.ledger_id IS NULL OR NEW.ledger_id != (SELECT ledger_id FROM users WHERE id=NEW.author) BEGIN SELECT RAISE(ABORT,'invalid ledger'); END;
 CREATE TRIGGER IF NOT EXISTS memory_same_ledger_update BEFORE UPDATE OF ledger_id,author ON memories WHEN NEW.ledger_id IS NULL OR NEW.ledger_id != (SELECT ledger_id FROM users WHERE id=NEW.author) BEGIN SELECT RAISE(ABORT,'invalid ledger'); END;
 PRAGMA user_version=3;`);
 // Additive migration: retain original memory text and assign existing photos to its author.
 db.exec('BEGIN IMMEDIATE');
 try {
  if(!db.prepare('PRAGMA table_info(reminders)').all().some(c=>c.name==='recipient_id'))db.exec('ALTER TABLE reminders ADD COLUMN recipient_id INTEGER REFERENCES users(id)');
  if(!db.prepare('PRAGMA table_info(reminders)').all().some(c=>c.name==='private_owner'))db.exec('ALTER TABLE reminders ADD COLUMN private_owner INTEGER REFERENCES users(id)');
  if(!db.prepare('PRAGMA table_info(photos)').all().some(c=>c.name==='author')){
   db.exec('ALTER TABLE photos ADD COLUMN author INTEGER REFERENCES users(id); UPDATE photos SET author=(SELECT author FROM memories WHERE memories.id=photos.memory_id)');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS perspectives(memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,author INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(memory_id,author));
   INSERT OR IGNORE INTO perspectives(memory_id,author,body,updated) SELECT id,author,body,updated FROM memories;
   PRAGMA user_version=4;`);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 // Optional bootstrap for an explicitly configured private installation or isolated preview.
 if(!db.prepare('SELECT id FROM users LIMIT 1').get() && process.env.USER1_NAME) {
  for(const n of [1,2])if(!process.env[`USER${n}_NAME`]||String(process.env[`USER${n}_PASSWORD`]||'').length<12)throw Error('预设账号须配置两组不同用户名及至少12位密码');
  db.exec('BEGIN IMMEDIATE');
  try {
   const id=Number(db.prepare('INSERT INTO ledgers(code) VALUES(?)').run(randomBytes(12).toString('hex').toUpperCase()).lastInsertRowid);
   for(const seat of [1,2]){const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO users(name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?)').run(process.env[`USER${seat}_NAME`],scryptSync(process.env[`USER${seat}_PASSWORD`],salt,64).toString('hex'),salt,id,seat);}
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('数据库外键检查失败');
 return db;
}
