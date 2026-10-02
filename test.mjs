import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

test('双人私密日历完整流程',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-calendar-'));
 const port=19387, origin=`http://127.0.0.1:${port}`;
 let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,APP_ORIGIN:origin,USER1_NAME:'alice',USER1_PASSWORD:'alice-test-password',USER2_NAME:'bob',USER2_PASSWORD:'bob-test-password'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',x=>errors+=x);await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors);}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('启动超时')),10000);timer.unref();})]);}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function call(url,method='GET',data,cookie='',customOrigin=origin){const r=await fetch(origin+url,{method,headers:{Origin:customOrigin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:r.headers.get('content-type')?.startsWith('application/json')?await r.json():await r.arrayBuffer()};}
 try {
  await start();
  assert.equal((await call('/api/memories?month=2026-02')).status,401);
  assert.equal((await call('/api/timeline')).status,401);
  assert.equal((await call('/api/login','POST',{name:'third',password:'not-allowed'})).status,401);
  assert.equal((await call('/api/register','POST',{})).status,400);
  const a=await call('/api/login','POST',{name:'alice',password:'alice-test-password'});assert.equal(a.status,200);assert.ok(a.cookie);
  const b=await call('/api/login','POST',{name:'bob',password:'bob-test-password'});assert.equal(b.status,200);
  assert.equal((await call('/api/calendars','POST',{},a.cookie)).status,404);
  assert.deepEqual((await call('/api/timeline','GET',undefined,a.cookie)).data,[]);
  const entry={day:'2026-02-14',title:'我们的回忆',body:'一起看海 <script>不可执行</script>',photos:[{data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='}]};
  assert.equal((await call('/api/memories','POST',entry,a.cookie,'https://evil.example')).status,403);
  for(const day of ['1999-12-31','2026-02-30','2027-02-29']) assert.equal((await call('/api/memories','POST',{...entry,day},a.cookie)).status,400);
  const created=await call('/api/memories','POST',entry,a.cookie);assert.equal(created.status,200);
  let rows=(await call('/api/memories?month=2026-02','GET',undefined,b.cookie)).data;assert.equal(rows.length,1);assert.equal(rows[0].title,entry.title);assert.equal(rows[0].photos.length,1);
  const photo=rows[0].photos[0];assert.equal((await call('/api/photos/'+photo)).status,401);assert.equal((await call('/api/photos/'+photo,'GET',undefined,b.cookie)).status,200);
  const earlier=await call('/api/memories','POST',{...entry,day:'2000-01-01',photos:[]},b.cookie);
  const later=await call('/api/memories','POST',{...entry,day:'2027-01-31',photos:[]},a.cookie);
  const sameDay=await call('/api/memories','POST',{...entry,photos:[]},b.cookie);
  const timeline=(await call('/api/timeline','GET',undefined,b.cookie)).data;
  assert.deepEqual(timeline.map(r=>r.id),[earlier.data.id,created.data.id,sameDay.data.id,later.data.id]);
  assert.deepEqual(timeline.map(r=>r.author_name),['bob','alice','bob','alice']);
  assert.deepEqual(timeline[1].photos,[photo]);
  assert.equal(timeline[1].body,entry.body);
  for(const id of [earlier.data.id,later.data.id,sameDay.data.id]) await call('/api/memories/'+id,'DELETE',{},a.cookie);
  assert.equal((await call('/api/memories','POST',{...entry,id:created.data.id,title:'两人共同编辑',photos:[],keepPhotos:[photo]},b.cookie)).status,200);
  assert.equal((await call('/api/memories','POST',{...entry,photos:[{data:Buffer.from('<svg>bad</svg>').toString('base64')}]},a.cookie)).status,400);
  await stop();await start();
  rows=(await call('/api/memories?month=2026-02','GET',undefined,a.cookie)).data;assert.equal(rows[0].title,'两人共同编辑');assert.deepEqual(rows[0].photos,[photo]);
  assert.equal((await call('/api/memories/'+created.data.id,'DELETE',{},b.cookie)).status,200);
  assert.equal((await call('/api/photos/'+photo,'GET',undefined,a.cookie)).status,404);
  assert.equal((await call('/api/logout','POST',{},a.cookie)).status,200);assert.equal((await call('/api/me','GET',undefined,a.cookie)).status,401);
 }finally{if(child?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});

test('旧图片链接被捕获并在页内预览，外部图片不受影响',()=>{
 let handler,prevented=0,stopped=0,opened=0;
 const image={src:'https://calendar.example/api/photos/'+'a'.repeat(36),alt:'回忆照片'};
 const viewer={open:false,showModal(){this.open=true;opened++;}},large={};
 class Element {closest(selector){if(selector==='#photo-viewer')return null;if(selector==='img')return image;return null;}}
 runInNewContext(readFileSync(new URL('./public/photo-preview.js',import.meta.url),'utf8'),{
  Element,URL,location:{href:'https://calendar.example/',origin:'https://calendar.example'},
  document:{addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);handler=fn;},querySelector(selector){return selector==='#photo-viewer'?viewer:large;}}
 });
 const event={target:new Element(),preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}};
 handler(event);assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(opened,1);assert.equal(large.src,image.src);
 handler(event);assert.equal(opened,1);image.dataset={original:image.src};image.src+='?size=thumb';handler(event);assert.equal(large.src,image.dataset.original);
 image.src='https://external.example/photo.png';handler(event);assert.equal(prevented,3);
});

test('打开编辑框立即报告状态，编辑窗口内显示对方提示，后台不立即清除状态',async()=>{
 const elements=new Map(),events={},calls=[],timers=new Map();let nextTimer=0;
 const get=selector=>{if(!elements.has(selector))elements.set(selector,{hidden:true,textContent:'',open:false,attributes:{},append(child){child.host=this;},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},elements:{day:{value:'2026-09-29',addEventListener(){}}},addEventListener(type,fn){events[selector+':'+type]=fn;}});return elements.get(selector);};
 const document={hidden:false,addEventListener(type,fn){events[type]=fn;}};
 const context={document,window:{addEventListener(){}},$:get,currentUser:{id:1},load(){},Intl,Date,Math,console,
 crypto:{getRandomValues(a){return a.fill(1);}},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},EventSource:class{close(){} addEventListener(type,fn){events["sse:"+type]=fn;}},
 fetch(){return Promise.resolve({json:async()=>[]});},api:async(url,method,data)=>{calls.push(data);return {revision:'v1',interval:15000,peer:null};}};
 runInNewContext(readFileSync(new URL('./public/realtime.js',import.meta.url),'utf8')+';this.controls={startRealtime,announceEditing,showPeer,refreshShared};',context);
 context.controls.startRealtime();get('#editor').open=true;context.controls.announceEditing();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls[0].day,'2026-09-29');assert.equal(get('#presence-float').host,get('#editor'));
 context.controls.showPeer({name:'另一位',day:'2026-09-29',started:'one'});
 assert.equal(get('#editor-presence-note').hidden,false);assert.ok(get('#editor-presence-note').textContent.includes(get('#presence-note').textContent));
 assert.equal(get('#presence-float').hidden,false);assert.equal(get('#presence-toggle').getAttribute('aria-expanded'),'true');
 [...timers.values()].find(t=>t.ms===5000).fn();assert.equal(get('#presence-toggle').getAttribute('aria-expanded'),'false');
 get('#presence-toggle').onclick();assert.equal(get('#presence-toggle').getAttribute('aria-expanded'),'true');
 context.controls.refreshShared();assert.equal(get('#editor-sync-note').hidden,false);
 const before=calls.length;document.hidden=true;events.visibilitychange();assert.equal(calls.length,before);
 document.hidden=false;events.visibilitychange();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1).day,'2026-09-29');
 get('#editor').open=false;events['#editor:close']();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1).day,null);assert.equal(get('#presence-float').host,get('#app'));
});

