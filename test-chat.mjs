import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {scryptSync,createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApplication} from './server.mjs';
import {chatService} from './chat.mjs';
import {openDatabase} from './db.mjs';
import {createRealtime} from './realtime.mjs';
import {EventEmitter} from 'node:events';
import {memoryAttachments} from './media.mjs';

test('多选点击消息行、头像或语音按钮只切换勾选，复选框不重复切换，保存与长按受保护',()=>{
 const source=readFileSync(new URL('./public/chat.js',import.meta.url),'utf8'),start=source.indexOf('function chatSelectableRow('),end=source.indexOf('function renderChat',start),handlers={};
 const context={chatLongPressed:false},attach=runInNewContext(source.slice(start,end)+';chatSelectableRow',context),wrap={addEventListener(type,fn){handlers[type]=fn;}},check={checked:false,disabled:false,onchange(){this.changes=(this.changes||0)+1;}};attach(wrap,check);
 const event=target=>({target,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
 const click=event({tag:'voice-button'});handlers.click(click);assert.equal(check.checked,true);assert.equal(click.prevented,true);assert.equal(click.stopped,true);
 handlers.click(event({tag:'avatar'}));assert.equal(check.checked,false);handlers.click(event(check));assert.equal(check.changes,2);
 check.disabled=true;handlers.click(event(wrap));assert.equal(check.changes,2);check.disabled=false;context.chatLongPressed=true;handlers.click(event(wrap));assert.equal(check.changes,2);assert.equal(context.chatLongPressed,false);
 handlers.keydown({...event(wrap),key:'Enter'});assert.equal(check.checked,true);
});

test('旧语音无时长且媒体时长为Infinity时自动解码秒数，并复用缓存',async()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),start=source.indexOf('const voiceDurations='),end=source.indexOf('function memoryAttachment',start);let fetched=0,closed=0;
 const make=tag=>({tag,children:[],events:{},duration:Infinity,paused:true,classList:{toggle(){}},append(...nodes){this.children.push(...nodes);},setAttribute(){},addEventListener(k,fn){this.events[k]=fn;}});
 const context={activeVoiceAudio:null,Map,Promise,Number,Math,el:(tag,text)=>Object.assign(make(tag),{textContent:text}),fetch:async()=>{fetched++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};},window:{AudioContext:class{async decodeAudioData(){return {duration:3.4};}async close(){closed++;}}}};
 const controls=runInNewContext(source.slice(start,end)+';({voiceMessage,resolveVoiceDuration})',context),first=controls.voiceMessage('/legacy'),second=controls.voiceMessage('/legacy');
 assert.equal(first.children[0].children[2].textContent,'…″');first.children[1].events.loadedmetadata();await controls.resolveVoiceDuration('/legacy');await Promise.resolve();assert.equal(first.children[0].children[2].textContent,'4″');assert.equal(second.children[0].children[2].textContent,'4″');assert.equal(fetched,1);assert.equal(closed,1);
});

test('语音气泡点击播放与暂停，互斥播放，元数据更新时长',async()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),start=source.indexOf('function voiceMessage('),end=source.indexOf('function memoryAttachment',start);
 const make=tag=>({tag,children:[],events:{},attributes:{},paused:true,duration:3,classList:{toggle(){}},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.events[k]=fn;},async play(){this.paused=false;this.events.play();},pause(){this.paused=true;this.events.pause();}});
 const context={activeVoiceAudio:null,el:(tag,text)=>Object.assign(make(tag),{textContent:text}),Math,Number,$:()=>({})},create=runInNewContext(source.slice(start,end)+';voiceMessage',context),first=create('/first',2),second=create('/second',5),[button,audio]=first.children;
 audio.events.loadedmetadata();assert.equal(button.children[2].textContent,'3″');await button.onclick();assert.equal(audio.paused,false);assert.equal(button.attributes['aria-pressed'],'true');await second.children[0].onclick();assert.equal(audio.paused,true);assert.equal(second.children[1].paused,false);await second.children[0].onclick();assert.equal(second.children[1].paused,true);
});

