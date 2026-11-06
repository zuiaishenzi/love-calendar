import {fail} from './accounts.mjs';
import {stickerImageUrl} from './sticker-images.mjs';

const monthOf=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(stamp);
export function createStickerSearch(db,{env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
 const providers=[{id:'ruseo',key:env.RUSEO_API_KEY||'',limit:Number(env.RUSEO_MONTHLY_LIMIT||0)},{id:'memecub',key:env.MEMECUB_API_KEY||'',limit:Number(env.MEMECUB_MONTHLY_LIMIT||1000)}].filter(p=>p.id==='ruseo'||p.key);
 for(const provider of providers)if(!Number.isSafeInteger(provider.limit)||provider.limit<0)throw Error('表情搜索月度上限配置无效');
 const cooldown=new Map(),cache=new Map(),inflight=new Map(),userRate=new Map();
 const usage=provider=>db.prepare('SELECT used,exhausted FROM sticker_search_usage WHERE provider=? AND month=?').get(provider.id,monthOf(now()))||{used:0,exhausted:0};
 const exhausted=provider=>{const row=usage(provider);return Boolean(row.exhausted||provider.limit&&row.used>=provider.limit);};
 function status(){
  const month=monthOf(now()),[year,part]=month.split('-').map(Number),resetAt=Date.UTC(year,part,1)-8*3600000,allExhausted=providers.every(exhausted),ready=providers.some(p=>!exhausted(p)&&(cooldown.get(p.id)||0)<=now());
  return {disabled:allExhausted,temporary:!allExhausted&&!ready,resetAt,retryAt:ready||allExhausted?null:Math.min(...providers.filter(p=>!exhausted(p)).map(p=>cooldown.get(p.id)||now()+60000)),memecubConfigured:Boolean(env.MEMECUB_API_KEY),providers:providers.map(p=>({name:p.id,exhausted:exhausted(p)}))};
 }
 function reserve(provider,month){return db.transaction(()=>{db.prepare('INSERT OR IGNORE INTO sticker_search_usage(provider,month) VALUES(?,?)').run(provider.id,month);const row=db.prepare('SELECT * FROM sticker_search_usage WHERE provider=? AND month=?').get(provider.id,month);if(row.exhausted||provider.limit&&row.used>=provider.limit)return false;db.prepare('UPDATE sticker_search_usage SET used=used+1 WHERE provider=? AND month=?').run(provider.id,month);return true;})();}
 async function request(provider,q,page){
  const url=new URL(provider.id==='ruseo'?'https://api.ruseo.cn/api/bqb':'https://memecub.com/api/v1/search');
  url.search=provider.id==='ruseo'?new URLSearchParams({type:'2',words:q,page:String(page),limit:'12',...(provider.key?{key:provider.key}:{})}):new URLSearchParams({q,offset:String((page-1)*12),limit:'12',no_credit:'true',private:'false'});
  const month=monthOf(now());if(!reserve(provider,month))return null;let charged=false;
  try{
   const response=await fetcher(url.href,{headers:provider.id==='memecub'?{Authorization:'Bearer '+provider.key}:{},signal:AbortSignal.timeout(10000)});
   const data=await response.json().catch(()=>({})),body=provider.id==='ruseo'?(data.data||data):data,errorText=JSON.stringify(data).slice(0,5000);
   const valid=response.ok&&(provider.id==='ruseo'?body.code===200&&Array.isArray(body.res):Array.isArray(body.data));
   if(!valid){const monthly=response.status===402||/insufficient[_ -]?credits|credits[_ -]?(?:exhausted|depleted)|monthly[_ -]?(?:quota|limit)|月(?:度)?额度|本月.*(?:用完|不足|上限)|额度(?:不足|用尽|耗尽)|余额不足/i.test(errorText);
   if(monthly){db.prepare('UPDATE sticker_search_usage SET exhausted=1 WHERE provider=? AND month=?').run(provider.id,month);return null;}
   if(response.status===429||/rate[_ -]?limit|too many requests|请求过于频繁|频率.*限制/i.test(errorText)){const retry=Number(response.headers.get('retry-after'));cooldown.set(provider.id,now()+Math.min(300000,Math.max(1000,Number.isFinite(retry)&&retry>0?retry*1000:60000)));return null;}
   cooldown.set(provider.id,now()+60000);return null;}
   charged=true;
   const raw=provider.id==='ruseo'?body.res.map(url=>({url,title:q})):body.data;
   const items=raw.filter(item=>!item.license?.attribution_required).map(item=>({url:stickerImageUrl(item.url),preview:stickerImageUrl(item.thumb_url||item.url),title:String(item.title_zh||item.title||q).slice(0,60),provider:provider.id})).filter(item=>item.url&&item.preview).slice(0,12);
   return {items,provider:provider.id,page,more:provider.id==='ruseo'?Number(body.maxpage)>page:Number(body.total)>page*12};
  }catch{cooldown.set(provider.id,now()+30000);return null;}finally{if(!charged)db.prepare('UPDATE sticker_search_usage SET used=MAX(0,used-1) WHERE provider=? AND month=?').run(provider.id,month);}
 }
 async function search(user,q,page=1,preferred=''){
  if(!['','ruseo','memecub'].includes(preferred)||typeof q!=='string'||!q.trim()||[...q.trim()].length>10||!Number.isSafeInteger(page)||page<1||page>1000)throw fail(400,'请输入10字以内的搜索词');q=q.trim();
  const state=status();if(state.disabled)return {items:[],more:false,...state};
  const stamp=now(),rate=userRate.get(user.id);if(rate&&stamp-rate.start<60000){if(rate.count>=30)throw fail(429,'搜索太快了，请稍候再试');rate.count++;}else userRate.set(user.id,{start:stamp,count:1});
  const key=monthOf(stamp)+':'+preferred+':'+q+':'+page,hit=cache.get(key);if(hit&&hit.until>stamp)return {...hit.result,...status()};
  if(inflight.has(key))return inflight.get(key);
  const task=(async()=>{
   const ordered=[...providers].sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred));
   for(const provider of ordered){if(exhausted(provider)||(cooldown.get(provider.id)||0)>now())continue;const result=await request(provider,q,preferred&&provider.id!==preferred?1:page);if(result){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{until:now()+300000,result});return {...result,...status()};}}
   const state=status();return {items:[],more:false,...state,unavailable:!state.disabled};
  })();inflight.set(key,task);try{return await task;}finally{inflight.delete(key);}
 }
 return {search,status};
}
