import {readFileSync,statSync,createReadStream} from 'node:fs';
import path from 'node:path';
import {fail} from './accounts.mjs';
export function appUpdates(directory){
 function latest(){
  let info;try{info=JSON.parse(readFileSync(path.join(directory,'latest.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw fail(503,'更新信息暂不可用');}
  if(info.packageId!=='xyz.ourdays.mobile'||!Number.isSafeInteger(info.versionCode)||info.versionCode<1||typeof info.versionName!=='string'||info.versionName.length>40||! /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/.test(info.filename)||! /^[a-f0-9]{64}$/.test(info.sha256)||!Number.isSafeInteger(info.size)||info.size<1||info.size>100*1024*1024||typeof info.notes!=='string'||info.notes.length>4000)throw fail(503,'更新信息无效');
  try{const file=statSync(path.join(directory,info.filename));if(!file.isFile()||file.size!==info.size)throw Error();}catch{throw fail(503,'安装包暂不可用');}
  return {...info,downloadUrl:'/api/app/download/'+info.filename};
 }
 return function route(req,res,url){
  if(!['GET','HEAD'].includes(req.method))throw fail(405,'请求方法不支持');
  const info=latest();
  if(url.pathname==='/api/app/update'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify(info?{available:true,...info}:{available:false}));return;}
  if(!info||url.pathname!=='/api/app/download/'+info.filename)throw fail(404,'安装包不存在');
  res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Length':info.size,'Content-Disposition':`attachment; filename="${info.filename}"`,'Cache-Control':'no-store'});
  if(req.method==='HEAD')return res.end();const stream=createReadStream(path.join(directory,info.filename));stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 };
}
