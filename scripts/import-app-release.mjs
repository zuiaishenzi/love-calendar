import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw Error('用法: import-app-release.mjs 私有仓库目录 发布目录');
const manifest=path.join(source,'latest.json');if(!lstatSync(manifest).isFile())throw Error('清单必须为普通文件');
const info=JSON.parse(readFileSync(manifest,'utf8'));
if(info.packageId!=='xyz.ourdays.mobile'||! /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/.test(info.filename)||!Number.isSafeInteger(info.versionCode)||info.versionCode<1||! /^\d+\.\d+\.\d+$/.test(info.versionName)||! /^[a-f0-9]{64}$/.test(info.sha256)||typeof info.notes!=='string'||info.notes.length>4000)throw Error('私有仓库清单无效');
const file=path.join(source,info.filename),stat=lstatSync(file);if(!stat.isFile()||stat.size!==info.size||stat.size>100*1024*1024)throw Error('安装包大小或文件类型不符');
if(createHash('sha256').update(readFileSync(file)).digest('hex')!==info.sha256)throw Error('安装包哈希不符');
let current;try{current=JSON.parse(readFileSync(path.join(target,'latest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(current&&current.versionCode>=info.versionCode){if(current.versionCode===info.versionCode&&current.sha256!==info.sha256)throw Error('同构建号对应不同安装包，拒绝发布');console.log('服务器安装包已经是当前或更高构建');process.exit(0);}
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./publish-app.mjs',import.meta.url)),file,target,String(info.versionCode),info.versionName,info.notes],{stdio:'inherit'});process.exit(result.status??1);