test('首页短句数量、去重及本地时段边界',()=>{
 const quotes=JSON.parse(readFileSync(new URL('./public/home-quotes.json',import.meta.url),'utf8'));
 for(const key of ['morning','noon','evening','predawn'])assert.equal(quotes[key].length,90);
 assert.equal(quotes.general.length,160);assert.equal(new Set(Object.values(quotes).flat()).size,520);
 const source=readFileSync(new URL('./public/features.js',import.meta.url),'utf8');
 const pool=runInNewContext(source.slice(source.indexOf('function homeQuotePool'),source.indexOf('const homeQuoteHour'))+'\nhomeQuotePool');
 for(const [hour,period] of [[0,'predawn'],[5,'predawn'],[6,'morning'],[10,'morning'],[11,'noon'],[16,'noon'],[17,'evening'],[23,'evening']]){
  const result=Array.from(pool(quotes,hour));assert.equal(result.length,250);
  assert.deepEqual(result,[...quotes[period],...quotes.general]);
 }
 assert.deepEqual(Array.from(pool({},8)),[]);
});

test('返回键逐层关闭弹窗，按钮关闭及快速切换不残留历史',()=>{
 const queue=[],listeners={};
 const dialogs=['day','editor','photo','profile','password'].map(id=>({id,open:false,events:{},showModal(){this.open=true;},close(){if(!this.open)return;this.open=false;queue.push(()=>this.events.close?.());},addEventListener(name,fn){this.events[name]=fn;}}));
 const entries=[null];let cursor=0;
 const history={get state(){return entries[cursor];},replaceState(value){entries[cursor]=value;},pushState(value){entries.splice(cursor+1);entries.push(value);cursor++;},go(delta){queue.push(()=>{cursor+=delta;assert.ok(cursor>=0);listeners.popstate();});}};
 runInNewContext(readFileSync(new URL('./public/dialog-history.js',import.meta.url),'utf8'),{history,document:{querySelectorAll:()=>dialogs},window:{addEventListener:(event,fn)=>listeners[event]=fn}});
 const flush=()=>{let n=0;while(queue.length){assert.ok(n++<40,'history loop');queue.shift()();}};
 const [day,editor,photo,profile,password]=dialogs;
 day.showModal();editor.showModal();photo.showModal();assert.equal(cursor,3);
 history.go(-1);flush();assert.equal(photo.open,false);assert.equal(editor.open,true);assert.equal(day.open,true);
 history.go(-1);flush();assert.equal(editor.open,false);assert.equal(day.open,true);
 day.close();flush();assert.equal(cursor,0);
 for(let i=0;i<3;i++){day.showModal();day.close();flush();assert.equal(cursor,0);}
 profile.showModal();profile.close();password.showModal();flush();assert.equal(cursor,1);assert.equal(password.open,true);
 history.go(-1);flush();assert.equal(password.open,false);assert.equal(cursor,0);
 history.go(1);flush();assert.equal(password.open,false);
 day.showModal();editor.showModal();dialogs.forEach(d=>d.close());flush();assert.equal(dialogs.some(d=>d.open),false);
 day.showModal();day.events.cancel({preventDefault(){}});flush();assert.equal(day.open,false);
});
