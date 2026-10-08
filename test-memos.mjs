import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {scryptSync} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createApplication} from './server.mjs';
import {memoService} from './memos.mjs';
import {openDatabase} from './db.mjs';

test('旧整理结果迁移为可选AI分类，重启不覆盖手动改回待整理的记录',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-category-migration-'));let db=openDatabase(dir);
 try{
  db.exec("INSERT INTO ledgers(id,code) VALUES(1,'MIGRATE1'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'test','x','x',1,1); INSERT INTO memo_notes(id,user_id,body) VALUES(1,1,'原文'); ALTER TABLE memo_notes DROP COLUMN ai_category; DROP TABLE memo_ai_categories;");
  db.prepare('INSERT INTO memo_summaries(user_id,content) VALUES(1,?)').run(JSON.stringify([{id:1,category:'饮食',text:'整理结果'}]));db.close();db=openDatabase(dir);
  assert.equal(db.prepare('SELECT ai_category FROM memo_notes').get().ai_category,'饮食');assert.equal(db.prepare('SELECT name FROM memo_ai_categories').get().name,'饮食');assert.equal(db.prepare('SELECT body FROM memo_notes').get().body,'原文');
  db.exec('UPDATE memo_notes SET ai_category=NULL; DELETE FROM memo_summaries;');db.close();db=openDatabase(dir);assert.equal(db.prepare('SELECT ai_category FROM memo_notes').get().ai_category,null);assert.equal(db.prepare('SELECT name FROM memo_ai_categories').get().name,'饮食');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('私密备忘隔离、自定义分类不发送AI、原文保留、只读和注销清理',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memos-'));let received;
 const app=createApplication({dataDir:dir,mailer:{ready:false},memoOrganizer:{ready:true,async organize(notes){received=notes;return {items:notes.map(n=>({id:n.id,category:'饮食',text:'喜欢清淡，不加糖'}))};}}});
 const {db,server}=app;db.prepare('INSERT INTO ledgers(id,code) VALUES(1,?)').run('MEMO1234');
 for(const [id,name] of [[1,'alice'],[2,'bob']])db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,1,?)').run(id,name,scryptSync('password-123','salt',64).toString('hex'),'salt',id);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,method='GET',data,cookie=''){const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie;
  assert.equal((await call('/api/memos')).status,401);
  let data=(await call('/api/memos/categories','POST',{name:'旅行计划'},a)).data;const cid=data.categories[0].id;
  data=(await call('/api/memos/notes','POST',{body:'秘密旅行地点',category_id:cid},a)).data;
  data=(await call('/api/memos/notes','POST',{body:'清淡饮食，咖啡不加糖'},a)).data;const nid=data.notes[1].id;
  assert.equal((await call('/api/memos','GET',undefined,b)).data.notes.length,0);
  assert.equal((await call('/api/memos/notes','POST',{id:nid,body:'偷改'},b)).status,404);
  assert.equal((await call('/api/memos/notes/'+nid,'DELETE',{},b)).status,404);
  assert.equal((await call('/api/memos/notes','POST',{body:'越权分类',category_id:cid},b)).status,400);
  assert.equal((await call('/api/memos/categories/'+cid,'DELETE',{},b)).status,404);
  assert.equal((await call('/api/memos/categories/'+cid,'DELETE',{},a)).status,409);
  const organized=await call('/api/memos/organize','POST',{},a);assert.equal(organized.status,200);
  assert.deepEqual(received,[{id:nid,body:'清淡饮食，咖啡不加糖'}]);assert.equal(organized.data.notes[0].body,'秘密旅行地点');assert.equal(organized.data.notes[1].body,'清淡饮食，咖啡不加糖');
  const order=['custom:'+cid,'ai:饮食','pending'];assert.equal((await call('/api/memos/order','POST',{order},a)).status,200);assert.deepEqual((await call('/api/memos','GET',undefined,a)).data.order,order);assert.deepEqual((await call('/api/memos','GET',undefined,b)).data.order,[]);assert.equal((await call('/api/memos/order','POST',{order},b)).status,400);assert.equal((await call('/api/memos/order','POST',{order:['pending','pending']},a)).status,400);
  assert.deepEqual(organized.data.ai_categories,['饮食']);assert.equal(organized.data.notes[1].ai_category,'饮食');
  const placed=await call('/api/memos/notes','POST',{body:'喜欢热茶',ai_category:'饮食'},a);assert.equal(placed.status,200);assert.equal(placed.data.notes.at(-1).ai_category,'饮食');assert.equal(placed.data.summary[0].id,nid);
  assert.equal((await call('/api/memos/notes','POST',{body:'非法分类',ai_category:'饮食'},b)).status,400);
  assert.equal((await call('/api/memos/notes','POST',{body:'非法组合',ai_category:'饮食',category_id:cid},a)).status,400);
  const pending=await call('/api/memos/notes','POST',{id:placed.data.notes.at(-1).id,body:'待整理的新记录'},a);assert.equal(pending.data.notes.at(-1).ai_category,null);assert.equal(pending.data.summary[0].id,nid);
  assert.equal((await call('/api/memos','GET',undefined,b)).data.summary,null);
  assert.equal((await call('/api/memos/organize','POST',{},a)).status,429);
  assert.equal((await call('/api/memos/notes','POST',{id:nid,body:'更新'},a)).data.summary,null);
  db.prepare("UPDATE ledgers SET delete_at=?,delete_kind='ledger' WHERE id=1").run(Date.now()+100000);
  assert.equal((await call('/api/memos/notes','POST',{body:'禁止修改'},a)).status,423);
  assert.equal((await call('/api/memos/organize','POST',{},a)).status,423);
  assert.equal((await call('/api/memos/order','POST',{order:['pending']},a)).status,423);
  assert.equal((await call('/api/memos','GET',undefined,a)).status,200);
  db.prepare('UPDATE ledgers SET delete_at=1 WHERE id=1').run();app.lifecycle.purge();
  for(const table of ['memo_notes','memo_categories','memo_summaries','memo_ai_categories','memo_display_order'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('整理期间编辑不会覆盖原文或保存过期结果',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-failure-'));let respond;
 const app=createApplication({dataDir:dir,mailer:{ready:false},memoOrganizer:{ready:true,organize:()=>new Promise(r=>respond=r)}}),{db,server}=app;
 db.exec("INSERT INTO ledgers(id,code) VALUES(1,'FAIL1234');");db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,?,?,?,?,1)').run('test',scryptSync('password-123','salt',64).toString('hex'),'salt',1);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'test',password:'password-123'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 async function call(url,body){return fetch(origin+url,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});}
 try{
  await call('/api/memos/notes',{body:'原文'});const pending=call('/api/memos/organize',{});
  while(!respond)await new Promise(r=>setTimeout(r,5));await call('/api/memos/notes',{id:1,body:'新原文'});respond({items:[{id:1,category:'饮食',text:'原文'}]});assert.equal((await pending).status,409);
  assert.equal(db.prepare('SELECT body FROM memo_notes').get().body,'新原文');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memo_summaries').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('AI遗漏、重复要点、非法分类和非文本结果均拒绝保存',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-invalid-')),db=openDatabase(dir);
 try{
  db.exec("INSERT INTO ledgers(id,code) VALUES(1,'VALID123'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'test','x','x',1,1); INSERT INTO memo_notes(id,user_id,body) VALUES(1,1,'原文一'),(2,1,'原文二');");
  const valid={id:1,category:'饮食',text:'条目'};
  for(const items of [[],[valid,valid],[valid,{id:2,category:'编造分类',text:'条目'}],[valid,{id:2,category:'饮食',text:{html:'bad'}}]]){
   const service=memoService(db,{ready:true,async organize(){return {items};}});
   await assert.rejects(service.route({method:'POST'},{pathname:'/api/memos/organize'},{id:1},{},()=>{}),error=>error.status===502);
  }
  assert.deepEqual(db.prepare('SELECT body FROM memo_notes ORDER BY id').all(),[{body:'原文一'},{body:'原文二'}]);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memo_summaries').get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('长段原文拆成跨分类的多个要点，保留原文，编辑使该原文全部要点失效',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-points-')),db=openDatabase(dir);
 try{
  db.exec("INSERT INTO ledgers(id,code) VALUES(1,'POINT123'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'test','x','x',1,1);");
  const body='她喜欢清淡，咖啡不加糖，习惯早睡，不喜欢别人临时取消约定。';
  db.prepare('INSERT INTO memo_notes(id,user_id,body) VALUES(1,1,?),(2,1,?)').run(body,'喜欢看海');
  const points=[{id:1,category:'饮食',text:'喜欢清淡饮食'},{id:1,category:'饮食',text:'咖啡不加糖'},{id:1,category:'习惯',text:'习惯早睡'},{id:1,category:'雷点',text:'不喜欢临时取消约定'},{id:2,category:'喜好',text:'喜欢看海'}];
  const service=memoService(db,{ready:true,async organize(){return {items:points};}});
  const result=await service.route({method:'POST'},{pathname:'/api/memos/organize'},{id:1},{},()=>{});
  assert.deepEqual(result.summary,points);assert.equal(result.notes[0].body,body);assert.deepEqual(result.ai_categories,['饮食','习惯','雷点','喜好']);
  assert.deepEqual((await service.route({method:'GET'},{pathname:'/api/memos'},{id:1},{},()=>{})).summary,points);
  const edited=await service.route({method:'POST'},{pathname:'/api/memos/notes'},{id:1},{id:1,body:'新原文'},()=>{});
  assert.deepEqual(edited.summary,[points[4]]);assert.equal(edited.notes[0].body,'新原文');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});


test('备忘日记日期与事情保存，旧记录不伪造日期，旧客户端编辑保留元数据',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-diary-')),db=openDatabase(dir);
 try{
  db.exec("INSERT INTO ledgers(id,code) VALUES(1,'DIARY123'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'test','x','x',1,1),(2,'other','x','x',1,2); INSERT INTO memo_notes(id,user_id,body) VALUES(1,1,'旧原文'); ALTER TABLE memo_notes DROP COLUMN day; ALTER TABLE memo_notes DROP COLUMN title;");db.close();
  const reopened=openDatabase(dir);try{
   const service=memoService(reopened,{ready:false}),call=(input,id=1)=>service.route({method:'POST'},{pathname:'/api/memos/notes'},{id},input,()=>{});
   const old=await service.route({method:'GET'},{pathname:'/api/memos'},{id:1},{},()=>{});assert.equal(old.notes[0].day,null);assert.equal(old.notes[0].body,'旧原文');
   let data=await call({body:'不加糖',title:'一起喝咖啡',day:'2026-10-07'});const note=data.notes.at(-1);assert.equal(note.day,'2026-10-07');assert.equal(note.title,'一起喝咖啡');
   data=await call({id:note.id,body:'喜欢热咖啡'});assert.equal(data.notes.at(-1).day,note.day);assert.equal(data.notes.at(-1).title,note.title);
   await assert.rejects(call({body:'bad',day:'2026-02-30'}),e=>e.status===400);
   await assert.rejects(call({body:'bad',title:'a'.repeat(101)}),e=>e.status===400);
   await assert.rejects(call({id:note.id,body:'越权',day:'2026-10-08'},2),e=>e.status===404);
   data=await call({id:1,body:'补记原文',day:'2026-10-06',title:'那天的小事'});assert.equal(data.notes[0].day,'2026-10-06');assert.equal(data.notes[0].body,'补记原文');
  }finally{reopened.close();}
 }finally{try{db.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});


test('单个AI要点跨分类移动保留原文，增量整理仅发送待整理，冷却30秒',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-move-')),db=openDatabase(dir);let calls=0,received,now=100000;const originalNow=Date.now;Date.now=()=>now;
 try{
  db.exec("INSERT INTO ledgers(id,code) VALUES(1,'MOVE1234'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'test','x','x',1,1),(2,'other','x','x',1,2); INSERT INTO memo_categories(id,user_id,name) VALUES(1,1,'手动'),(2,2,'他人');");
  const service=memoService(db,{ready:true,async organize(notes){calls++;received=notes;return {items:notes.flatMap(n=>[{id:n.id,category:'饮食',text:'饮食要点'+n.id},{id:n.id,category:'习惯',text:'习惯要点'+n.id}])};}}),call=(route,input={},id=1)=>service.route({method:'POST'},{pathname:'/api/memos/'+route},{id},input,()=>{});
  await call('notes',{body:'完整原文'});let data=await call('organize');assert.equal(calls,1);
  data=await call('move',{id:1,extracted:true,index:0,text:'饮食要点1',target:'custom:1'});assert.equal(data.summary[0].category_id,1);assert.equal(data.summary[1].category,'习惯');assert.equal(data.notes[0].body,'完整原文');
  await assert.rejects(call('move',{id:1,extracted:true,index:0,text:'过期文本',target:'ai:习惯'}),e=>e.status===409);
  await assert.rejects(call('move',{id:1,extracted:true,index:0,text:'饮食要点1',target:'custom:2'}),e=>e.status===400);
  await assert.rejects(call('move',{id:1,target:'pending'},2),e=>e.status===404);
  await call('organize');assert.equal(calls,1);
  await call('notes',{body:'新的待整理'});now+=29999;await assert.rejects(call('organize'),e=>e.status===429);assert.equal(calls,1);
  now++;data=await call('organize');assert.equal(calls,2);assert.deepEqual(received,[{id:2,body:'新的待整理'}]);assert.equal(data.summary.length,4);assert.equal(data.summary[0].category_id,1);
  await call('move',{id:2,extracted:true,index:2,text:'饮食要点2',target:'ai:习惯'});assert.equal(db.prepare('SELECT body FROM memo_notes WHERE id=2').get().body,'新的待整理');
 }finally{Date.now=originalNow;db.close();rmSync(dir,{recursive:true,force:true});}
});


test('备忘图片账号隔离、保留和删除，AI只接收文字并跳过纯图片',async()=>{
 const sharp=(await import('sharp')).default,dir=mkdtempSync(path.join(os.tmpdir(),'love-memo-images-'));let received=null;
 const app=createApplication({dataDir:dir,mailer:{ready:false},memoOrganizer:{ready:true,async organize(notes){received=notes;return {items:notes.map(n=>({id:n.id,category:'喜好',text:'喜欢花'}))};}}});
 app.db.exec("INSERT INTO ledgers(id,code) VALUES(1,'PIC12345'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'alice','x','x',1,1),(2,'bob','x','x',1,2);");
 const service=memoService(app.db,{ready:true,async organize(notes){received=notes;return {items:notes.map(n=>({id:n.id,category:'喜好',text:'喜欢花'}))};}}),call=(route,input={},id=1)=>service.route({method:'POST'},{pathname:'/api/memos/'+route},{id},input,()=>{});
 const png=await sharp({create:{width:2,height:2,channels:3,background:'#eeccdd'}}).png().toBuffer();
 try{
  let data=await call('notes',{body:'喜欢花',images:[{data:png.toString('base64')}]});const note=data.notes[0],photo=note.images[0].id;
  const imageOnly=await call('notes',{body:'',images:[{data:png.toString('base64')}]});assert.equal(imageOnly.notes.length,2);
  await call('organize');assert.deepEqual(received,[{id:note.id,body:'喜欢花'}]);
  await assert.rejects(call('notes',{body:'偷用图片',images:[{id:photo}]},2));
  data=await call('notes',{id:note.id,body:'喜欢花'});assert.equal(data.notes[0].images[0].id,photo);
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
  for(const [token,id] of [['a'.repeat(64),1],['b'.repeat(64),2]])app.db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run((await import('./accounts.mjs')).hash(token),id,Date.now()+60000);
  const authorized=await fetch(origin+'/api/memos/images/'+photo,{headers:{Cookie:'session='+'a'.repeat(64)}});assert.equal(authorized.status,200);assert.equal(authorized.headers.get('content-type'),'image/webp');
  assert.equal((await fetch(origin+'/api/memos/images/'+photo,{headers:{Cookie:'session='+'b'.repeat(64)}})).status,404);
  await call('notes',{id:note.id,body:'喜欢花',images:[]});assert.equal(app.db.prepare('SELECT id FROM memo_images WHERE id=?').get(photo),undefined);
  await service.route({method:'DELETE'},{pathname:'/api/memos/notes/'+imageOnly.notes[1].id},{id:1},{},()=>{});assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM memo_images').get().n,0);
 }finally{if(app.server.listening)await new Promise(r=>app.server.close(r));app.db.close();rmSync(dir,{recursive:true,force:true});}
});
