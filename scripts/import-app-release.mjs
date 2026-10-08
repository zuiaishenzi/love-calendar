import os from 'node:os';
import {readFileSync,lstatSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw Error('用法: import-app-release.mjs 私有仓库目录 发布目录');
for(const [manifestName,platform] of [['latest.json','android'],['windows.json','windows']]){
const windows=platform==='windows',manifest=path.join(source,manifestName);
try{lstatSync(manifest);}catch(error){if(error.code==='ENOENT'&&windows)continue;throw error;}if(!lstatSync(manifest).isFile())throw Error('清单必须为普通文件');
const info=JSON.parse(readFileSync(manifest,'utf8'));
if(info.packageId!==(windows?'xyz.ourdays.desktop':'xyz.ourdays.mobile')||! (windows?/^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$/:/^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/).test(info.filename)||!Number.isSafeInteger(info.versionCode)||info.versionCode<1||! /^\d+\.\d+\.\d+$/.test(info.versionName)||! /^[a-f0-9]{64}$/.test(info.sha256)||typeof info.notes!=='string'||info.notes.length>4000)throw Error('私有仓库清单无效');
let file=path.join(source,info.filename),temp=null;
if(windows&&info.parts){if(!Array.isArray(info.parts)||info.parts.length<1||info.parts.length>3)throw Error('分片清单无效');const chunks=[];let total=0;for(const [index,part] of info.parts.entries()){if(part.filename!==info.filename+'.part'+String(index+1).padStart(3,'0')||!Number.isSafeInteger(part.size)||part.size<1||part.size>90*1024*1024)throw Error('分片信息无效');const piece=path.join(source,part.filename),stat=lstatSync(piece);if(!stat.isFile()||stat.size!==part.size)throw Error('分片大小错误');const bytes=readFileSync(piece);if(createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw Error('分片哈希错误');total+=bytes.length;chunks.push(bytes);}if(total!==info.size||total>200*1024*1024)throw Error('安装包大小不符');const bytes=Buffer.concat(chunks);if(createHash('sha256').update(bytes).digest('hex')!==info.sha256)throw Error('安装包哈希不符');temp=mkdtempSync(path.join(os.tmpdir(),'ourdays-windows-'));file=path.join(temp,info.filename);writeFileSync(file,bytes,{flag:'wx'});}
try{
const stat=lstatSync(file);if(!stat.isFile()||stat.size!==info.size||stat.size>(windows?200:100)*1024*1024)throw Error('安装包大小或文件类型不符');
if(createHash('sha256').update(readFileSync(file)).digest('hex')!==info.sha256)throw Error('安装包哈希不符');
let current;try{current=JSON.parse(readFileSync(path.join(target,manifestName),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(current&&current.versionCode>=info.versionCode){if(current.versionCode===info.versionCode&&current.sha256!==info.sha256)throw Error('同构建号对应不同安装包，拒绝发布');console.log('服务器安装包已经是当前或更高构建');continue;}
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./publish-app.mjs',import.meta.url)),file,target,String(info.versionCode),info.versionName,info.notes,platform],{stdio:'inherit'});if(result.status!==0)throw Error('安装包发布失败');
}finally{if(temp)rmSync(temp,{recursive:true,force:true});}
}