test('回忆附件校验文件类型、文件名及单文件和总量限制',()=>{
 const mp4=Buffer.from('000000186674797069736f6d','hex'),wav=Buffer.from('524946460000000057415645','hex');
 assert.equal(memoryAttachments([{name:'片段.mp4',data:mp4.toString('base64')}])[0].kind,'video');assert.equal(memoryAttachments([{name:'语音.wav',data:wav.toString('base64')}])[0].mime,'audio/wav');
 for(const file of [{name:'bad.mp4',data:Buffer.from('<script>').toString('base64')},{name:'bad.html',data:mp4.toString('base64')},{name:'bad.wav',data:'!bad!'}])assert.throws(()=>memoryAttachments([file]),e=>e.status===400);
 const big=Buffer.alloc(20*1024*1024+1);wav.copy(big);assert.throws(()=>memoryAttachments([{name:'大音频.wav',data:big.toString('base64')}]),e=>e.status===400);
});

test('回忆视频语音上传、双方隔离、分段下载、各自编辑、导出及到期清理',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-memory-media-')),app=createApplication({dataDir:dir,mailer:{ready:false}}),{db,server}=app;seed(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const call=async(url,method='GET',data,cookie='',range)=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...(range?{Range:range}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};};
 try{
  const cookies=[];for(const name of ['alice','bob','other'])cookies.push((await call('/api/login','POST',{name,password:'password-123'})).headers.get('set-cookie').split(';')[0]);const [a,b,c]=cookies;
  const bytes=Buffer.from('524946460000000057415645','hex'),base={day:'2026-10-02',title:'附件回忆',body:'',photos:[]},saved=await call('/api/memories','POST',{...base,attachments:[{name:'声音.wav',data:bytes.toString('base64')},{name:'片段.mp4',data:Buffer.from('000000186674797069736f6d','hex').toString('base64')}]},a);assert.equal(saved.status,200);const id=saved.data.id;
  let row=(await call('/api/memories?month=2026-10', 'GET',undefined,b)).data[0];assert.equal(row.perspectives[0].attachments.length,2);const attachment=row.perspectives[0].attachments[0];
  assert.equal((await call('/api/memory-attachments/'+attachment.id,'GET',undefined,c)).status,404);assert.equal((await call('/api/memory-attachments/'+attachment.id+'?download=1','GET',undefined,b)).headers.get('content-disposition').includes('attachment'),true);
  const part=await call('/api/memory-attachments/'+attachment.id,'GET',undefined,b,'bytes=0-3');assert.equal(part.status,206);assert.equal(part.data.length,4);assert.equal((await call('/api/memory-attachments/'+attachment.id,'GET',undefined,a,'bytes=99-')).status,416);
  assert.equal((await call('/api/memories','POST',{...base,id,attachments:[],keepAttachments:[]},b)).status,200);row=(await call('/api/memories?month=2026-10','GET',undefined,a)).data[0];assert.equal(row.perspectives[0].attachments.length,2);
  const exported=(await call('/api/memoir/export','GET',undefined,b)).data.toString();assert.ok(exported.includes('<video controls'));assert.ok(exported.includes('data:audio/wav;base64'));
  assert.equal((await call('/api/memories','POST',{...base,id,attachments:[{name:'bad.mp4',data:'YmFk'}],keepAttachments:[]},a)).status,400);assert.equal((await call('/api/memories?month=2026-10','GET',undefined,a)).data[0].perspectives[0].attachments.length,2);
  await call('/api/memories','POST',{...base,id,attachments:[],keepAttachments:[attachment.id]},a);assert.equal((await call('/api/memories?month=2026-10','GET',undefined,a)).data[0].perspectives[0].attachments.length,1);
  db.prepare("UPDATE ledgers SET delete_at=?,delete_kind='ledger' WHERE id=1").run(Date.now()+10000);assert.equal((await call('/api/memories','POST',{...base,id},a)).status,423);assert.equal((await call('/api/memory-attachments/'+attachment.id,'GET',undefined,b)).status,200);db.exec('UPDATE ledgers SET delete_at=1 WHERE id=1');app.lifecycle.purge();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memory_attachments').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('头像清空后同一头像可以重新绘制，重复绘制保留已有图片',()=>{
 const source=readFileSync(new URL('./public/settings.js',import.meta.url),'utf8'),start=source.indexOf('function drawAvatar('),end=source.indexOf('function menuOpen',start);
 const draw=runInNewContext(source.slice(start,end)+';drawAvatar',{avatarRevision:1,el:()=>({})}),host={dataset:{},children:[],querySelector(){return this.children[0]||null;},replaceChildren(){this.children=[];},append(img){this.children.push(img);}},user={id:2,avatar:'pair-1-2',avatar_uploaded:false};
 draw(host,user);const first=host.children[0];assert.ok(first.src);draw(host,user);assert.equal(host.children[0],first);
 host.replaceChildren();draw(host,user);assert.equal(host.children.length,1);assert.equal(host.children[0].src,first.src);
 user.avatar_uploaded=true;draw(host,user);assert.match(host.children[0].src,/\/api\/avatars\/2/);host.replaceChildren();draw(host,user);assert.equal(host.children.length,1);
});

