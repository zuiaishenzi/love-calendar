import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,renameSync,existsSync,constants} from 'node:fs';
import path from 'node:path';
const [apk,folder,build,version,notes='客户端修复与体验优化',platform='android',destination='server']=process.argv.slice(2);
const versionCode=Number(build),windows=platform==='windows';if(!['android','windows'].includes(platform))throw Error('平台无效');
if(!apk||!folder||!Number.isSafeInteger(versionCode)||versionCode<1||!/^\d+\.\d+\.\d+$/.test(version||'')||notes.length>4000)throw Error('用法: node scripts/publish-app.mjs APK路径 发布目录 内部构建号 显示版本 [说明]');
const data=readFileSync(apk);if(data.length<4||data.length>(windows?200:100)*1024*1024||(windows?data.readUInt16LE(0)!==0x5a4d:data.readUInt32LE(0)!==0x04034b50))throw Error('请选择100MB以内的有效APK');
mkdirSync(folder,{recursive:true});const manifest=path.join(folder,windows?'windows.json':'latest.json');
if(existsSync(manifest)&&JSON.parse(readFileSync(manifest,'utf8')).versionCode>=versionCode)throw Error('内部构建号必须高于当前发布版本');
const sha256=createHash('sha256').update(data).digest('hex'),filename=`OurDays-${version}-${versionCode}-${sha256.slice(0,12)}.${windows?'exe':'apk'}`,target=path.join(folder,filename);
if(existsSync(target)){if(createHash('sha256').update(readFileSync(target)).digest('hex')!==sha256)throw Error('同名文件内容不同，拒绝覆盖');}else if(!(windows&&destination==='private'&&data.length>90*1024*1024))copyFileSync(apk,target,constants.COPYFILE_EXCL);
const parts=[];if(windows&&destination==='private'&&data.length>90*1024*1024){for(let offset=0,index=1;offset<data.length;offset+=90*1024*1024,index++){const bytes=data.subarray(offset,offset+90*1024*1024),name=filename+'.part'+String(index).padStart(3,'0'),piece=path.join(folder,name),hash=createHash('sha256').update(bytes).digest('hex');if(existsSync(piece)){if(createHash('sha256').update(readFileSync(piece)).digest('hex')!==hash)throw Error('分片同名内容不同');}else writeFileSync(piece,bytes,{flag:'wx'});parts.push({filename:name,size:bytes.length,sha256:hash});}}
const temp=manifest+'.'+randomBytes(8).toString('hex')+'.tmp';writeFileSync(temp,JSON.stringify({packageId:windows?'xyz.ourdays.desktop':'xyz.ourdays.mobile',versionCode,versionName:version,filename,sha256,size:data.length,notes,...(parts.length?{parts}:{})},null,2));renameSync(temp,manifest);console.log('已发布构建 '+versionCode+'：'+filename);
