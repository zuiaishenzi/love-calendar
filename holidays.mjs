import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {monthDetails,validDay,shanghaiClock} from './calendar.mjs';

const sources=['https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/','https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/'];
const refreshMs=30*86400000;
function validate(data,year){
 if(data?.year!==year||!Array.isArray(data.papers)||!data.papers.length||!data.papers.every(value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn'));}catch{return false;}})||!Array.isArray(data.days)||!data.days.length||data.days.length>400)throw Error('Invalid holiday data');
 const seen=new Set();
 for(const row of data.days){if(!validDay(row.date)||!(row.date.startsWith(year+'-')||row.date.startsWith((year-1)+'-12-'))||seen.has(row.date)||typeof row.name!=='string'||!row.name.trim()||row.name.length>60||typeof row.isOffDay!=='boolean')throw Error('Invalid holiday day');seen.add(row.date);}
 return {year,papers:data.papers,days:data.days.map(({date,name,isOffDay})=>({date,name,isOffDay}))};
}
export function createHolidaySync({dataDir,fetcher=fetch,now=Date.now}={}){
 const directory=path.join(dataDir,'holiday-cache'),states=new Map();let closed=false,timer=null;
 const supported=year=>year>=2007&&year<=Number(shanghaiClock(new Date(now())).day.slice(0,4))+1;
 function state(year){
  if(states.has(year))return states.get(year);
  const entry={data:null,synced:0,retryAt:0,pending:null,controller:null};states.set(year,entry);
  try{const text=readFileSync(path.join(directory,year+'.json'),'utf8');if(text.length>200000)throw Error('Oversize cache');const saved=JSON.parse(text);if(!Number.isFinite(saved.synced)||saved.synced<=0||saved.synced>now())throw Error('Invalid cache timestamp');entry.data=validate(saved.data,year);entry.synced=saved.synced;entry.retryAt=saved.synced+refreshMs;}catch{/* Missing or invalid cache falls back to the bundled calendar. */}
  return entry;
 }
 function refresh(year){
  if(closed||!supported(year))return Promise.resolve();const entry=state(year);
  if(entry.pending)return entry.pending;if(entry.retryAt>now())return Promise.resolve();
  entry.pending=(async()=>{
   for(const source of sources){
    const controller=new AbortController();entry.controller=controller;const timeout=setTimeout(()=>controller.abort(),5000);timeout.unref?.();
    try{
     const response=await fetcher(source+year+'.json',{signal:controller.signal});if(!response.ok){await response.body?.cancel();throw Error('Holiday download failed');}
     const text=await response.text();if(text.length>200000)throw Error('Oversize holiday data');const data=validate(JSON.parse(text),year);if(closed)return;
     const synced=now();mkdirSync(directory,{recursive:true});const file=path.join(directory,year+'.json');writeFileSync(file+'.tmp',JSON.stringify({synced,data}),{mode:0o600});renameSync(file+'.tmp',file);
     entry.data=data;entry.synced=synced;entry.retryAt=synced+refreshMs;return;
    }catch{if(closed)return;}finally{clearTimeout(timeout);entry.controller=null;}
   }
   entry.retryAt=now()+3600000;
  })().finally(()=>{entry.pending=null;});
  return entry.pending;
 }
 function month(month){
  const year=Number(month.slice(0,4)),years=month.endsWith('-12')?[year,year+1]:[year];
  for(const y of years)void refresh(y);
  const base=monthDetails(month),own=state(year),entries=years.map(state),overrides=new Map();
  for(const entry of entries)for(const row of entry.data?.days||[])if(row.date.startsWith(month+'-'))overrides.set(row.date,{name:row.name,work:!row.isOffDay});
  const syncing=entries.some(entry=>entry.pending),synced=entries.filter(entry=>entry.data),known=Boolean(own.data)||base.holiday_known;
  const stale=synced.some(entry=>entry.synced+refreshMs<=now()),source=own.data?(stale?'cache':'synced'):'builtin';
  const note=own.data?(stale?'休 / 班使用已缓存安排，以国务院通知为准。':'休 / 班已自动同步，以国务院通知为准。'):syncing?'正在查询放假调休安排，暂用已有数据。':base.holiday_known?'休 / 班使用内置安排，联网后自动更新。':'本年放假调休安排暂未收录，不推测休 / 班。';
  return {...base,days:base.days.map(row=>({...row,holiday:overrides.get(row.day)||(own.data?null:row.holiday)})),holiday_known:known||overrides.size>0,holiday_note:note,holiday_source:source,holiday_syncing:syncing,holiday_synced_at:synced.length?Math.max(...synced.map(entry=>entry.synced)):null,holiday_papers:[...new Set(synced.flatMap(entry=>entry.data.papers))]};
 }
 function start(){if(timer||closed)return;const check=()=>{const year=Number(shanghaiClock(new Date(now())).day.slice(0,4));void refresh(year);void refresh(year+1);};check();timer=setInterval(check,3600000);timer.unref();}
 return {month,refresh,start,close(){closed=true;clearInterval(timer);for(const entry of states.values())entry.controller?.abort();}};
}
