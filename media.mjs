import {randomBytes} from 'node:crypto';
import {fail} from './accounts.mjs';

export function memoryAttachments(input=[]){
 if(!Array.isArray(input)||input.length>6)throw fail(400,'每个视角最多6个视频或语音附件');
 let total=0;
 return input.map(file=>{
  if(!file||typeof file.name!=='string'||!file.name.trim()||file.name.length>150||typeof file.data!=='string'||file.data.length>42*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw fail(400,'附件格式错误');
  const data=Buffer.from(file.data,'base64'),ext=file.name.toLowerCase().split('.').at(-1),signature=data.subarray(0,4).toString('hex'),head=data.toString('ascii',0,4),mp4=data.toString('ascii',4,8)==='ftyp',webm=signature==='1a45dfa3';
  let kind,mime;
  if(['mp4','mov','webm'].includes(ext)&&(ext==='webm'?webm:mp4)){kind='video';mime=ext==='webm'?'video/webm':ext==='mov'?'video/quicktime':'video/mp4';}
  else{const formats={m4a:[mp4,'audio/mp4'],webm:[webm,'audio/webm'],ogg:[head==='OggS','audio/ogg'],wav:[head==='RIFF'&&data.toString('ascii',8,12)==='WAVE','audio/wav'],mp3:[head.startsWith('ID3')||data[0]===255&&(data[1]&0xe0)===0xe0,'audio/mpeg'],flac:[head==='fLaC','audio/flac'],aac:[data[0]===255&&(data[1]&0xf6)===0xf0,'audio/aac']};const format=formats[ext];if(format?.[0]){kind='audio';mime=format[1];}}
  if(ext==='webm'&&typeof file.type==='string'&&file.type.startsWith('audio/')){kind='audio';mime='audio/webm';}
  if(!kind||!data.length)throw fail(400,'支持 MP4、MOV、WebM 视频和 MP3、M4A、WAV、OGG、FLAC、AAC、WebM 语音，请选择有效文件');
  if(data.length>(kind==='video'?30:20)*1024*1024)throw fail(400,'视频不能超过30MB，语音不能超过20MB');total+=data.length;if(total>50*1024*1024)throw fail(400,'本次视频和语音总大小不能超过50MB');
  return {id:randomBytes(18).toString('hex'),name:file.name.trim().replace(/[\r\n\x00/\\]/g,'_'),kind,mime,data};
 });
}
export function sendMedia(req,res,row,downloadName=null){
 const bytes=Buffer.from(row.data);let start=0,end=bytes.length-1,status=200;
 if(req.headers.range){const range=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);if(!range||!range[1]&&!range[2])throw fail(416,'无效的播放范围');if(!range[1])start=Math.max(0,bytes.length-Number(range[2]));else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length){res.setHeader('Content-Range',`bytes */${bytes.length}`);throw fail(416,'播放范围超出附件');}status=206;}
 res.writeHead(status,{'Content-Type':row.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(downloadName?{'Content-Disposition':"attachment; filename=attachment; filename*=UTF-8''"+encodeURIComponent(downloadName).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}:{}),...(status===206?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));
}
