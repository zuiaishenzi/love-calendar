import {readFileSync,statSync,createReadStream} from 'node:fs';
import path from 'node:path';
import {fail} from './accounts.mjs';
import {releaseDefinition,validateRelease} from './scripts/app-release-manifest.mjs';
export function appUpdates(directory){
 function latest(platform='android'){
  const definition=releaseDefinition(platform);
  let info;try{info=JSON.parse(readFileSync(path.join(directory,definition.manifest),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw fail(503,'更新信息暂不可用');}
  try{validateRelease(info,platform);}catch{throw fail(503,'更新信息无效');}
  try{const file=statSync(path.join(directory,info.filename));if(!file.isFile()||file.size!==info.size)throw Error();}catch{throw fail(503,'安装包暂不可用');}
  return {...info,downloadUrl:'/api/app/download/'+info.filename};
 }
 return function route(req,res,url){
  if(!['GET','HEAD'].includes(req.method))throw fail(405,'请求方法不支持');
  const platform=url.searchParams.get('platform');if(platform&& !['android','windows','harmony'].includes(platform))throw fail(400,'平台无效');
  const selected=url.pathname==='/api/app/update'?(platform||'android'):url.pathname.endsWith('.exe')?'windows':url.pathname.endsWith('.hap')?'harmony':'android',info=latest(selected);
  if(url.pathname==='/api/app/update'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify(info?{available:true,...info}:{available:false}));return;}
  if(!info||url.pathname!=='/api/app/download/'+info.filename)throw fail(404,'安装包不存在');
  res.writeHead(200,{'Content-Type':selected==='android'?'application/vnd.android.package-archive':'application/octet-stream','Content-Length':info.size,'Content-Disposition':`attachment; filename="${info.filename}"`,'Cache-Control':'no-store'});
  if(req.method==='HEAD')return res.end();const stream=createReadStream(path.join(directory,info.filename));stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 };
}