test('在线状态同账本隔离、多窗口在线、断开与心跳超时切换离开',()=>{
 const original=Date.now;let now=100000;Date.now=()=>now;const realtime=createRealtime(req=>req.user);
 const user={id:1,ledger_id:1},peer={id:2,ledger_id:1},other={id:3,ledger_id:2};
 const connect=(id,user)=>{const req=new EventEmitter();req.user=user;realtime.connect(id,user,req,{writeHead(){},write(){},end(){}});return req;};
 try{const one=connect('peer-one',peer);connect('other',other);assert.equal(realtime.state(user).peer_online,true);assert.equal(realtime.state(other).peer_online,false);const two=connect('peer-two',peer);one.emit('close');assert.equal(realtime.state(user).peer_online,true);now+=45001;assert.equal(realtime.state(user).peer_online,false);assert.equal(realtime.touch('peer-two',user,null),false);realtime.touch('peer-two',peer,null);assert.equal(realtime.state(user).peer_online,true);two.emit('close');assert.equal(realtime.state(user).peer_online,false);}finally{realtime.close();Date.now=original;}
});

function seed(db){db.exec("INSERT INTO ledgers(id,code) VALUES(1,'CHAT1234'),(2,'OTHER123');");for(const [id,name,ledger,seat] of [[1,'alice',1,1],[2,'bob',1,2],[3,'other',2,1]])db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?,?)').run(id,name,scryptSync('password-123','salt',64).toString('hex'),'salt',ledger,seat);}
test('聊天与倒序历史仅在首条、间隔五分钟或北京时间跨天时显示时间',()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),start=source.indexOf('function appendChatTime('),end=source.indexOf('const localDay=',start),markers=[];
 const append=runInNewContext(source.slice(start,end)+';appendChatTime',{Intl,Date,Math,el:(tag,text,style)=>({tag,text,style})}),list={append:marker=>markers.push(marker)},base=Date.parse('2026-10-02T12:00:00+08:00');
 append(list,base,null);append(list,base+60000,base);append(list,base+300000,base);append(list,base-60000,base);append(list,base-300000,base);
 append(list,Date.parse('2026-10-03T00:00:00+08:00'),Date.parse('2026-10-02T23:59:00+08:00'));
 assert.equal(markers.length,4);assert.ok(markers.every(m=>m.style==='chat-time-divider'));
});
test('历史检索组合筛选、北京时间边界、字面关键词、分页及账本隔离',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-chat-history-')),db=openDatabase(dir);seed(db);const service=chatService(db,()=>{});
 const insert=db.prepare('INSERT INTO chat_messages(ledger_id,sender,kind,text,created,retracted_at) VALUES(?,?,?,?,?,?)'),start=Date.parse('2026-10-02T00:00:00+08:00');
 try{
  insert.run(1,1,'text','边界前',start-1,null);insert.run(1,1,'text','Coffee 100%_你好',start,null);insert.run(1,2,'image','',start+1,null);insert.run(1,2,'audio','',start+2,null);insert.run(1,1,'text','已撤回',start+3,start+4);insert.run(1,1,'text','次日',start+86400000,null);insert.run(2,3,'text','Coffee 100%_你好',start,null);
  const query=params=>service.route({method:'GET'},null,new URL('http://local/api/chat/history?'+params),{id:1,ledger_id:1},{},()=>{});
  assert.equal((await query('from=2026-10-02&to=2026-10-02')).messages.length,3);
  assert.equal((await query('kind=image')).messages[0].kind,'image');assert.equal((await query('kind=audio')).messages.length,1);
  assert.equal((await query('from=2026-10-02&to=2026-10-02&kind=text&q=coffee')).messages.length,1);
  assert.equal((await query('q='+encodeURIComponent('%_'))).messages.length,1);assert.equal((await query('q=已撤回')).messages.length,0);
  for(const params of ['kind=bad','from=2026-02-30','from=2026-10-03&to=2026-10-02','before=-1'])await assert.rejects(query(params),e=>e.status===400);
  for(let i=0;i<55;i++)insert.run(1,1,'text','分页',start+i,null);
  const page=await query('q=分页');assert.equal(page.messages.length,50);assert.equal(page.more,true);const next=await query('q=分页&before='+page.messages.at(-1).id);assert.equal(next.messages.length,5);assert.equal(next.more,false);assert.equal(new Set([...page.messages,...next.messages].map(r=>r.id)).size,55);
 }finally{service.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
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
test('聊天文字、图片、语音附件只对本账本开放，支持范围播放、只读与到期清理',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-chat-')),app=createApplication({dataDir:dir,mailer:{ready:false}}),{db,server}=app;seed(db);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,method='GET',input,cookie='',range){const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...(range?{Range:range}:{})},body:input===undefined?undefined:JSON.stringify(input)});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};}
 try{
  const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie,c=(await call('/api/login','POST',{name:'other',password:'password-123'})).cookie;
  const html=(await call('/')).data.toString(),chatSource=readFileSync(new URL('./public/chat.js',import.meta.url)),digest=createHash('sha256').update(chatSource).digest('hex').slice(0,16);assert.ok(html.includes('/chat.js?v='+JSON.parse(readFileSync(new URL('./package.json',import.meta.url))).version+'-'+digest));assert.equal(chatSource.toString().includes('srcObject'),false);
  assert.equal((await call('/api/chat/messages')).status,401);
  assert.equal((await call('/api/chat/call','GET',undefined,a)).status,404);assert.equal((await call('/api/chat/call','POST',{action:'offer',sdp:'v=0'},a)).status,404);assert.equal((await call('/api/chat/config','GET',undefined,a)).status,404);
  assert.equal((await call('/api/chat/messages','POST',{kind:'text',text:'<script>想念你</script>'},a)).status,200);
  const png=await sharp({create:{width:20,height:20,channels:3,background:'#b87a90'}}).png().toBuffer();const image=(await call('/api/chat/messages','POST',{kind:'image',data:Buffer.concat([png,Buffer.alloc(20*1024*1024-png.length)]).toString('base64')},a)).data.id;
  assert.ok(Number.isSafeInteger(image));
  assert.equal((await call('/api/chat/messages','POST',{kind:'image',data:Buffer.alloc(20*1024*1024+1).toString('base64')},a)).status,400);
  const audio=(await call('/api/chat/messages','POST',{kind:'audio',duration:3,data:Buffer.from([0x1a,0x45,0xdf,0xa3,0,1,2,3]).toString('base64')},b)).data.id;
  const messages=(await call('/api/chat/messages','GET',undefined,b)).data.messages;assert.equal(messages.length,3);assert.equal(messages[0].text,'<script>想念你</script>');assert.equal(messages[2].sender,2);assert.equal(messages[2].duration,3);
  const download=await call('/api/chat/media/'+audio+'?download=1','GET',undefined,a);assert.equal(download.headers.get('content-disposition').includes('.webm'),true);assert.equal(download.data.length,8);assert.equal((await call('/api/chat/media/'+audio+'?download=1','GET',undefined,c)).status,404);
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
  db.prepare("UPDATE ledgers SET delete_at=?,delete_kind='ledger' WHERE id=1").run(Date.now()+10000);
  assert.equal((await call('/api/chat/messages','POST',{kind:'text',text:'禁止'},a)).status,423);
  assert.equal((await call('/api/chat/messages/'+audio+'/retract','POST',{},b)).status,423);
  assert.equal((await call('/api/chat/memory','POST',{ids:[image]},a)).status,423);
  assert.equal((await call('/api/chat/messages','GET',undefined,b)).status,200);
  db.prepare('UPDATE ledgers SET delete_at=1 WHERE id=1').run();app.lifecycle.purge();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memory_chat_messages').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('聊天分页及发送频率限制',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-call-')),db=openDatabase(dir);seed(db);let time=100000;const service=chatService(db,()=>{},{now:()=>time}),user={id:1,ledger_id:1},peer={id:2,ledger_id:1};
 const route=(user,method,pathname,input={})=>service.route({method},{},new URL(pathname,'http://localhost'),user,input,()=>{});
 try{
  for(let i=0;i<30;i++)await route(user,'POST','/api/chat/messages',{kind:'text',text:'消息'+i});await assert.rejects(route(user,'POST','/api/chat/messages',{kind:'text',text:'太频繁'}),e=>e.status===429);
  time+=60001;for(let i=0;i<25;i++)await route(user,'POST','/api/chat/messages',{kind:'text',text:'下一批'+i});const page=await route(user,'GET','/api/chat/messages');assert.equal(page.messages.length,50);assert.equal(page.more,true);assert.equal((await route(user,'GET','/api/chat/messages?before='+page.messages[0].id)).messages.length,5);
 }finally{service.close();db.close();rmSync(dir,{recursive:true,force:true});}
});

