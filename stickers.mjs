import {createHash,randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {fail} from './accounts.mjs';
import {sendMedia} from './media.mjs';
import {prepareChatImage,downloadSticker,STICKER_MAX_BYTES} from './sticker-images.mjs';
import {createStickerSearch} from './sticker-search.mjs';

export function stickerService(db,{env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
 const search=createStickerSearch(db,{env,fetcher,now}),mediaCache=new Map();let cacheBytes=0,downloads=0;const waiting=[];
 async function download(url){if(downloads>=3)await new Promise(resolve=>waiting.push(resolve));else downloads++;try{return await downloadSticker(url,fetcher);}finally{const next=waiting.shift();if(next)next();else downloads--;}} 
 const list=user=>db.prepare('SELECT id,title,tags,mime,source,created FROM stickers WHERE user_id=? ORDER BY created DESC,id DESC').all(user.id);
 async function remote(user,id,preview=false){
  if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw fail(400,'表情编号无效');
  const row=db.prepare('SELECT * FROM sticker_search_results WHERE id=? AND user_id=? AND expires>?').get(id,user.id,now());if(!row)throw fail(404,'搜索结果已过期，请重新搜索');
  const url=preview?row.preview:row.url,hit=mediaCache.get(url);let bytes;
  if(hit&&hit.until>now())bytes=hit.bytes;
  else{bytes=await download(url);if(bytes.length<=10*1024*1024){if(hit){cacheBytes-=hit.bytes.length;mediaCache.delete(url);}while(cacheBytes+bytes.length>40*1024*1024&&mediaCache.size){const key=mediaCache.keys().next().value;cacheBytes-=mediaCache.get(key).bytes.length;mediaCache.delete(key);}mediaCache.set(url,{bytes,until:now()+300000});cacheBytes+=bytes.length;}}
  if(preview){await prepareChatImage(bytes,true);return {data:await sharp(bytes,{limitInputPixels:120000000}).resize({width:240,height:240,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer(),mime:'image/webp'};}
  return {...await prepareChatImage(bytes,true),title:row.title,source:row.provider};
 }
 async function resolve(user,input){
  if(input.search_id)return remote(user,input.search_id);
  if(typeof input.sticker_id!=='string'||!/^[a-f0-9]{32}$/.test(input.sticker_id))throw fail(400,'表情编号无效');
  const row=db.prepare('SELECT data,mime,title,source FROM stickers WHERE id=? AND user_id=?').get(input.sticker_id,user.id);if(!row)throw fail(404,'表情不存在');return row;
 }
 async function route(req,res,url,user,input,check){
  const p=url.pathname;
  if(p==='/api/stickers/status'&&req.method==='GET')return search.status();
  if(p==='/api/stickers/search'&&req.method==='GET'){
   const result=await search.search(user,url.searchParams.get('q'),Number(url.searchParams.get('page')||1),url.searchParams.get('provider')||'');
   db.prepare('DELETE FROM sticker_search_results WHERE expires<=?').run(now());
   const items=result.items.map(item=>{const id=randomBytes(16).toString('hex');db.prepare('INSERT INTO sticker_search_results(id,user_id,url,preview,title,provider,expires) VALUES(?,?,?,?,?,?,?)').run(id,user.id,item.url,item.preview,item.title,item.provider,now()+30*60000);return {id,title:item.title,source:item.provider,preview:'/api/stickers/search-media/'+id};});
   return {...result,items};
  }
  const remoteMedia=p.match(/^\/api\/stickers\/search-media\/([a-f0-9]{32})$/);
  if(remoteMedia&&req.method==='GET'){const row=await remote(user,remoteMedia[1],true);res.setHeader('Cache-Control','no-store');sendMedia(req,res,row);return null;}
  if(p==='/api/stickers'&&req.method==='GET')return list(user);
  if(p==='/api/stickers'&&req.method==='POST'){
   check();let image;
   if(input.message_id){if(!Number.isSafeInteger(input.message_id))throw fail(400,'消息编号无效');const row=db.prepare("SELECT data,mime,sticker FROM chat_messages WHERE id=? AND ledger_id=? AND kind='image' AND retracted_at IS NULL").get(input.message_id,user.ledger_id);if(!row)throw fail(404,'图片不存在');image=row.sticker?{data:Buffer.from(row.data),mime:row.mime}:await prepareChatImage(Buffer.from(row.data),true);}
   else if(input.search_id)image=await remote(user,input.search_id);
   else{if(typeof input.data!=='string'||input.data.length>Math.ceil(STICKER_MAX_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data))throw fail(400,'请选择20MB以内的图片');image=await prepareChatImage(Buffer.from(input.data,'base64'),true);}
   const title=input.title??image.title??'收藏的表情',tags=input.tags??'';if(typeof title!=='string'||!title.trim()||title.length>60||typeof tags!=='string'||tags.length>120)throw fail(400,'表情名称限60字、关键词限120字');
   check();const hash=createHash('sha256').update(image.data).digest('hex'),existing=db.prepare('SELECT id FROM stickers WHERE user_id=? AND hash=?').get(user.id,hash);
   if(existing)return {id:existing.id,duplicate:true,items:list(user)};
   if(db.prepare('SELECT COUNT(*) AS count FROM stickers WHERE user_id=?').get(user.id).count>=200)throw fail(400,'最多收藏200个表情，请先移除一些');
   const id=randomBytes(16).toString('hex');db.prepare('INSERT INTO stickers(id,user_id,title,tags,hash,data,mime,source,created) VALUES(?,?,?,?,?,?,?,?,?)').run(id,user.id,title.trim(),tags.trim(),hash,image.data,image.mime,image.source||'upload',now());return {id,items:list(user)};
  }
  const media=p.match(/^\/api\/stickers\/media\/([a-f0-9]{32})$/);
  if(media&&req.method==='GET'){const row=db.prepare('SELECT data,mime FROM stickers WHERE id=? AND user_id=?').get(media[1],user.id);if(!row)throw fail(404,'表情不存在');res.setHeader('Cache-Control','no-store');sendMedia(req,res,row);return null;}
  const remove=p.match(/^\/api\/stickers\/([a-f0-9]{32})$/);
  if(remove&&req.method==='DELETE'){check();if(!db.prepare('DELETE FROM stickers WHERE id=? AND user_id=?').run(remove[1],user.id).changes)throw fail(404,'表情不存在');return list(user);}
  throw fail(404,'接口不存在');
 }
 return {route,resolve};
}
