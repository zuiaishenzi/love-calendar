import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {scryptSync} from 'node:crypto';
import sharp from 'sharp';
import {createApplication} from './server.mjs';
import {lifecycleService,RETENTION} from './lifecycle.mjs';
import {openDatabase} from './db.mjs';

function seed(db){
 for(const [id,code] of [[1,'COUPLE123'],[2,'SOLO1234'],[3,'OTHER123']])db.prepare('INSERT INTO ledgers(id,code) VALUES(?,?)').run(id,code);
 for(const [id,name,ledger,seat] of [[1,'alice',1,1],[2,'bob',1,2],[3,'solo',2,1],[4,'other',3,1]])db.prepare('INSERT INTO users(id,name,email,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?,?,?)').run(id,name,name+'@example.com',scryptSync('password-123','test-salt',64).toString('hex'),'test-salt',ledger,seat);
}

test('设置 API：双人注销与取消、只读、头像隔离、纪念册导出、30天到期清理',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-settings-')),mail=[];
 const app=createApplication({dataDir:dir,mailer:{ready:true,async send(m){mail.push(m);}}}),{db,server}=app;seed(db);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,method='GET',data,cookie=''){
  const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
 }
 const code=email=>mail.findLast(m=>m.to===email).text.match(/\d{6}$/)[0];
 try{
  const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie,c=(await call('/api/login','POST',{name:'other',password:'password-123'})).cookie;
  assert.equal((await call('/api/avatar','POST',{preset:'pair-5-2'},a)).data.avatar,'pair-5-2');
  assert.equal((await call('/api/avatar','POST',{preset:'../../etc/passwd'},a)).status,400);
  const png=await sharp({create:{width:20,height:20,channels:3,background:'#b87a90'}}).png().toBuffer();
  assert.equal((await call('/api/avatar','POST',{data:png.toString('base64')},a)).status,200);
  assert.equal((await call('/api/avatars/1','GET',undefined,b)).status,200);
  assert.equal((await call('/api/avatars/1','GET',undefined,c)).status,404);
  assert.equal((await call('/api/avatar','POST',{data:Buffer.from('<svg/>').toString('base64')},a)).status,400);
  const memory=(await call('/api/memories','POST',{day:'2026-01-01',title:'<script>alert(1)</script>',body:'first-view',photos:[{data:png.toString('base64')}]},a)).data.id;
  await call('/api/memories','POST',{id:memory,day:'2026-01-01',title:'<script>alert(1)</script>',body:'second-view',photos:[],keepPhotos:[]},b);
  await call('/api/reminders','POST',{base_day:'2026-01-01',title:'test reminder',kind:'solar',enabled:true},a);
  const photoId=db.prepare('SELECT id FROM photos LIMIT 1').get().id;
  assert.equal((await call('/api/photos/'+photoId+'?size=thumb','GET',undefined,a)).status,200);
  let exportFile=await call('/api/memoir/export','GET',undefined,a);assert.equal(exportFile.status,200);assert.match(exportFile.data,/&lt;script&gt;/);assert.doesNotMatch(exportFile.data,/<script>/);assert.ok(exportFile.data.indexOf('first-view')<exportFile.data.indexOf('second-view'));assert.match(exportFile.data,/data:image\/png;base64/);
  assert.doesNotMatch((await call('/api/memoir/export','GET',undefined,c)).data,/first-view/);
  assert.equal((await call('/api/lifecycle/code','POST',{purpose:'account-delete'},a)).status,409);
  assert.equal((await call('/api/lifecycle/code','POST',{purpose:'ledger-delete'},a)).status,200);
  assert.match(mail.at(-1).text,/^注销确认验证码：\d{6}$/);
  assert.equal((await call('/api/lifecycle/confirm','POST',{purpose:'ledger-delete',code:code('alice@example.com')},a)).data.readonly,false);
  assert.equal((await call('/api/lifecycle/code','POST',{purpose:'ledger-delete'},b)).status,200);
  const pending=await call('/api/lifecycle/confirm','POST',{purpose:'ledger-delete',code:code('bob@example.com')},b);assert.equal(pending.data.readonly,true);assert.ok(Math.abs(pending.data.delete_at-Date.now()-RETENTION)<2000);
  assert.equal((await call('/api/memories','POST',{},a)).status,423);
  assert.equal((await call('/api/memories/'+memory,'DELETE',{},b)).status,423);
  assert.equal((await call('/api/reminders','POST',{},b)).status,423);
  assert.equal((await call('/api/profile','POST',{email:'alice@example.com',email_enabled:false},a)).status,423);
  assert.equal((await call('/api/avatar','POST',{preset:'pair-1-1'},a)).status,423);
  assert.equal((await call('/api/login','POST',{name:'alice',password:'password-123'})).data.lifecycle.readonly,true);
  assert.equal((await call('/api/memoir/export','GET',undefined,b)).status,200);
  const mailCount=mail.length;await app.worker.run(new Date('2026-01-01T01:00:00Z'));assert.equal(mail.length,mailCount,'pending ledger must not send reminders');
  db.prepare("DELETE FROM attempts WHERE key LIKE 'lifecycle-code:%'").run();
  await call('/api/lifecycle/code','POST',{purpose:'ledger-cancel'},a);assert.match(mail.at(-1).text,/^账本取消注销验证码：\d{6}$/);
  assert.equal((await call('/api/lifecycle/confirm','POST',{purpose:'ledger-cancel',code:code('alice@example.com')},a)).data.readonly,true);
  await call('/api/lifecycle/code','POST',{purpose:'ledger-cancel'},b);
  assert.equal((await call('/api/lifecycle/confirm','POST',{purpose:'ledger-cancel',code:code('bob@example.com')},b)).data.readonly,false);
  assert.equal((await call('/api/avatar','POST',{preset:'pair-2-1'},a)).status,200);
  db.prepare("UPDATE ledgers SET delete_at=?,delete_kind='ledger' WHERE id=1").run(Date.now()-1);
  assert.equal((await call('/api/me','GET',undefined,a)).status,401);
  for(const table of ['memories','photos','perspectives','thumbnails','reminders','deliveries','ledger_votes'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
  assert.equal(db.prepare('SELECT id FROM users WHERE id=1').get(),undefined);assert.ok(db.prepare('SELECT id FROM users WHERE id=4').get());assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('单人注销：错误登录不恢复，原密码登录和同名同邮箱验证恢复原账本',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-solo-')),mail=[];
 const {server,db}=createApplication({dataDir:dir,mailer:{ready:true,async send(m){mail.push(m);}}});seed(db);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,data,cookie=''){const r=await fetch(origin+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function cancel(cookie){db.prepare("DELETE FROM attempts WHERE key LIKE 'lifecycle-code:%'").run();await call('/api/lifecycle/code',{purpose:'account-delete'},cookie);return call('/api/lifecycle/confirm',{purpose:'account-delete',code:mail.at(-1).text.slice(-6)},cookie);}
 try{
  const first=await call('/api/login',{name:'solo',password:'password-123'});assert.equal((await cancel(first.cookie)).data.kind,'account');
  assert.equal((await call('/api/login',{name:'solo',password:'wrong-password'})).status,401);assert.equal(db.prepare('SELECT delete_kind FROM ledgers WHERE id=2').get().delete_kind,'account');
  const back=await call('/api/login',{name:'solo',password:'password-123'});assert.equal(back.data.id,3);assert.equal(back.data.lifecycle.readonly,false);
  await cancel(back.cookie);
  assert.equal((await call('/api/email/code',{purpose:'register',email:'solo@example.com',name:'someone-else'})).status,409);
  db.prepare('DELETE FROM attempts').run();
  assert.equal((await call('/api/email/code',{purpose:'register',email:'solo@example.com',name:'solo'})).status,200);
  const recovered=await call('/api/register',{name:'solo',email:'solo@example.com',password:'new-password-123',ledger_code:'IGNORED123',code:mail.at(-1).text});
  assert.equal(recovered.status,200);assert.equal(recovered.data.id,3);assert.equal(recovered.data.ledger_code,'SOLO1234');assert.equal(recovered.data.lifecycle.readonly,false);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('确认窗口：跨用户验证码无效、错误次数限制、十分钟超时、重启持久化',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-window-'));let db=openDatabase(dir);seed(db);let now=Date.now();const mail=[];const mailer={ready:true,async send(m){mail.push(m);}};
 let service=lifecycleService(db,mailer,{now:()=>now});const a=db.prepare('SELECT * FROM users WHERE id=1').get(),b=db.prepare('SELECT * FROM users WHERE id=2').get();
 try{
  await service.sendCode(a,'ledger-delete');const code=mail.at(-1).text.slice(-6);assert.throws(()=>service.confirm(b,'ledger-delete',code));
  for(let i=0;i<5;i++)assert.throws(()=>service.confirm(a,'ledger-delete','not-a-code'));
  assert.throws(()=>service.confirm(a,'ledger-delete',code));now+=60001;await service.sendCode(a,'ledger-delete');service.confirm(a,'ledger-delete',mail.at(-1).text.slice(-6));
  const deadline=service.status(1).request.expires;
  db.close();db=openDatabase(dir);service=lifecycleService(db,mailer,{now:()=>now});assert.deepEqual(service.status(1).request.approved,[1]);
  now=deadline;assert.throws(()=>service.confirm(b,'ledger-delete','123456'));assert.equal(service.status(1).readonly,false);
  await service.sendCode(b,'ledger-delete');assert.deepEqual(service.status(1).request.approved,[]);
  assert.ok(service.status(1).request.expires>deadline);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
