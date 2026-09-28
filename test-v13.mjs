import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createApplication} from './server.mjs';
import {openDatabase} from './db.mjs';
import {monthDetails,reminderParts,occursOn,nextOccurrence,shanghaiClock} from './calendar.mjs';
import {createReminderWorker} from './reminders.mjs';

test('注册验证、双人上限、账本隔离、邮箱配置和年度提醒',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-v13-')),messages=[];
 const mailer={ready:true,async send(message){messages.push(message);}};
 const {server,db,worker}=createApplication({dataDir:dir,mailer});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 async function call(url,method='GET',data,cookie=''){const r=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
 async function code(email,purpose='register',cookie='',password=''){const r=await call('/api/email/code','POST',{email,purpose,password},cookie);assert.equal(r.status,200,JSON.stringify(r.data));const m=messages.findLast(m=>m.to===email);assert.match(m.text,/^\d{6}$/);assert.equal(m.subject,m.text);assert.equal(m.to,email);return m.text;}
 const password='a-long-secret-password';
 async function signup(name,email,ledger_code){return call('/api/register','POST',{name,email,ledger_code,password,code:await code(email)});}
 try{
  const alice=await signup('alice','alice@example.com','OUR-SECRET-BOOK-A');assert.equal(alice.status,200);assert.equal(alice.data.members.length,1);
  const bob=await signup('bob','bob@example.com','our-secret-book-a');assert.equal(bob.status,200);assert.equal(bob.data.members.length,2);
  const third=await signup('third','third@example.com','OUR-SECRET-BOOK-A');assert.equal(third.status,409);
  assert.equal((await call('/api/register','POST',{name:'again',email:'alice@example.com',password,ledger_code:'SOME-OTHER-BOOK',code:'000000'},alice.cookie)).status,409);
  assert.equal((await call('/api/email/code','POST',{email:'alice@example.com',purpose:'register'})).status,429);
  const outsider=await signup('outsider','outside@example.com','OUR-SECRET-BOOK-B');assert.equal(outsider.status,200);
  const concurrentCodes=await Promise.all([code('join-one@example.com'),code('join-two@example.com')]);
  const concurrent=await Promise.all(['join-one','join-two'].map((name,i)=>call('/api/register','POST',{name,email:name+'@example.com',ledger_code:'OUR-SECRET-BOOK-B',password,code:concurrentCodes[i]})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const entry={day:'2026-02-17',title:'一起度过的春节',body:'只有两个人的回忆',photos:[{data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='}]};
  const memory=await call('/api/memories','POST',entry,alice.cookie);assert.equal(memory.status,200);
  const shared=(await call('/api/timeline','GET',undefined,bob.cookie)).data;assert.equal(shared.length,1);
  assert.deepEqual((await call('/api/timeline','GET',undefined,outsider.cookie)).data,[]);
  assert.equal((await call('/api/photos/'+shared[0].photos[0],'GET',undefined,outsider.cookie)).status,404);
  assert.equal((await call('/api/memories','POST',{...entry,id:memory.data.id},outsider.cookie)).status,404);
  assert.equal((await call('/api/memories/'+memory.data.id,'DELETE',{},outsider.cookie)).status,404);
  assert.equal((await call('/api/reminders','POST',{title:'相伴的日子',base_day:'2026-02-17',kind:'lunar',enabled:true},alice.cookie)).status,200);
  const reminders=(await call('/api/reminders?month=2026-02','GET',undefined,bob.cookie)).data;assert.equal(reminders[0].month,1);assert.equal(reminders[0].day,1);assert.deepEqual(reminders[0].dates,['2026-02-17']);
  assert.deepEqual((await call('/api/reminders','GET',undefined,outsider.cookie)).data,[]);
  assert.equal((await call('/api/reminders','POST',{...reminders[0],enabled:false},outsider.cookie)).status,404);
  assert.equal((await call('/api/reminders/'+reminders[0].id,'DELETE',{},outsider.cookie)).status,404);
  const feb=(await call('/api/calendar?month=2026-02','GET',undefined,alice.cookie)).data;assert.ok(feb.days.find(d=>d.day==='2026-02-17').festivals.includes('春节'));
  let count=messages.length;await worker.run(new Date('2026-02-17T00:59:00Z'));assert.equal(messages.length,count);
  await worker.run(new Date('2026-02-17T01:00:00Z'));assert.equal(messages.length,count+2);assert.match(messages.at(-1).text,/很温柔的心意/);
  await worker.run(new Date('2026-02-17T02:00:00Z'));await createReminderWorker(db,mailer).run(new Date('2026-02-17T03:00:00Z'));assert.equal(messages.length,count+2);
  assert.equal((await call('/api/profile','POST',{email:'bob@example.com',email_enabled:false},bob.cookie)).status,200);
  const binding=await code('alice-new@example.com','bind',alice.cookie,password);
  assert.equal((await call('/api/profile','POST',{email:'alice-new@example.com',email_enabled:true,password,code:binding},bob.cookie)).status,400);
  assert.equal((await call('/api/profile','POST',{email:'alice-new@example.com',email_enabled:true,password,code:binding},alice.cookie)).status,200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM verification WHERE email='alice-new@example.com'").get().n,0);
  count=messages.length;await worker.run(new Date('2027-02-06T01:00:00Z'));assert.equal(messages.length,count+1);assert.equal(messages.at(-1).to,'alice-new@example.com');
  const failureWorker=createReminderWorker(db,{ready:true,async send(){throw Error('test mail failure');}});
  for(const time of ['2028-01-26T01:00:00Z','2028-01-26T01:01:00Z','2028-01-26T01:16:00Z','2028-01-26T01:32:00Z','2028-01-26T02:00:00Z'])await failureWorker.run(new Date(time));
  assert.equal(db.prepare("SELECT attempts FROM deliveries WHERE day='2028-01-26'").get().attempts,3);
  const expiring=await code('expired@example.com');db.prepare("UPDATE verification SET expires=0 WHERE email='expired@example.com'").run();
  assert.equal((await call('/api/register','POST',{name:'expired',email:'expired@example.com',ledger_code:'NEW-SECRET-BOOK',password,code:expiring})).status,400);
  const guessing=await code('guess@example.com');for(let i=0;i<5;i++)assert.equal((await call('/api/register','POST',{name:'guess',email:'guess@example.com',ledger_code:'NEW-SECRET-BOOK',password,code:guessing==='111111'?'222222':'111111'})).status,400);
  assert.equal((await call('/api/register','POST',{name:'guess',email:'guess@example.com',ledger_code:'NEW-SECRET-BOOK',password,code:guessing})).status,400);
  assert.throws(()=>db.prepare('UPDATE users SET ledger_id=? WHERE id=?').run(outsider.data.id,alice.data.id));
  const salt='test';assert.throws(()=>db.prepare('INSERT INTO users(name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?)').run('forbidden',scryptSync(password,salt,64).toString('hex'),salt,db.prepare('SELECT ledger_id FROM users WHERE id=?').get(alice.data.id).ledger_id,3));
 }finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('农历、节气、闰年和闰月匹配',()=>{
 assert.equal(monthDetails('2026-02').days.find(d=>d.day==='2026-02-04').term,'立春');
 assert.equal(monthDetails('2026-02').days.find(d=>d.day==='2026-02-17').lunar,'正月初一');
 assert.equal(monthDetails('2099-01').holiday_known,false);
 const r={base_day:'2028-02-29',kind:'solar',month:2,day:29};assert.equal(nextOccurrence(r,'2029-01-01'),'2032-02-29');
 const lunar={base_day:'2026-02-17',kind:'lunar',...reminderParts('2026-02-17','lunar')};assert.equal(nextOccurrence(lunar,'2027-01-01'),'2027-02-06');assert.equal(occursOn(lunar,'2027-02-17'),false);
 assert.deepEqual(shanghaiClock(new Date('2026-12-31T16:30:00Z')),{day:'2027-01-01',hour:0});
 const leap={base_day:'2026-01-01',kind:'lunar',month:-2,day:1};assert.equal(occursOn(leap,'2026-03-19'),false);const next=nextOccurrence(leap,'2026-01-01');assert.ok(next);assert.equal(reminderParts(next,'lunar').month,-2);
});

test('旧双人数据库迁移保留账号、会话、回忆、图片并生成备份',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-migrate-'));let db=new DatabaseSync(path.join(dir,'calendar.sqlite'));
 try{
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY CHECK(id IN(1,2)),name TEXT UNIQUE,hash TEXT,salt TEXT);
  CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER);
  CREATE TABLE memories(id INTEGER PRIMARY KEY,day TEXT,title TEXT,body TEXT,author INTEGER REFERENCES users(id),updated INTEGER);
  CREATE TABLE photos(id TEXT PRIMARY KEY,memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,mime TEXT,data BLOB);
  INSERT INTO users VALUES(1,'old-one','hash','salt'),(2,'old-two','hash','salt');
  INSERT INTO sessions VALUES('token',1,9999999999999);
  INSERT INTO memories VALUES(1,'2026-01-01','旧回忆','保留我',1,0);
  INSERT INTO photos VALUES('photo',1,'image/png',X'0102');`);db.close();db=openDatabase(dir);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,2);assert.equal(db.prepare('SELECT ledger_id FROM memories').get().ledger_id,1);assert.equal(db.prepare('SELECT body FROM memories').get().body,'保留我');assert.equal(db.prepare('SELECT token FROM sessions').get().token,'token');assert.equal(db.prepare('SELECT length(data) AS n FROM photos').get().n,2);assert.equal(readdirSync(dir).filter(x=>x.startsWith('before-v1.3-')).length,1);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.close();db=openDatabase(dir);assert.equal(readdirSync(dir).filter(x=>x.startsWith('before-v1.3-')).length,1);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