test('回忆回复双方各五条、并发限额、账本隔离、导出与删除级联',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-replies-')),app=createApplication({dataDir:dir,mailer:{ready:false}}),{db,server}=app;seed(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,method='GET',input,cookie=''){const response=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],data:response.headers.get('content-type')?.includes('json')?await response.json():await response.text()};}
 try{
  const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie,c=(await call('/api/login','POST',{name:'other',password:'password-123'})).cookie;
  const memory=(await call('/api/memories','POST',{day:'2026-10-07',title:'A',body:'原文',photos:[],keepPhotos:[]},a)).data.id,url='/api/memories/'+memory+'/replies';
  assert.equal((await call(url)).status,401);assert.equal((await call(url,'GET',undefined,c)).status,404);assert.equal((await call(url,'POST',{body:'越权'},c)).status,404);assert.equal((await call(url,'POST',{body:' '},a)).status,400);
  const sent=await Promise.all(Array.from({length:6},(_,i)=>call(url,'POST',{body:'回应'+i},a)));assert.equal(sent.filter(r=>r.status===200).length,5);assert.equal(sent.filter(r=>r.status===400).length,1);
  for(let i=0;i<5;i++)assert.equal((await call(url,'POST',{body:'对方'+i},b)).status,200);
  assert.equal((await call(url,'POST',{body:'第六条'},b)).status,400);const rows=(await call(url,'GET',undefined,a)).data;assert.equal(rows.length,10);assert.deepEqual(rows.map(r=>r.id),[...rows.map(r=>r.id)].sort((a,b)=>a-b));assert.equal((await call('/api/timeline','GET',undefined,a)).data[0].replies.length,10);assert.equal(db.prepare('SELECT body FROM perspectives WHERE memory_id=?').get(memory).body,'原文');
  const {memoirDocument}=await import('./memoir-export.mjs');const exported=[...memoirDocument(db,1)].join('');assert.ok(exported.includes('后来的回应'));assert.ok(exported.includes('对方4'));
  db.prepare('UPDATE ledgers SET delete_at=? WHERE id=1').run(Date.now()+86400000);assert.equal((await call(url,'POST',{body:'只读'},a)).status,423);db.prepare('UPDATE ledgers SET delete_at=NULL WHERE id=1').run();assert.equal((await call('/api/memories/'+memory,'DELETE',undefined,a)).status,200);assert.equal(db.prepare('SELECT count(*) AS n FROM memory_replies').get().n,0);assert.equal((await call(url,'GET',undefined,b)).status,404);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('回忆录同一天共享日期节点，保留独立回忆卡片',async()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),nodes=new Map();class Node{constructor(tag,text,cls){this.tag=tag;this.text=text;this.cls=cls;this.children=[];}append(...items){this.children.push(...items);}replaceChildren(){this.children=[];}setAttribute(){}}
 const rows=[{id:1,day:'2026-10-07',title:'A'},{id:2,day:'2026-10-07',title:'B'},{id:3,day:'2026-10-08',title:'C'}];const context={timelineVersion:0,view:'timeline',api:async()=>rows,$:key=>{if(!nodes.has(key))nodes.set(key,new Node());return nodes.get(key);},el:(...args)=>new Node(...args),conversation:()=>new Node(),Set};
 const load=runInNewContext(source.slice(source.indexOf('async function loadTimeline(){'),source.indexOf("$('#calendar-view').onclick"))+';loadTimeline',context);await load();const days=nodes.get('#timeline-list').children.filter(n=>n.cls==='timeline-item');assert.equal(days.length,2);assert.equal(days[0].children[0].dateTime,'2026-10-07');assert.equal(days[0].children[1].children.length,2);assert.equal(days[1].children[1].children.length,1);
});

