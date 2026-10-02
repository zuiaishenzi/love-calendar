import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {scryptSync} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApplication} from './server.mjs';
import {chatService} from './chat.mjs';
import {openDatabase} from './db.mjs';

function seed(db){db.exec("INSERT INTO ledgers(id,code) VALUES(1,'CHAT1234'),(2,'OTHER123');");for(const [id,name,ledger,seat] of [[1,'alice',1,1],[2,'bob',1,2],[3,'other',2,1]])db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?,?)').run(id,name,scryptSync('password-123','salt',64).toString('hex'),'salt',ledger,seat);}
test('聊天右键、触屏长按、移动取消及长按后不误触图片',()=>{
 const source=readFileSync(new URL('./public/chat.js',import.meta.url),'utf8'),start=source.indexOf('function chatMessageMenu('),end=source.indexOf('function chatHeader',start),handlers={},opened=[],timers=new Map();let next=0;
 const context={chatPressTimer:null,chatPressStart:null,chatLongPressed:false,Math,openChatMenu:(...args)=>opened.push(args),setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
 const attach=runInNewContext(source.slice(start,end)+';chatMessageMenu',context),card={addEventListener(type,fn){handlers[type]=fn;},getBoundingClientRect(){return {left:10,top:10};}},row={id:1};attach(card,row);
 const event={pointerType:'touch',clientX:20,clientY:30,target:{closest:()=>null},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
 handlers.contextmenu(event);assert.equal(opened.length,1);assert.equal(event.prevented,true);
 handlers.pointerdown({...event});handlers.pointermove({...event,clientX:40});assert.equal(timers.size,0);
 handlers.pointerdown({...event});[...timers.values()][0]();assert.equal(opened.length,2);handlers.pointerup();const click={...event,prevented:false,stopped:false};handlers.click(click);assert.equal(click.prevented,true);assert.equal(click.stopped,true);
 handlers.pointerdown({...event});handlers.pointercancel();assert.equal(timers.size,0);
});
test('聊天文字、图片、语音附件与信令只对本账本开放，支持范围播放、只读与到期清理',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-chat-')),app=createApplication({dataDir:dir,mailer:{ready:false}}),{db,server}=app;seed(db);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,method='GET',input,cookie='',range){const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...(range?{Range:range}:{})},body:input===undefined?undefined:JSON.stringify(input)});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};}
 try{
  const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie,c=(await call('/api/login','POST',{name:'other',password:'password-123'})).cookie;
  assert.equal((await call('/api/chat/messages')).status,401);
  assert.equal((await call('/api/chat/messages','POST',{kind:'text',text:'<script>想念你</script>'},a)).status,200);
  const png=await sharp({create:{width:20,height:20,channels:3,background:'#b87a90'}}).png().toBuffer();const image=(await call('/api/chat/messages','POST',{kind:'image',data:png.toString('base64')},a)).data.id;
  const audio=(await call('/api/chat/messages','POST',{kind:'audio',data:Buffer.from([0x1a,0x45,0xdf,0xa3,0,1,2,3]).toString('base64')},b)).data.id;
  const messages=(await call('/api/chat/messages','GET',undefined,b)).data.messages;assert.equal(messages.length,3);assert.equal(messages[0].text,'<script>想念你</script>');assert.equal(messages[2].sender,2);
  assert.equal((await call('/api/chat/messages','GET',undefined,c)).data.messages.length,0);
  assert.equal((await call('/api/chat/media/'+image,'GET',undefined,c)).status,404);assert.equal((await call('/api/chat/media/'+image,'GET',undefined,b)).headers.get('content-type'),'image/webp');
  const ranged=await call('/api/chat/media/'+audio,'GET',undefined,a,'bytes=0-3');assert.equal(ranged.status,206);assert.equal(ranged.data.length,4);assert.equal(ranged.headers.get('content-range'),'bytes 0-3/8');
  assert.equal((await call('/api/chat/media/'+audio,'GET',undefined,b,'bytes=99-')).status,416);
  assert.equal((await call('/api/chat/messages','POST',{kind:'image',data:Buffer.from('<svg/>').toString('base64')},a)).status,400);
  assert.equal((await call('/api/chat/messages','POST',{kind:'audio',data:Buffer.from('invalid').toString('base64')},a)).status,400);
  assert.equal((await call('/api/chat/messages?before='+audio,'GET',undefined,a)).data.messages.length,2);
  assert.equal((await call('/api/chat/memory','POST',{ids:[image]},c)).status,404);
  assert.equal((await call('/api/chat/memory','POST',{ids:[image,image]},a)).status,400);
  const saved=await call('/api/chat/memory','POST',{ids:[audio,messages[0].id,image]},a);assert.equal(saved.status,200);assert.equal(saved.data.count,3);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(saved.data.day,day);
  const memory=(await call('/api/memories?month='+day.slice(0,7),'GET',undefined,b)).data.find(r=>r.id===saved.data.id);assert.equal(memory.title,'今天的对话');assert.deepEqual(memory.chat_messages.map(r=>r.kind),['text','image','audio']);assert.equal(memory.chat_messages[0].name,'alice');
  const attachment=memory.chat_messages[1].id;
  assert.equal((await call('/api/memory-chat-media/'+attachment,'GET',undefined,c)).status,404);assert.equal((await call('/api/memory-chat-media/'+attachment,'GET',undefined,b)).headers.get('content-type'),'image/webp');
  db.prepare('UPDATE chat_messages SET data=? WHERE id=?').run(Buffer.from('changed'),image);assert.notDeepEqual((await call('/api/memory-chat-media/'+attachment,'GET',undefined,b)).data,Buffer.from('changed'));
  const exported=await call('/api/memoir/export','GET',undefined,b);assert.ok(exported.data.toString().includes('收藏的对话'));assert.ok(exported.data.toString().includes('&lt;script&gt;想念你&lt;/script&gt;'));assert.ok(exported.data.toString().includes('data:audio/webm;base64,'));
  assert.equal((await call('/api/chat/messages/'+image+'/retract','POST',{},b)).status,403);
  assert.equal((await call('/api/chat/messages/'+image+'/retract','POST',{},c)).status,404);
  assert.equal((await call('/api/chat/messages/'+image+'/retract','POST',{},a)).status,200);
  const retracted=(await call('/api/chat/messages','GET',undefined,b)).data;assert.ok(retracted.messages.find(r=>r.id===image).retracted_at);assert.ok(retracted.retractions.some(r=>r.id===image));assert.equal(db.prepare('SELECT data FROM chat_messages WHERE id=?').get(image).data,null);
  assert.equal((await call('/api/chat/media/'+image,'GET',undefined,b)).status,404);assert.equal((await call('/api/chat/memory','POST',{ids:[image]},a)).status,404);
  assert.equal((await call('/api/memory-chat-media/'+attachment,'GET',undefined,b)).status,200);
  const offer=await call('/api/chat/call','POST',{action:'offer',sdp:'v=0\r\n'},a);assert.equal(offer.status,200);const id=offer.data.call.id;
  assert.equal((await call('/api/chat/call','GET',undefined,c)).data.call,null);
  assert.equal((await call('/api/chat/call','POST',{action:'answer',id,sdp:'v=0\r\n'},c)).status,404);
  assert.equal((await call('/api/chat/call','POST',{action:'offer',sdp:'v=0\r\n'},b)).status,409);
  assert.equal((await call('/api/chat/call','POST',{action:'answer',id,sdp:'v=0\r\n'},a)).status,409);
  assert.equal((await call('/api/chat/call','POST',{action:'answer',id,sdp:'v=0\r\n'},b)).status,200);
  assert.equal((await call('/api/chat/call','POST',{action:'ice',id,candidate:{candidate:'candidate:test',sdpMid:'0',sdpMLineIndex:0}},a)).status,200);
  assert.equal((await call('/api/chat/call','GET',undefined,b)).data.call.ice.length,1);
  assert.equal((await call('/api/chat/call','POST',{action:'hangup',id},b)).status,200);
  assert.equal((await call('/api/chat/call','GET',undefined,a)).data.call,null);
  db.prepare("UPDATE ledgers SET delete_at=?,delete_kind='ledger' WHERE id=1").run(Date.now()+10000);
  assert.equal((await call('/api/chat/messages','POST',{kind:'text',text:'禁止'},a)).status,423);
  assert.equal((await call('/api/chat/messages/'+audio+'/retract','POST',{},b)).status,423);
  assert.equal((await call('/api/chat/memory','POST',{ids:[image]},a)).status,423);
  assert.equal((await call('/api/chat/call','POST',{action:'offer',sdp:'v=0\r\n'},a)).status,423);
  assert.equal((await call('/api/chat/messages','GET',undefined,b)).status,200);
  db.prepare('UPDATE ledgers SET delete_at=1 WHERE id=1').run();app.lifecycle.purge();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memory_chat_messages').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('通话未接听或一方掉线自动过期，聊天分页及发送频率限制',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-call-')),db=openDatabase(dir);seed(db);let time=100000;const service=chatService(db,()=>{},{now:()=>time}),user={id:1,ledger_id:1},peer={id:2,ledger_id:1};
 const route=(user,method,pathname,input={})=>service.route({method},{},new URL(pathname,'http://localhost'),user,input,()=>{});
 try{
  const result=await route(user,'POST','/api/chat/call',{action:'offer',sdp:'v=0\r\n'});time+=45001;assert.equal((await route(peer,'GET','/api/chat/call')).call,null);
  time+=100;const offer=await route(user,'POST','/api/chat/call',{action:'offer',sdp:'v=0\r\n'});await route(peer,'POST','/api/chat/call',{action:'answer',id:offer.call.id,sdp:'v=0\r\n'});time+=60001;assert.equal((await route(user,'GET','/api/chat/call')).call,null);
  for(let i=0;i<30;i++)await route(user,'POST','/api/chat/messages',{kind:'text',text:'消息'+i});await assert.rejects(route(user,'POST','/api/chat/messages',{kind:'text',text:'太频繁'}),e=>e.status===429);
  time+=60001;for(let i=0;i<25;i++)await route(user,'POST','/api/chat/messages',{kind:'text',text:'下一批'+i});const page=await route(user,'GET','/api/chat/messages');assert.equal(page.messages.length,50);assert.equal(page.more,true);assert.equal((await route(user,'GET','/api/chat/messages?before='+page.messages[0].id)).messages.length,5);
 }finally{service.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
