import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHolidaySync} from './holidays.mjs';
import {monthDetails} from './calendar.mjs';
import {createApplication} from './server.mjs';
import {createHash} from 'node:crypto';

const baseTime=Date.parse('2026-11-06T00:00:00Z'),dayMs=86400000,refreshMs=30*dayMs;
const data=(year,days=[{date:year+'-01-01',name:'元旦',isOffDay:true}])=>({year,papers:['https://www.gov.cn/zhengce/example.htm'],days});
const fixture=()=>mkdtempSync(path.join(os.tmpdir(),'love-holidays-'));

test('假期后台同步不阻塞月历，并发去重，缓存不污染农历基础数据',async()=>{
 const dir=fixture(),original=structuredClone(monthDetails('2026-01'));let finish,calls=0;
 const service=createHolidaySync({dataDir:dir,now:()=>baseTime,fetcher:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 try{
  assert.equal(service.month('2026-01').holiday_syncing,true);service.month('2026-02');assert.equal(calls,1);
  const pending=service.refresh(2026);finish(Response.json(data(2026,[{date:'2026-01-01',name:'元旦',isOffDay:true},{date:'2026-01-04',name:'元旦',isOffDay:false}])));await pending;
  const month=service.month('2026-01');assert.equal(month.holiday_syncing,false);assert.equal(month.holiday_source,'synced');assert.deepEqual(month.days.find(row=>row.day==='2026-01-04').holiday,{name:'元旦',work:true});assert.equal(month.days.find(row=>row.day==='2026-01-02').holiday,null);assert.equal(month.holiday_synced_at,baseTime);assert.equal(calls,1);assert.deepEqual(monthDetails('2026-01'),original);
  assert.equal(JSON.parse(readFileSync(path.join(dir,'holiday-cache','2026.json'),'utf8')).data.year,2026);
 }finally{service.close();rmSync(dir,{recursive:true,force:true});}
});

test('每30天检查，期间打开和重启不重复下载，离线保留上次数据并退避重试',async()=>{
 const dir=fixture();let time=baseTime,calls=0;const first=createHolidaySync({dataDir:dir,now:()=>time,fetcher:async()=>{calls++;return Response.json(data(2026));}});let second;
 try{
  await first.refresh(2026);time+=dayMs;await first.refresh(2026);assert.equal(calls,1);time+=refreshMs-dayMs-1;await first.refresh(2026);assert.equal(calls,1);first.close();
  second=createHolidaySync({dataDir:dir,now:()=>time,fetcher:async()=>{calls++;throw Error('offline');}});assert.equal(second.month('2026-01').holiday_source,'synced');assert.equal(calls,1);
  time+=2;await second.refresh(2026);assert.equal(calls,3);const result=second.month('2026-01');assert.equal(result.holiday_source,'cache');assert.equal(result.holiday_syncing,false);assert.equal(result.days[0].holiday.name,'元旦');await second.refresh(2026);assert.equal(calls,3);
  time+=3600001;await second.refresh(2026);assert.equal(calls,5);
 }finally{first.close();second?.close();rmSync(dir,{recursive:true,force:true});}
});

test('下载失败切换备用源，拒绝错误年份、重复日期、错误类型和无公告数据',async()=>{
 const dir=fixture();let time=baseTime,mode='fallback',calls=[];
 const service=createHolidaySync({dataDir:dir,now:()=>time,fetcher:async url=>{calls.push(url);return mode==='fallback'&&url.includes('cdn.jsdelivr.net')?Response.json(data(2026)):Response.json({...data(2026),year:2025});}});
 try{
  await service.refresh(2026);assert.equal(calls.length,2);assert.equal(service.month('2026-01').holiday_source,'synced');const saved=readFileSync(path.join(dir,'holiday-cache','2026.json'),'utf8');mode='invalid';time+=refreshMs+1;await service.refresh(2026);assert.equal(readFileSync(path.join(dir,'holiday-cache','2026.json'),'utf8'),saved);assert.equal(service.month('2026-01').holiday_source,'cache');
  for(const bad of [{...data(2027),papers:[]},data(2027,[{date:'2027-02-30',name:'春节',isOffDay:true}]),data(2027,[{date:'2027-01-01',name:'元旦',isOffDay:'false'}]),data(2027,[{date:'2027-01-01',name:'元旦',isOffDay:true},{date:'2027-01-01',name:'重复',isOffDay:false}])]){
   const another=fixture(),invalid=createHolidaySync({dataDir:another,now:()=>time,fetcher:async()=>Response.json(bad)});try{await invalid.refresh(2027);assert.equal(invalid.month('2027-01').holiday_source,'builtin');}finally{invalid.close();rmSync(another,{recursive:true,force:true});}
  }
 }finally{service.close();rmSync(dir,{recursive:true,force:true});}
});

test('十二月合并下一年公告的跨年安排，未来未公布年份不预测或联网',async()=>{
 const dir=fixture(),calls=[];const service=createHolidaySync({dataDir:dir,now:()=>baseTime,fetcher:async url=>{const year=Number(/(\d{4})\.json$/.exec(url)[1]);calls.push(year);return Response.json(year===2027?data(2027,[{date:'2026-12-31',name:'元旦',isOffDay:true},{date:'2027-01-01',name:'元旦',isOffDay:true}]):data(year));}});
 try{
  service.month('2026-12');await Promise.all([service.refresh(2026),service.refresh(2027)]);const result=service.month('2026-12');assert.deepEqual(result.days.at(-1).holiday,{name:'元旦',work:false});assert.equal(result.holiday_syncing,false);assert.deepEqual(calls.sort(),[2026,2027]);const future=service.month('2099-01');assert.equal(future.holiday_known,false);assert.equal(future.holiday_syncing,false);assert.equal(calls.length,2);
 }finally{service.close();rmSync(dir,{recursive:true,force:true});}
});

test('关闭服务中止未完成同步，迟到结果不写入缓存',async()=>{
 const dir=fixture();let finish,signal;const service=createHolidaySync({dataDir:dir,now:()=>baseTime,fetcher:(_url,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});
 try{const pending=service.refresh(2026);service.close();assert.equal(signal.aborted,true);finish(Response.json(data(2026)));await pending;assert.equal(service.month('2026-01').holiday_source,'builtin');}
 finally{service.close();rmSync(dir,{recursive:true,force:true});}
});

test('日历接口需要登录，首次立即返回已有数据，后续请求取得同步后的休班',async()=>{
 const dir=fixture();let finish,calls=0;const app=createApplication({dataDir:dir,mailer:{ready:false},holidayFetcher:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 try{
  app.db.exec("INSERT INTO ledgers(id,code) VALUES(1,'HOLIDAY1');INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(1,'a','x','x',1,1);");const token='c'.repeat(64);app.db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,1,?)').run(createHash('sha256').update(token).digest('hex'),Date.now()+60000);
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+app.server.address().port+'/api/calendar?month=2026-01';
  assert.equal((await fetch(url)).status,401);assert.equal(calls,0);
  const first=await fetch(url,{headers:{Cookie:'session='+token}});assert.equal(first.status,200);assert.equal((await first.json()).holiday_syncing,true);assert.equal(calls,1);
  const pending=app.holidays.refresh(2026);finish(Response.json(data(2026,[{date:'2026-01-04',name:'元旦',isOffDay:false}])));await pending;
  const next=await (await fetch(url,{headers:{Cookie:'session='+token}})).json();assert.equal(next.holiday_source,'synced');assert.equal(next.holiday_syncing,false);assert.deepEqual(next.days[3].holiday,{name:'元旦',work:true});assert.equal(calls,1);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();rmSync(dir,{recursive:true,force:true});}
});