test('回忆卡片展示继续回应入口、已有回复及点击行为',()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');class Node{constructor(tag,text,cls){this.tag=tag;this.text=text;this.cls=cls;this.children=[];}append(...items){this.children.push(...items);}}let opened=null;const memory={id:12,perspectives:[],replies:[{body:'回应'}]};const render=runInNewContext(source.slice(source.indexOf('function conversation(r){'),source.indexOf('function previews()'))+';conversation',{el:(...args)=>new Node(...args),currentUser:{id:1},replyBubble:r=>new Node('p',r.body),openMemoryReplies:r=>{opened=r;}});const card=render(memory),button=card.children.find(n=>n.cls==='memory-reply-open');assert.ok(button);assert.equal(button.type,'button');assert.equal(button.text,'继续回应 · 1');button.onclick();assert.equal(opened,memory);assert.ok(card.children.find(n=>n.cls==='memory-replies'));
});

test('录音错误区分权限拒绝、设备占用及启动中断',async()=>{
 const source=readFileSync(new URL('./public/chat.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function microphone(){'),source.indexOf("$('#chat-record').onclick"));
 for(const [name,text] of [['NotAllowedError','全局麦克风'],['NotReadableError','其他应用'],['NotFoundError','未找到'],['AbortError','中断']]){const microphone=runInNewContext(code+';microphone',{navigator:{mediaDevices:{getUserMedia:async()=>{throw {name};}}},Error});await assert.rejects(microphone(),error=>error.message.includes(text));}
 const stream={};const microphone=runInNewContext(code+';microphone',{navigator:{mediaDevices:{getUserMedia:async()=>stream}},Error});assert.equal(await microphone(),stream);
});

