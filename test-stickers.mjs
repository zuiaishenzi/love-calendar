import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {scryptSync} from 'node:crypto';
import sharp from 'sharp';
import {openDatabase} from './db.mjs';
import {createApplication} from './server.mjs';
import {createStickerSearch} from './sticker-search.mjs';
import {downloadSticker,prepareChatImage} from './sticker-images.mjs';

const gif=Buffer.from('47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b','hex');
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
const result=provider=>provider==='ruseo'?json({code:0,data:{code:200,res:['https://res.apihz.cn/img/bqb/test.gif'],maxpage:2}}):json({data:[{title_zh:'抱抱',url:'https://gpic.code-nav.cn/memecub/public/test.gif'}],total:20});
function seed(db){db.exec("INSERT INTO ledgers(id,code) VALUES(1,'STICKER1'),(2,'STICKER2');");for(const [id,name,ledger,seat] of [[1,'alice',1,1],[2,'bob',1,2],[3,'other',2,1]])db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?,?)').run(id,name,scryptSync('password-123','salt',64).toString('hex'),'salt',ledger,seat);}

test('月额度耗尽自动切源并持久化，两源耗尽停搜，北京时间自然月重置',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-sticker-quota-')),db=openDatabase(dir);let stamp=Date.parse('2026-11-30T15:59:50Z'),phase=0;const calls=[],env={MEMECUB_API_KEY:'private-test-key'},options={env,now:()=>stamp,fetcher:async(url,request)=>{const provider=url.includes('ruseo')?'ruseo':'memecub';calls.push(provider);if(provider==='memecub')assert.equal(request.headers.Authorization,'Bearer private-test-key');return phase===2?result(provider):provider==='ruseo'?json({code:0,data:{code:400,msg:'本月额度用完'}}):phase===1?json({error:{code:'insufficient_credits',message:'private-test-key'}},402):result(provider);}};
 try{let service=createStickerSearch(db,options),data=await service.search({id:1},'抱抱');assert.equal(data.provider,'memecub');assert.deepEqual(calls,['ruseo','memecub']);assert.equal(data.disabled,false);
  phase=1;service=createStickerSearch(db,options);data=await service.search({id:1},'开心');assert.equal(data.disabled,true);assert.equal(JSON.stringify(data).includes('private-test-key'),false);const count=calls.length;await service.search({id:2},'猫猫');assert.equal(calls.length,count);assert.equal(service.status().resetAt,Date.parse('2026-11-30T16:00:00Z'));
  stamp=Date.parse('2026-11-30T16:00:01Z');phase=2;assert.equal(service.status().disabled,false);data=await service.search({id:1},'猫猫');assert.equal(data.provider,'ruseo');assert.equal(data.disabled,false);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('429短期限流只临时切源，成功内容不会被误判额度，缓存不重复扣费',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-sticker-rate-')),db=openDatabase(dir);let stamp=100000,ruseo=0,total=0;
 try{const service=createStickerSearch(db,{env:{MEMECUB_API_KEY:'test-key'},now:()=>stamp,fetcher:async url=>{total++;if(url.includes('ruseo')&&ruseo++===0)return new Response('too many requests',{status:429,headers:{'retry-after':'2'}});return url.includes('ruseo')?result('ruseo'):json({data:[{title:'余额不足',url:'https://gpic.code-nav.cn/memecub/public/test.png'}],total:1});}});
  let data=await service.search({id:1},'抱抱');assert.equal(data.provider,'memecub');assert.ok(service.status().providers.every(p=>!p.exhausted));const before=total;await service.search({id:2},'抱抱');assert.equal(total,before);stamp+=2100;data=await service.search({id:1},'开心');assert.equal(data.provider,'ruseo');assert.equal(service.status().disabled,false);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('并发查询不能超出本地月预算，失败请求退还预算',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-sticker-budget-')),db=openDatabase(dir);let calls=0;
 try{const service=createStickerSearch(db,{env:{RUSEO_MONTHLY_LIMIT:'1',MEMECUB_API_KEY:'test',MEMECUB_MONTHLY_LIMIT:'1'},fetcher:async url=>{calls++;await new Promise(r=>setTimeout(r,5));return result(url.includes('ruseo')?'ruseo':'memecub');}});await Promise.all(['抱抱','开心','猫猫'].map(q=>service.search({id:1},q)));assert.equal(calls,2);assert.equal(service.status().disabled,true);assert.equal(db.prepare('SELECT SUM(used) AS used FROM sticker_search_usage').get().used,2);
  db.exec('DELETE FROM sticker_search_usage');const broken=createStickerSearch(db,{env:{},fetcher:async()=>{throw Error('network secret');}});const data=await broken.search({id:1},'抱抱');assert.equal(data.disabled,false);assert.equal(data.temporary,true);assert.equal(db.prepare('SELECT used FROM sticker_search_usage').get().used,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('图片下载拒绝任意域名、跨域重定向、超大图片与SVG，GIF保留帧',async()=>{
 for(const url of ['http://127.0.0.1/x','https://127.0.0.1/x','https://res.apihz.cn.evil.test/a','https://res.apihz.cn@127.0.0.1/a'])await assert.rejects(downloadSticker(url,()=>{throw Error('must not fetch');}),e=>e.status===400);
 let calls=0;await assert.rejects(downloadSticker('https://res.apihz.cn/test',async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/internal'}});}),e=>e.status===400);assert.equal(calls,1);
 await assert.rejects(downloadSticker('https://res.apihz.cn/test',async()=>new Response('x',{headers:{'content-length':String(21*1024*1024)}})),e=>e.status===400);
 await assert.rejects(prepareChatImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')),e=>e.status===400);const image=await prepareChatImage(gif,true);assert.equal(image.mime,'image/gif');assert.equal((await sharp(image.data,{animated:true}).metadata()).pages,2);
});

test('上传、搜索、收藏和发送账号隔离，删收藏不删消息，动图可存入回忆并随注销清理',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-sticker-http-')),app=createApplication({dataDir:dir,mailer:{ready:false},stickerOptions:{env:{},fetcher:async url=>url.includes('/api/bqb')?result('ruseo'):new Response(gif,{headers:{'content-type':'image/gif'}})}});seed(app.db);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 async function call(route,method='GET',data,cookie=''){const response=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const bytes=Buffer.from(await response.arrayBuffer());return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?JSON.parse(bytes):bytes,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 try{assert.equal((await call('/api/stickers')).status,401);const a=(await call('/api/login','POST',{name:'alice',password:'password-123'})).cookie,b=(await call('/api/login','POST',{name:'bob',password:'password-123'})).cookie,c=(await call('/api/login','POST',{name:'other',password:'password-123'})).cookie;
  const added=(await call('/api/stickers','POST',{title:'抱抱',tags:'开心 猫猫',data:gif.toString('base64')},a)).data,id=added.id;assert.equal(added.items[0].mime,'image/gif');assert.equal('data' in added.items[0],false);assert.equal((await call('/api/stickers','POST',{title:'抱抱',data:gif.toString('base64')},a)).data.duplicate,true);assert.equal((await call('/api/stickers/media/'+id,'GET',undefined,b)).status,404);
  assert.equal((await call('/api/chat/messages','POST',{kind:'image',sticker:true,sticker_id:id},b)).status,404);const sent=(await call('/api/chat/messages','POST',{kind:'image',sticker:true,sticker_id:id},a)).data.id;assert.equal(app.db.prepare('SELECT sticker FROM chat_messages WHERE id=?').get(sent).sticker,1);
  assert.equal((await call('/api/stickers','POST',{message_id:sent,title:'对方的表情'},b)).status,200);assert.equal((await call('/api/stickers','POST',{message_id:sent,title:'越权'},c)).status,404);await call('/api/stickers/'+id,'DELETE',{},a);assert.deepEqual((await call('/api/chat/media/'+sent,'GET',undefined,b)).data,gif);
  const search=(await call('/api/stickers/search?q='+encodeURIComponent('抱抱'),'GET',undefined,a)).data,ticket=search.items[0].id;assert.equal(search.items[0].preview,'/api/stickers/search-media/'+ticket);assert.equal((await call('/api/stickers/search-media/'+ticket,'GET',undefined,b)).status,404);assert.equal((await call('/api/stickers/search-media/'+ticket,'GET',undefined,a)).status,200);
  assert.equal((await call('/api/chat/messages','POST',{kind:'image',sticker:true,search_id:ticket},a)).status,200);assert.equal((await call('/api/chat/messages','POST',{kind:'image',sticker:true,search_id:'https://127.0.0.1'},a)).status,400);
  const memory=(await call('/api/chat/memory','POST',{ids:[sent]},a)).data.id;assert.equal(app.db.prepare('SELECT sticker FROM memory_chat_messages WHERE memory_id=?').get(memory).sticker,1);assert.ok((await call('/api/memoir/export','GET',undefined,a)).data.toString().includes('data:image/gif;base64,'));
  app.db.prepare("UPDATE ledgers SET delete_at=?,delete_kind='ledger' WHERE id=1").run(Date.now()+60000);assert.equal((await call('/api/stickers','POST',{message_id:sent},b)).status,423);app.db.exec('UPDATE ledgers SET delete_at=1 WHERE id=1');app.lifecycle.purge();assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM stickers').get().count,0);assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM sticker_search_results').get().count,0);assert.equal(app.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();rmSync(dir,{recursive:true,force:true});}
});
