import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {scryptSync} from 'node:crypto';
import {createSpeechRecognizer,speechService} from './speech.mjs';
import {openDatabase} from './db.mjs';
import {createApplication} from './server.mjs';
async function wav(){const s=readFileSync(new URL('./public/speech.js',import.meta.url),'utf8'),encode=runInNewContext(s.slice(s.indexOf('function speechWav('),s.indexOf('async function speechAudio'))+';speechWav',{Blob,ArrayBuffer,DataView,Math});return Buffer.from(await encode(new Float32Array([0,1,-1,0.25])).arrayBuffer());}
test('16k PCM 转换、腾讯云签名和结果解析；密钥与空结果错误不泄漏',async()=>{
 const data=await wav(),calls=[];assert.equal(data.length,52);assert.equal(data.readInt16LE(46),32767);assert.equal(data.readInt16LE(48),-32768);
 const env={TENCENT_ASR_SECRET_ID:'test-id',TENCENT_ASR_SECRET_KEY:'test-secret'},recognizer=createSpeechRecognizer({env,now:()=>1600000000000,fetcher:async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({Response:options.headers['X-TC-Action']==='CreateRecTask'?{Data:{TaskId:123}}:{Data:{Status:2,ResultDetail:[{FinalSentence:'今天很开心。'}]}}})};}});
 assert.equal(await recognizer.create(data),123);assert.deepEqual(await recognizer.status(123),{status:'done',text:'今天很开心。'});assert.equal(JSON.parse(calls[0].body).DataLen,52);assert.equal(JSON.parse(calls[0].body).SourceType,1);assert.match(calls[0].headers.Authorization,/Credential=test-id\/2020-09-13\/asr\/tc3_request/);assert.match(calls[0].headers.Authorization,/Signature=[a-f0-9]{64}$/);
 await assert.rejects(createSpeechRecognizer({env:{}}).create(data),e=>e.status===503);
 for(const [response,status] of [[{Error:{Code:'AuthFailure',Message:'test-secret'}},503],[{Data:{Status:2,Result:''}},422]]){const r=createSpeechRecognizer({env,fetcher:async()=>({ok:true,json:async()=>({Response:response})})});await assert.rejects(r.status(123),e=>e.status===status&&!e.message.includes('test-secret'));}
});
test('鉴权错误区分密钥、权限、时间及Token，凭证去除首尾空格且不回传原始错误',async()=>{
 const reasons={'AuthFailure.SecretIdNotFound':'SecretId','AuthFailure.SignatureFailure':'同一对','AuthFailure.SignatureExpire':'服务器时间','AuthFailure.TokenFailure':'Token','AuthFailure.UnauthorizedOperation':'权限'};
 for(const [code,reason] of Object.entries(reasons)){
  const recognizer=createSpeechRecognizer({env:{TENCENT_ASR_SECRET_ID:' test-id ',TENCENT_ASR_SECRET_KEY:' test-secret ',TENCENT_ASR_TOKEN:' '},fetcher:async(_url,options)=>{assert.match(options.headers.Authorization,/Credential=test-id\//);assert.equal(options.headers['X-TC-Token'],undefined);return {ok:true,json:async()=>({Response:{Error:{Code:code,Message:'test-secret'}}})};}});
  await assert.rejects(recognizer.status(123),error=>error.status===503&&error.message.includes(code)&&error.message.includes(reason)&&!error.message.includes('test-secret'));
 }
});
test('转写鉴权、账本隔离、任务复用、不自动发送文字、撤回与只读保护',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-speech-'));let creates=0,shortCalls=0;
 const app=createApplication({dataDir:dir,mailer:{ready:false},speechRecognizer:{async short(){shortCalls++;if(shortCalls===1)throw Error('AuthFailure.UnauthorizedOperation');return {status:'done',text:'测试识别结果'};},async create(){creates++;return 123;},async status(){return {status:'done',text:'测试识别结果'};}}}),{db,server}=app;
 db.prepare("INSERT INTO ledgers(id,code) VALUES(1,'SPEECH1'),(2,'SPEECH2')").run();for(const [id,name,ledger,seat] of [[1,'alice',1,1],[2,'bob',1,2],[3,'other',2,1]]){const salt='speech-salt';db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?,?)').run(id,name,scryptSync('password-123',salt,64).toString('hex'),salt,ledger,seat);}
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(url,method='GET',input,cookie=''){const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie,c=(await call('/api/login','POST',{name:'other',password:'password-123'})).cookie,data=(await wav()).toString('base64');
  assert.equal((await call('/api/chat/transcriptions','POST',{data})).status,401);assert.equal((await call('/api/chat/transcriptions','POST',{data:'junk'},a)).status,400);
  const messageId=(await call('/api/chat/messages','POST',{kind:'audio',data},a)).data.id;assert.equal((await call('/api/chat/transcriptions','POST',{data,messageId},c)).status,404);assert.equal(creates,0);
  const job=await call('/api/chat/transcriptions','POST',{data,messageId},a);assert.equal(job.status,200);const url='/api/chat/transcriptions/'+job.data.id;
  assert.equal((await call(url,'GET',undefined,b)).status,200);assert.equal((await call(url,'GET',undefined,c)).status,404);assert.equal((await call('/api/chat/transcriptions','POST',{data,messageId},a)).data.id,job.data.id);assert.equal(creates,1);
  assert.deepEqual((await call(url,'GET',undefined,a)).data,{status:'done',text:'测试识别结果'});assert.equal(db.prepare('SELECT count(*) AS n FROM chat_messages').get().n,1);assert.equal((await call('/api/chat/messages','GET',undefined,a)).data.messages[0].transcript,'测试识别结果');assert.equal((await call('/api/chat/messages','GET',undefined,b)).data.messages[0].transcript,'测试识别结果');assert.equal((await call('/api/chat/history?kind=audio','GET',undefined,a)).data.messages[0].transcript,'测试识别结果');const peerJob=await call('/api/chat/transcriptions','POST',{messageId},b);assert.equal(peerJob.data.status,'done');assert.equal(peerJob.data.text,'测试识别结果');assert.equal(creates,1);assert.equal(shortCalls,1);assert.equal((await call('/api/chat/transcriptions/'+peerJob.data.id,'GET',undefined,b)).data.status,'done');assert.equal((await call('/api/chat/messages','GET',undefined,b)).data.messages[0].transcript,'测试识别结果');
  const lookup='/api/chat/transcriptions/message/'+messageId,visibility=lookup+'/visibility';
  assert.deepEqual((await call(lookup,'GET',undefined,b)).data,{status:'done',text:'测试识别结果',hidden:false});
  assert.equal((await call(lookup,'GET',undefined,c)).status,404);assert.equal((await call(visibility,'POST',{hidden:true},c)).status,404);
  assert.equal((await call(visibility,'POST',{hidden:'true'},b)).status,400);
  assert.equal((await call(visibility,'POST',{hidden:true},b)).status,200);
  assert.equal((await call(lookup,'GET',undefined,b)).data.hidden,true);assert.equal((await call(lookup,'GET',undefined,a)).data.hidden,false);
  assert.equal((await call('/api/chat/messages','GET',undefined,b)).data.messages[0].transcript_hidden,1);
  assert.equal((await call('/api/chat/history?kind=audio','GET',undefined,b)).data.messages[0].transcript_hidden,1);
  assert.equal((await call('/api/chat/messages','GET',undefined,a)).data.messages[0].transcript_hidden,0);
  await call(visibility,'POST',{hidden:false},b);assert.equal((await call(lookup,'GET',undefined,b)).data.hidden,false);assert.equal(shortCalls,1);assert.equal(creates,1);
  db.prepare('UPDATE ledgers SET delete_at=? WHERE id=1').run(Date.now()+86400000);
  assert.equal((await call(lookup,'GET',undefined,b)).data.text,'测试识别结果');assert.equal((await call(visibility,'POST',{hidden:true},b)).status,423);
  db.exec('UPDATE ledgers SET delete_at=NULL WHERE id=1');
  await call('/api/chat/messages/'+messageId+'/retract','POST',{},a);assert.equal((await call(url,'GET',undefined,a)).status,404);assert.equal(db.prepare('SELECT count(*) AS n FROM chat_transcriptions').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM chat_transcription_visibility').get().n,0);assert.equal((await call(lookup,'GET',undefined,b)).status,404);db.prepare('UPDATE ledgers SET delete_at=? WHERE id=1').run(Date.now()+86400000);assert.equal((await call('/api/chat/transcriptions','POST',{data},a)).status,423);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('同步短音频请求格式及直接结果，空结果拒绝',async()=>{
 const data=await wav(),env={TENCENT_ASR_SECRET_ID:'id',TENCENT_ASR_SECRET_KEY:'key'};
 const recognizer=createSpeechRecognizer({env,fetcher:async(_,options)=>{assert.equal(options.headers['X-TC-Action'],'SentenceRecognition');const body=JSON.parse(options.body);assert.equal(body.VoiceFormat,'wav');assert.equal(body.EngSerViceType,'16k_zh');assert.equal(body.DataLen,data.length);assert.equal(Buffer.from(body.Data,'base64').equals(data),true);return {ok:true,json:async()=>({Response:{Result:' 快速结果 '}})};}});
 assert.deepEqual(await recognizer.short(data),{status:'done',text:'快速结果'});
 const empty=createSpeechRecognizer({env,fetcher:async()=>({ok:true,json:async()=>({Response:{Result:''}})})});await assert.rejects(empty.short(data),e=>e.status===422);
});


test('双方同时转写共享进行中任务，草稿任务隔离，重建服务复用已有文字',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-speech-shared-')),db=openDatabase(dir);let finish,calls=0;
 try{
  db.exec("INSERT INTO ledgers(id,code) VALUES(1,'SHARED01'),(2,'SHARED02'); INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'a','x','x',1,1),(2,'b','x','x',1,2),(3,'c','x','x',2,1); INSERT INTO chat_messages(id,ledger_id,sender,kind,text,created) VALUES(1,1,1,'audio','',1);");
  const recognizer={short:()=>{calls++;return new Promise(resolve=>finish=resolve);}},service=speechService(db,recognizer),a={id:1,ledger_id:1},b={id:2,ledger_id:1},c={id:3,ledger_id:2};
  const call=(path,method,input={},user=a)=>service({method},{pathname:'/api/chat/transcriptions'+path},user,input,()=>{}),data=(await wav()).toString('base64');
  assert.deepEqual(await call('/message/1','GET'),{status:'missing'});
  const first=call('','POST',{data,messageId:1});const peer=await call('','POST',{messageId:1},b);assert.equal(peer.status,'pending');assert.equal(calls,1);
  assert.equal((await call('/message/1','GET',{},b)).id,peer.id);assert.equal((await call('/'+peer.id,'GET',{},b)).status,'pending');
  await assert.rejects(call('/'+peer.id,'GET',{},c),e=>e.status===404);finish({status:'done',text:'一次识别，双方查看'});await first;
  const fresh=speechService(db,{short:()=>{throw Error('Must not reupload');}});
  assert.equal((await fresh({method:'POST'},{pathname:'/api/chat/transcriptions'},b,{messageId:1},()=>{})).text,'一次识别，双方查看');
  const draft=call('','POST',{data});finish({status:'done',text:'草稿'});const result=await draft;
  await assert.rejects(call('/'+result.id,'GET',{},b),e=>e.status===404);assert.equal(calls,2);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});


test('长按菜单可收回并重新展示转文字，缓存拉取不读取或上传音频',async()=>{
 const source=readFileSync('public/speech.js','utf8'),nodes=new Map(),texts=[],calls=[];let lookups=0;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
 const el=()=>({dataset:{},setAttribute(){},classList:{toggle(){}},textContent:'',hidden:false});
 const context={chatOwner:1,chatContextRow:null,chatRows:[],currentUser:{},$,el,document:{querySelectorAll:()=>texts},closeChatMenu(){},chatStatus:message=>{throw Error(message);},fetch:()=>{throw Error('Must not download voice');},Date,Map,Boolean,String,Number,Math,Blob,ArrayBuffer,DataView};
 context.api=async(url,method,input)=>{calls.push({url,method,input});if(url.endsWith('/visibility'))return {hidden:input.hidden};lookups++;return {status:'done',text:'共用的识别文字',hidden:false};};
 const harness=runInNewContext(source+';({speechTranscript,configureSpeechMenu,paintSpeech,closeSpeech});',context),row={id:42,kind:'audio',transcript:null,transcript_hidden:0};context.chatRows.push(row);
 const card={append:node=>texts.push(node)};harness.speechTranscript(card,row);context.chatContextRow=row;
 await $('#chat-context-transcribe').onclick();assert.equal(lookups,1);assert.equal(texts[0].textContent,'共用的识别文字');assert.equal(texts[0].hidden,false);assert.equal(calls.some(c=>c.input?.data),false);
 harness.configureSpeechMenu(row);assert.equal($('#chat-context-transcribe').textContent,'收回语音转文字');
 await $('#chat-context-transcribe').onclick();assert.equal(row.transcript_hidden,1);assert.equal(texts[0].hidden,true);
 harness.paintSpeech(42,{status:'done',text:'共用的识别文字'});assert.equal(texts[0].hidden,true);
 harness.configureSpeechMenu(row);assert.equal($('#chat-context-transcribe').textContent,'显示语音转文字');
 await $('#chat-context-transcribe').onclick();assert.equal(row.transcript_hidden,0);assert.equal(texts[0].hidden,false);assert.equal(lookups,1);assert.equal(calls.length,3);
 harness.closeSpeech();row.transcript_hidden=1;harness.speechTranscript(card,row);assert.equal(texts.at(-1).hidden,true);assert.equal(texts.at(-1).textContent,'共用的识别文字');
});