test('App更新接口匿名读取、下载校验、发布单调构建号及路径隔离',async()=>{
 const {writeFileSync,mkdirSync}=await import('node:fs'),{spawnSync}=await import('node:child_process');const dir=mkdtempSync(path.join(os.tmpdir(),'love-app-update-')),folder=path.join(dir,'app-updates'),apk=path.join(dir,'fixture.apk');writeFileSync(apk,Buffer.from([0x50,0x4b,3,4,1,2,3]));const app=createApplication({dataDir:dir,mailer:{ready:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 try{
  assert.deepEqual(await (await fetch(origin+'/api/app/update')).json(),{available:false});
  const publish=code=>spawnSync(process.execPath,['scripts/publish-app.mjs',apk,folder,String(code),'1.8.0','升级测试'],{encoding:'utf8'});assert.equal(publish(10801).status,0);assert.notEqual(publish(10801).status,0);assert.notEqual(publish(10800).status,0);
  const imported=path.join(dir,'imported'),importRelease=()=>spawnSync(process.execPath,['scripts/import-app-release.mjs',folder,imported],{encoding:'utf8'});assert.equal(importRelease().status,0);assert.equal(importRelease().status,0);
  const result=await fetch(origin+'/api/app/update'),info=await result.json();assert.equal(result.status,200);assert.equal(info.versionCode,10801);assert.equal(info.packageId,'xyz.ourdays.mobile');assert.match(info.sha256,/^[a-f0-9]{64}$/);
  const download=await fetch(origin+info.downloadUrl),data=Buffer.from(await download.arrayBuffer());assert.equal(download.headers.get('content-type'),'application/vnd.android.package-archive');assert.equal(createHash('sha256').update(data).digest('hex'),info.sha256);assert.equal(data.length,info.size);assert.equal((await fetch(origin+'/api/app/download/missing.apk')).status,404);assert.equal((await fetch(origin+'/api/app/update',{method:'POST'})).status,405);
  writeFileSync(path.join(folder,'latest.json'),JSON.stringify({...info,sha256:'a'.repeat(64)}));assert.notEqual(importRelease().status,0);writeFileSync(path.join(folder,'latest.json'),JSON.stringify({...info,filename:'../fixture.apk'}));assert.notEqual(importRelease().status,0);assert.equal((await fetch(origin+'/api/app/update')).status,503);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('日历左右滑动切月，竖向滚动、点击、多指及取消不切换，滑动后阻止误点',()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),handlers={},moves=[],grid={clientWidth:360,addEventListener:(type,handler)=>{handlers[type]=handler;}},context={Set,Math,Date,view:'calendar',month:'2026-10',document:{querySelector:()=>null},move:delta=>moves.push(delta)};
 const bind=runInNewContext(source.slice(source.indexOf('function calendarSwipe(grid){'),source.indexOf("calendarSwipe($('#grid'))"))+';calendarSwipe',context);bind(grid);const event=(x,y,id=1)=>({pointerType:'touch',button:0,pointerId:id,clientX:x,clientY:y});
 handlers.pointerdown(event(250,100));handlers.pointerup(event(120,105));assert.deepEqual(moves,[1]);let prevented=false;handlers.click({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);
 handlers.pointerdown(event(100,100));handlers.pointerup(event(240,110));assert.deepEqual(moves,[1,-1]);
 handlers.pointerdown(event(100,100));handlers.pointermove(event(105,180));handlers.pointerup(event(220,200));
 handlers.pointerdown(event(100,100));handlers.pointerup(event(105,100));
 handlers.pointerdown(event(250,100));handlers.pointercancel(event(250,100));handlers.pointerup(event(100,100));
 handlers.pointerdown(event(250,100));handlers.pointerdown(event(200,100,2));handlers.pointerup(event(100,100));handlers.pointerup(event(100,100,2));assert.deepEqual(moves,[1,-1]);
 handlers.pointerdown(event(250,100));context.month='2026-11';handlers.pointerup(event(100,100));assert.deepEqual(moves,[1,-1]);
 const moveContext={month:'2000-01',selected:'2000-01-01',Date,String,load:()=>{}},move=runInNewContext(source.slice(source.indexOf('function move(delta){'),source.indexOf("$('#prev').onclick"))+';move',moveContext);move(-1);assert.equal(moveContext.month,'2000-01');moveContext.month='9999-12';move(1);assert.equal(moveContext.month,'9999-12');moveContext.month='2026-12';move(1);assert.equal(moveContext.month,'2027-01');
});
