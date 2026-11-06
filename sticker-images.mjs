import sharp from 'sharp';
import {fail} from './accounts.mjs';

export const STICKER_MAX_BYTES=20*1024*1024;
export async function prepareChatImage(bytes,sticker=false){
 if(!bytes?.length||bytes.length>STICKER_MAX_BYTES)throw fail(400,'图片不能超过20MB');
 try{
  const image=sharp(bytes,{animated:true,limitInputPixels:40000000}),meta=await image.metadata();
  if(!['jpeg','png','webp','gif'].includes(meta.format)||meta.width*(meta.pageHeight||meta.height)>20000000||(meta.pages||1)>300||meta.width*(meta.pageHeight||meta.height)*(meta.pages||1)>40000000)throw Error();
  // Preserve the animation instead of silently keeping only its first frame.
  if((meta.pages||1)>1&&['gif','webp'].includes(meta.format))return {data:Buffer.from(bytes),mime:'image/'+meta.format};
  return {data:await image.rotate().resize({width:sticker?640:1600,height:sticker?640:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer(),mime:'image/webp'};
 }catch(error){if(error.status)throw error;throw fail(400,'请选择有效的 PNG、GIF、WebP 或 JPG 图片（最多300帧）');}
}

const hosts=new Set(['res.apihz.cn','gpic.code-nav.cn']);
export function stickerImageUrl(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&hosts.has(url.hostname)?url.href:null;}catch{return null;}
}
export async function downloadSticker(url,fetcher=fetch){
 for(let redirects=0;redirects<4;redirects++){
  if(!stickerImageUrl(url))throw fail(400,'表情图片来源不受支持');
  const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;url=new URL(location,url).href;continue;}
  if(!response.ok){await response.body?.cancel();throw fail(502,'表情图片暂时无法下载');}
  if(Number(response.headers.get('content-length'))>STICKER_MAX_BYTES){await response.body?.cancel();throw fail(400,'表情图片超过20MB');}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>STICKER_MAX_BYTES)throw fail(400,'表情图片超过20MB');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
 }
 throw fail(502,'表情图片跳转次数过多');
}
