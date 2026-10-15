import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {syncAppReleases,downloadReleaseFile,fileHash} from './scripts/sync-app-release.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const root=mkdtempSync(path.join(os.tmpdir(),'ourdays-sync-')),cache=path.join(root,'cache'),target=path.join(root,'published');mkdirSync(cache);mkdirSync(target);
 const apk=Buffer.alloc(80,7);apk.writeUInt32LE(0x04034b50,0);const exe=Buffer.alloc(100,9);exe.write('MZ');
 const manifest=(data,code,windows=false)=>({packageId:windows?'xyz.ourdays.desktop':'xyz.ourdays.mobile',versionCode:code,versionName:'1.8.0',filename:`OurDays-1.8.0-${code}-${sha(data).slice(0,12)}.${windows?'exe':'apk'}`,sha256:sha(data),size:data.length,notes:'测试说明'});
 const android=manifest(apk,10808),windows=manifest(exe,10804,true);windows.parts=[exe.subarray(0,60),exe.subarray(60)].map((bytes,index)=>({filename:windows.filename+'.part'+String(index+1).padStart(3,'0'),size:bytes.length,sha256:sha(bytes)}));
 const manifests=new Map([['latest.json',android],['windows.json',windows]]),files=new Map([[android.filename,apk],[windows.parts[0].filename,exe.subarray(0,60)],[windows.parts[1].filename,exe.subarray(60)]]),calls=[],logs=[],revision='a'.repeat(40);let failOnce=null,failed=false,badFile=null;
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push({host:u.hostname,path:u.pathname,range:options.headers.Range,authorization:options.headers.Authorization});
  if(u.pathname==='/repos/owner/private')return Response.json({private:true});
  if(u.pathname.includes('/git/ref/heads/'))return Response.json({object:{sha:revision,type:'commit'}});
  if(u.hostname==='api.github.com'){
   assert.equal(u.searchParams.get('ref'),revision);const name=decodeURIComponent(u.pathname.split('/contents/')[1]);
   if(manifests.has(name))return Response.json(manifests.get(name));
   if(name==='latest.json'||name==='windows.json'||name==='harmony.json')return new Response(null,{status:404});
   if(options.headers.Accept==='application/vnd.github.object+json')return Response.json({type:'file',path:name,size:files.get(name)?.length,download_url:'https://raw.githubusercontent.com/owner/private/'+revision+'/'+name});
  }
  const name=u.pathname.split('/').at(-1),bytes=files.get(name);assert.ok(bytes,'Unexpected installer request: '+name);const offset=Number(/bytes=(\d+)-/.exec(options.headers.Range||'')?.[1]||0);
  if(name===failOnce&&!failed){failed=true;let step=0;return new Response(new ReadableStream({pull(controller){if(step++===0)controller.enqueue(bytes.subarray(0,17));else controller.error(Error('connection lost'));}},{highWaterMark:0}),{status:200});}
  const data=name===badFile?Buffer.alloc(bytes.length,0):bytes.subarray(offset);return new Response(data,{status:offset?206:200,headers:offset?{'Content-Range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`}:{}});
 };
 const options={repo:'https://github.com/owner/private.git',branch:'main',cache,target,token:'TEST_TOKEN_DO_NOT_LOG',fetchImpl,log:text=>logs.push(text)};
 return {root,cache,target,apk,exe,android,windows,files,manifests,calls,logs,options,setFailure:name=>failOnce=name,setBad:name=>badFile=name,clean:()=>rmSync(root,{recursive:true,force:true})};
}
test('先检查双端清单，只拉当前文件，版本未变时不下载安装包',async()=>{
 const f=fixture();try{
  await syncAppReleases(f.options);assert.equal(await fileHash(path.join(f.target,f.windows.filename)),f.windows.sha256);assert.equal(await fileHash(path.join(f.target,f.android.filename)),f.android.sha256);
  assert.equal(f.calls.filter(c=>c.host==='raw.githubusercontent.com').length,3);assert.ok(f.calls.filter(c=>c.host==='raw.githubusercontent.com').every(c=>!c.authorization));
  f.calls.length=0;await syncAppReleases(f.options);assert.equal(f.calls.length,5);assert.ok(f.calls.every(c=>!c.path.includes('.apk')&&!c.path.includes('.exe')));assert.ok(f.logs.every(log=>!log.includes(f.options.token)));
 }finally{f.clean();}
});
test('传输中断后在同次重试中从已接收字节续传',async()=>{
 const f=fixture();try{f.setFailure(f.android.filename);await syncAppReleases(f.options);assert.ok(f.calls.some(c=>c.host==='raw.githubusercontent.com'&&c.range==='bytes=17-'));assert.equal(await fileHash(path.join(f.target,f.android.filename)),f.android.sha256);}finally{f.clean();}
});
test('跨次更新保留断点，Windows旧包在下载或哈希失败时不被替换',async()=>{
 const f=fixture();try{
  f.manifests.delete('windows.json');f.setFailure(f.android.filename);await assert.rejects(syncAppReleases({...f.options,attempts:1}),/部分安装包/);
  assert.equal(readFileSync(path.join(f.cache,f.android.sha256+'.partial')).length,17);assert.equal(existsSync(path.join(f.target,'latest.json')),false);
  await syncAppReleases(f.options);assert.ok(f.calls.some(c=>c.range==='bytes=17-'));const old=readFileSync(path.join(f.target,'latest.json'),'utf8');
  const oldExe=Buffer.from('MZprevious Windows installer'),oldWindows={...f.windows,parts:undefined,versionCode:10803,filename:'OurDays-1.8.0-10803-old.exe',size:oldExe.length,sha256:sha(oldExe)};
  writeFileSync(path.join(f.target,oldWindows.filename),oldExe);writeFileSync(path.join(f.target,'windows.json'),JSON.stringify(oldWindows));
  f.manifests.set('windows.json',f.windows);f.setBad(f.windows.parts[1].filename);await assert.rejects(syncAppReleases({...f.options,attempts:2}),/部分安装包/);assert.equal(readFileSync(path.join(f.target,'latest.json'),'utf8'),old);assert.equal(JSON.parse(readFileSync(path.join(f.target,'windows.json'))).versionCode,10803);assert.equal(await fileHash(path.join(f.target,oldWindows.filename)),oldWindows.sha256);
  f.setBad(null);f.calls.length=0;await syncAppReleases(f.options);assert.ok(!f.calls.some(c=>c.path.endsWith(f.windows.parts[0].filename)));assert.ok(existsSync(path.join(f.target,oldWindows.filename)));assert.equal(await fileHash(path.join(f.target,f.windows.filename)),f.windows.sha256);
 }finally{f.clean();}
});
test('下载端忽略Range时重新写入，不把完整文件接到断点后',async()=>{
 const f=fixture();try{
  writeFileSync(path.join(f.cache,f.android.sha256+'.partial'),f.apk.subarray(0,10));let range;
  const file=await downloadReleaseFile({request:async(_url,options)=>{range=options.range;return new Response(f.apk,{status:200});}},'https://raw.githubusercontent.com/test',f.android,f.cache);
  assert.equal(range,'bytes=10-');assert.equal(await fileHash(file),f.android.sha256);assert.equal(readFileSync(file).length,f.apk.length);
 }finally{f.clean();}
});
test('同版本不同哈希和越界文件名在下载前拒绝',async()=>{
 const f=fixture();try{
  await syncAppReleases(f.options);f.calls.length=0;f.manifests.set('latest.json',{...f.android,sha256:'b'.repeat(64)});await assert.rejects(syncAppReleases(f.options));assert.equal(f.calls.filter(c=>c.host==='raw.githubusercontent.com').length,0);
  f.manifests.set('latest.json',{...f.android,filename:'../evil.apk',versionCode:10809});await assert.rejects(syncAppReleases(f.options));assert.equal(f.calls.filter(c=>c.host==='raw.githubusercontent.com').length,0);
 }finally{f.clean();}
});
test('下载跳转不向其他域名泄漏凭据',async()=>{
 const f=fixture();try{
  const base=f.options.fetchImpl;let maliciousRequested=false;
  const fetchImpl=async(url,options)=>{if(new URL(url).hostname==='evil.example'){maliciousRequested=true;throw Error('secret leaked');}if(new URL(url).hostname==='raw.githubusercontent.com')return new Response(null,{status:302,headers:{Location:'https://evil.example/download'}});return base(url,options);};
  await syncAppReleases({...f.options,fetchImpl,attempts:2});assert.equal(maliciousRequested,false);
 }finally{f.clean();}
});

test('鸿蒙清单可与双端包一起同步，重复运行不下载未变化的HAP',async()=>{
 const f=fixture();try{
  const bytes=Buffer.from([0x50,0x4b,0x03,0x04,8,7,6,5]),harmony={packageId:'xyz.ourdays.harmony',versionCode:10801,versionName:'1.8.0',filename:`OurDays-1.8.0-10801-${sha(bytes).slice(0,12)}.hap`,sha256:sha(bytes),size:bytes.length,notes:'鸿蒙测试'};
  f.manifests.set('harmony.json',harmony);f.files.set(harmony.filename,bytes);
  await syncAppReleases(f.options);assert.equal(await fileHash(path.join(f.target,harmony.filename)),harmony.sha256);assert.equal(await fileHash(path.join(f.target,f.android.filename)),f.android.sha256);
  f.calls.length=0;await syncAppReleases(f.options);assert.equal(f.calls.length,5);assert.ok(!f.calls.some(call=>call.host==='raw.githubusercontent.com'));
 }finally{f.clean();}
});
