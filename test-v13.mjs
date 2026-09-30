import sharp from 'sharp';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createApplication} from './server.mjs';
import {openDatabase} from './db.mjs';
import {validDay,monthDetails,reminderParts,occursOn,nextOccurrence,shanghaiClock} from './calendar.mjs';
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
  const shortInput={name:'shortpass',email:'short@example.com',ledger_code:'BOOK1234',password:'12345678',code:await code('short@example.com')};
  assert.equal((await call('/api/register','POST',{...shortInput,password:'1234567'})).status,400);
  assert.equal((await call('/api/register','POST',{...shortInput,ledger_code:'BOOK123'})).status,400);
  assert.equal((await call('/api/register','POST',shortInput)).status,200);
  assert.equal((await call('/api/login','POST',{name:'shortpass',password:'12345678'})).status,200);
  const alice=await signup('alice','alice@example.com','OUR-SECRET-BOOK-A');assert.equal(alice.status,200);assert.equal(alice.data.members.length,1);
  const bob=await signup('bob','bob@example.com','our-secret-book-a');assert.equal(bob.status,200);assert.equal(bob.data.members.length,2);
  const third=await signup('third','third@example.com','OUR-SECRET-BOOK-A');assert.equal(third.status,409);
  assert.equal((await call('/api/register','POST',{name:'again',email:'alice@example.com',password,ledger_code:'SOME-OTHER-BOOK',code:'000000'},alice.cookie)).status,409);
  assert.equal((await call('/api/email/code','POST',{email:'alice@example.com',purpose:'register'})).status,429);
  const outsider=await signup('outsider','outside@example.com','OUR-SECRET-BOOK-B');assert.equal(outsider.status,200);
  const concurrentCodes=await Promise.all([code('join-one@example.com'),code('join-two@example.com')]);
  const concurrent=await Promise.all(['join-one','join-two'].map((name,i)=>call('/api/register','POST',{name,email:name+'@example.com',ledger_code:'OUR-SECRET-BOOK-B',password,code:concurrentCodes[i]})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  // Real HTTP event streams: immediate presence, adaptive intervals and ledger isolation.
  const streams=[];
  async function stream(cookie,client){
   const controller=new AbortController();streams.push(controller);
   const response=await fetch(origin+'/api/events?client='+client,{headers:{Cookie:cookie},signal:controller.signal});assert.equal(response.status,200);
   const reader=response.body.getReader();let buffer='';
   async function next(){for(;;){const end=buffer.indexOf('\n\n');if(end>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split('\n').find(x=>x.startsWith('data: '));if(data)return JSON.parse(data.slice(6));continue;}const chunk=await reader.read();if(chunk.done)throw Error('stream ended');buffer+=new TextDecoder().decode(chunk.value);}}
   return {next};
  }
  try{
   const ca='alice-presence-client',cb='bob-presence-client';
   const sa=await stream(alice.cookie,ca),sb=await stream(bob.cookie,cb);
   assert.equal((await sa.next()).interval,24000);const initial=await sb.next();assert.equal(initial.peer,null);
   let pulse=await call('/api/presence','POST',{client:ca,day:'2026-09-17'},alice.cookie);assert.equal(pulse.data.interval,15000);
   assert.equal((await sb.next()).peer.day,'2026-09-17');await sa.next();
   pulse=await call('/api/presence','POST',{client:cb,day:'2026-09-29'},bob.cookie);assert.equal(pulse.data.interval,12000);
   assert.equal((await sa.next()).peer.name,'bob');await sb.next();
   assert.equal((await call('/api/presence','POST',{client:ca,day:null},outsider.cookie)).status,403);
   assert.equal((await call('/api/presence','POST',{client:'outsider-presence-client',day:null},outsider.cookie)).data.peer,null);
   const change=await call('/api/memories','POST',{day:'2026-09-17',title:'推送测试',body:'更新',photos:[]},alice.cookie);
   assert.notEqual((await sa.next()).revision,initial.revision);assert.notEqual((await sb.next()).revision,initial.revision);
   await call('/api/memories/'+change.data.id,'DELETE',{},alice.cookie);await sa.next();await sb.next();
   await call('/api/presence','POST',{client:ca,day:null},alice.cookie);assert.equal((await sb.next()).peer,null);await sa.next();
   await call('/api/presence','POST',{client:cb,day:null},bob.cookie);assert.equal((await sa.next()).interval,24000);await sb.next();
  }finally{for(const controller of streams)controller.abort();}
  const entry={day:'2026-02-17',title:'一起度过的春节',body:'只有两个人的回忆',photos:[{data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='}]};
  const memory=await call('/api/memories','POST',entry,alice.cookie);assert.equal(memory.status,200);
  const shared=(await call('/api/timeline','GET',undefined,bob.cookie)).data;assert.equal(shared.length,1);
  assert.deepEqual((await call('/api/timeline','GET',undefined,outsider.cookie)).data,[]);
  assert.equal((await call('/api/photos/'+shared[0].photos[0],'GET',undefined,outsider.cookie)).status,404);
  assert.equal((await call('/api/memories','POST',{...entry,id:memory.data.id},outsider.cookie)).status,404);
  assert.equal((await call('/api/memories/'+memory.data.id,'DELETE',{},outsider.cookie)).status,404);
  const pixels=Buffer.alloc(2160*1440*3);for(let i=0;i<pixels.length;i++)pixels[i]=(i*31+(i>>8))%256;
  const original=await sharp(pixels,{raw:{width:2160,height:1440,channels:3}}).jpeg({quality:90}).toBuffer();
  const photoMemory=await call('/api/memories','POST',{...entry,title:'缩略图测试',photos:[{data:original.toString('base64')}]},alice.cookie);
  const photoRow=(await call('/api/timeline','GET',undefined,alice.cookie)).data.find(r=>r.id===photoMemory.data.id);
  const photoUrl=origin+'/api/photos/'+photoRow.photos[0];
  const thumbResponse=await fetch(photoUrl+'?size=thumb',{headers:{Cookie:alice.cookie}});
  assert.equal(thumbResponse.status,200);assert.equal(thumbResponse.headers.get('cache-control'),'private, no-cache');
  const thumb=Buffer.from(await thumbResponse.arrayBuffer()),metadata=await sharp(thumb).metadata();
  assert.equal(metadata.format,'webp');assert.ok(metadata.width<=640&&metadata.height<=640);assert.ok(thumb.length<original.length);
  console.log(`Thumbnail benchmark: ${original.length} -> ${thumb.length} bytes (${(100*(1-thumb.length/original.length)).toFixed(1)}% smaller)`);
  const etag=thumbResponse.headers.get('etag');
  assert.equal((await fetch(photoUrl+'?size=thumb',{headers:{Cookie:alice.cookie,'If-None-Match':etag}})).status,304);
  assert.equal((await fetch(photoUrl+'?size=thumb',{headers:{Cookie:outsider.cookie,'If-None-Match':etag}})).status,404);
  assert.equal((await fetch(photoUrl+'?size=thumb',{headers:{'If-None-Match':etag}})).status,401);
  const full=await fetch(photoUrl,{headers:{Cookie:alice.cookie}});assert.deepEqual(Buffer.from(await full.arrayBuffer()),original);
  assert.notEqual(full.headers.get('etag'),etag);
  await call('/api/memories/'+photoMemory.data.id,'DELETE',{},alice.cookie);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM thumbnails WHERE photo_id=?').get(photoRow.photos[0]).n,0);
  assert.equal((await fetch(photoUrl+'?size=thumb',{headers:{Cookie:alice.cookie,'If-None-Match':etag}})).status,404);
  // Each partner owns their perspective and photographs, even if a request spoofs an author.
  assert.equal((await call('/api/memories','POST',{...entry,id:memory.data.id,author:alice.data.id,body:'我记得那天的阳光',photos:entry.photos},bob.cookie)).status,200);
  let dialog=(await call('/api/timeline','GET',undefined,alice.cookie)).data[0];
  assert.equal(dialog.perspectives.length,2);
  assert.equal(dialog.perspectives.find(p=>p.author===alice.data.id).body,entry.body);
  assert.equal(dialog.perspectives.find(p=>p.author===bob.data.id).body,'我记得那天的阳光');
  const alicePhoto=dialog.perspectives.find(p=>p.author===alice.data.id).photos[0];
  const bobPhoto=dialog.perspectives.find(p=>p.author===bob.data.id).photos[0];
  assert.equal((await call('/api/memories','POST',{...entry,id:memory.data.id,body:'补充我的感受',photos:[],keepPhotos:[]},bob.cookie)).status,200);
  dialog=(await call('/api/memories?month=2026-02','GET',undefined,alice.cookie)).data[0];
  assert.deepEqual(dialog.perspectives.find(p=>p.author===alice.data.id).photos,[alicePhoto]);
  assert.equal((await call('/api/photos/'+bobPhoto,'GET',undefined,bob.cookie)).status,404);
  assert.equal(dialog.perspectives.find(p=>p.author===alice.data.id).body,entry.body);
  // Editing the first author's contribution must not move it below the second.
  assert.equal((await call('/api/memories','POST',{...entry,id:memory.data.id,body:entry.body,photos:[],keepPhotos:[alicePhoto]},alice.cookie)).status,200);
  for(const url of ['/api/timeline','/api/memories?month=2026-02']){
   const ordered=(await call(url,'GET',undefined,bob.cookie)).data.find(r=>r.id===memory.data.id);
   assert.deepEqual(ordered.perspectives.map(p=>p.author),[alice.data.id,bob.data.id]);
  }
  const secret={title:'我的私密提醒',base_day:'2026-04-01',kind:'solar',enabled:true,private:true,recipient_id:bob.data.id};
  assert.equal((await call('/api/reminders','POST',secret,alice.cookie)).status,200);
  const privateRow=(await call('/api/reminders','GET',undefined,alice.cookie)).data.find(r=>r.title===secret.title);
  assert.equal(privateRow.private_owner,alice.data.id);assert.equal(privateRow.recipient_id,alice.data.id);
  for(const url of ['/api/reminders','/api/reminders?month=2026-04'])assert.ok(!(await call(url,'GET',undefined,bob.cookie)).data.some(r=>r.id===privateRow.id));
  assert.equal((await call('/api/reminders','POST',{...secret,id:privateRow.id,private:false},bob.cookie)).status,404);
  assert.equal((await call('/api/reminders/'+privateRow.id,'DELETE',{},bob.cookie)).status,404);
  const sentBefore=messages.length;await worker.run(new Date('2026-04-01T01:00:00Z'));
  assert.equal(messages.length,sentBefore+1);assert.equal(messages.at(-1).to,'alice@example.com');
  assert.equal((await call('/api/reminders/'+privateRow.id,'DELETE',{},alice.cookie)).status,200);
  const targeted={title:'只提醒一个人',base_day:'2026-03-01',kind:'solar',enabled:true,recipient_id:bob.data.id};
  assert.equal((await call('/api/reminders','POST',{...targeted,recipient_id:outsider.data.id},alice.cookie)).status,400);
  assert.equal((await call('/api/reminders','POST',targeted,alice.cookie)).status,200);
  const single=(await call('/api/reminders','GET',undefined,bob.cookie)).data.find(r=>r.title===targeted.title);
  assert.equal(single.recipient_id,bob.data.id);
  let before=messages.length;await worker.run(new Date('2026-03-01T01:00:00Z'));
  assert.equal(messages.length,before+1);assert.equal(messages.at(-1).to,'bob@example.com');
  await worker.run(new Date('2026-03-01T02:00:00Z'));assert.equal(messages.length,before+1);
  assert.equal((await call('/api/reminders','POST',{...targeted,id:single.id,recipient_id:alice.data.id},bob.cookie)).status,200);
  await worker.run(new Date('2027-03-01T01:00:00Z'));assert.equal(messages.at(-1).to,'alice@example.com');
  await call('/api/reminders/'+single.id,'DELETE',{},alice.cookie);
  assert.equal((await call('/api/reminders','POST',{title:'相伴的日子',base_day:'2026-02-17',kind:'lunar',enabled:true},alice.cookie)).status,200);
  const reminders=(await call('/api/reminders?month=2026-02','GET',undefined,bob.cookie)).data;assert.equal(reminders[0].month,1);assert.equal(reminders[0].day,1);assert.deepEqual(reminders[0].dates,['2026-02-17']);
  assert.deepEqual((await call('/api/reminders','GET',undefined,outsider.cookie)).data,[]);
  assert.equal((await call('/api/reminders','POST',{...reminders[0],enabled:false},outsider.cookie)).status,404);
  assert.equal((await call('/api/reminders/'+reminders[0].id,'DELETE',{},outsider.cookie)).status,404);
  const feb=(await call('/api/calendar?month=2026-02','GET',undefined,alice.cookie)).data;assert.ok(feb.days.find(d=>d.day==='2026-02-17').festivals.includes('春节'));
  assert.equal((await call('/api/calendar?month=1999-12','GET',undefined,alice.cookie)).status,400);
  assert.equal((await call('/api/calendar?month=2000-01','GET',undefined,alice.cookie)).data.days.length,31);
  assert.equal((await call('/api/reminders?month=2000-01','GET',undefined,alice.cookie)).status,200);
  assert.equal((await call('/api/reminders','POST',{title:'起始日期提醒',base_day:'1999-12-31',kind:'solar',enabled:true},alice.cookie)).status,400);
  for(const kind of ['solar','lunar']){
   assert.equal((await call('/api/reminders','POST',{title:'历史提醒',base_day:'2000-01-01',kind,enabled:true},alice.cookie)).status,200);
   const historical=(await call('/api/reminders','GET',undefined,alice.cookie)).data.find(r=>r.base_day==='2000-01-01');
   assert.ok(historical.next_day);
   await call('/api/reminders/'+historical.id,'DELETE',{},alice.cookie);
  }
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
 assert.equal(validDay('1999-12-31'),false);
 assert.equal(validDay('2000-01-01'),true);
 assert.equal(validDay('2000-02-29'),true);
 assert.equal(validDay('2001-02-29'),false);
 assert.equal(monthDetails('2000-02').days.length,29);
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
  assert.equal(db.prepare('SELECT body FROM perspectives').get().body,'保留我');assert.equal(db.prepare('SELECT author FROM photos').get().author,1);
  db.prepare("UPDATE perspectives SET body='新的视角'").run();db.close();db=openDatabase(dir);assert.equal(db.prepare('SELECT body FROM perspectives').get().body,'新的视角');assert.equal(readdirSync(dir).filter(x=>x.startsWith('before-v1.3-')).length,1);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('邮箱重置密码：用途隔离、过期、次数限制、会话撤销及双方隔离',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-reset-')),messages=[];
 const {server,db,worker}=createApplication({dataDir:dir,mailer:{ready:true,async send(m){messages.push(m);}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 async function call(url,data,cookie=''){
  const r=await fetch(origin+url,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 const email='reset@example.com';
 async function code(purpose,address=email,cookie=''){
  db.prepare('DELETE FROM attempts WHERE key=?').run('code-minute:'+address);
  const r=await call('/api/email/code',{email:address,purpose},cookie);assert.equal(r.status,200);
  return messages.findLast(m=>m.to===address)?.text;
 }
 try{
  const registration=await code('register');
  const a=await call('/api/register',{name:'reset-user',email,password:'old-pass-123',ledger_code:'RESETBOOK1',code:registration});assert.equal(a.status,200);
  const otherEmail='partner@example.com',partnerCode=await code('register',otherEmail);
  const b=await call('/api/register',{name:'partner',email:otherEmail,password:'partner-pass',ledger_code:'RESETBOOK1',code:partnerCode});assert.equal(b.status,200);
  const second=await call('/api/login',{name:'reset-user',password:'old-pass-123'});
  const reset=(otp,password='new-pass-123',cookie='')=>call('/api/password/reset',{email,password,code:otp},cookie);
  assert.equal((await reset(registration)).status,400);
  let otp=await code('reset');assert.match(otp,/^\d{6}$/);assert.equal(messages.at(-1).subject,otp);
  assert.equal((await reset(otp,'short')).status,400);
  assert.equal((await reset(otp,'new-pass-123',b.cookie)).status,400);
  for(let i=0;i<5;i++)assert.equal((await reset('invalid')).status,400);
  assert.equal((await reset(otp)).status,400);
  otp=await code('reset');db.prepare("UPDATE verification SET expires=0 WHERE purpose='reset'").run();
  assert.equal((await reset(otp)).status,400);
  otp=await code('reset');
  const count=messages.length;
  await code('reset','missing@example.com');assert.equal(messages.length,count);
  assert.equal((await reset(otp)).status,200);
  assert.equal((await reset(otp)).status,400);
  assert.equal((await call('/api/me',undefined,a.cookie)).status,401);
  assert.equal((await call('/api/me',undefined,second.cookie)).status,401);
  assert.equal((await call('/api/me',undefined,b.cookie)).status,200);
  assert.equal((await call('/api/login',{name:'reset-user',password:'old-pass-123'})).status,401);
  const fresh=await call('/api/login',{name:'reset-user',password:'new-pass-123'});assert.equal(fresh.status,200);assert.equal(fresh.data.ledger_code,'RESETBOOK1');
  // The authenticated personal-settings route uses the same mailbox verification.
  db.prepare("DELETE FROM attempts WHERE key=?").run('code-hour:'+email);
  otp=await code('reset',email,fresh.cookie);
  assert.equal((await reset(otp,'last-pass-123',fresh.cookie)).status,200);
  assert.equal((await call('/api/me',undefined,fresh.cookie)).status,401);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
});
