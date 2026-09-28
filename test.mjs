import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
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
