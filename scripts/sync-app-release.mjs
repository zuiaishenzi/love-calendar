import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,existsSync,statSync,copyFileSync,writeFileSync,mkdtempSync,rmSync,lstatSync} from 'node:fs';
import {mkdir,open,unlink,rename} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releasePlatforms,validateRelease} from './app-release-manifest.mjs';

export async function fileHash(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
const safeFile=file=>{try{const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('缓存文件类型无效');return stat.size;}catch(error){if(error.code==='ENOENT')return 0;throw error;}};
export function repositoryName(repo){const match=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\.git$/.exec(repo)||/^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\.git$/.exec(repo);if(!match)throw Error('私库地址无效');return match[1];}
function githubClient({token,fetchImpl=fetch}){
 if(!token||/[\r\n]/.test(token))throw Error('缺少有效的私库访问 token');
 const permitted=url=>url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&(url.hostname==='api.github.com'||url.hostname.endsWith('.githubusercontent.com'));
 async function request(url,{accept='application/vnd.github+json',range,controller}={}){
  for(let redirect=0;redirect<5;redirect++){
   const address=new URL(url);if(!permitted(address))throw Error('下载跳转地址不受信任');
   const headers={Accept:accept,'Accept-Encoding':'identity','User-Agent':'OurDays-app-sync','X-GitHub-Api-Version':'2022-11-28'};
   if(address.hostname==='api.github.com')headers.Authorization='Bearer '+token;
   if(range)headers.Range=range;
   const response=await fetchImpl(address.toString(),{headers,redirect:'manual',signal:controller?.signal??AbortSignal.timeout(30000)});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('下载跳转无效');url=new URL(location,address).toString();continue;}
   return response;
  }
  throw Error('下载跳转次数过多');
 }
 async function json(url,raw=false,optional=false){
  const response=await request(url,{accept:raw==='object'?'application/vnd.github.object+json':raw?'application/vnd.github.raw+json':'application/vnd.github+json'});
  if(optional&&response.status===404){await response.body?.cancel();return null;}
  if(response.status!==200){await response.body?.cancel();throw Error('GitHub 请求失败，HTTP '+response.status);}
  let text='';const decoder=new TextDecoder();for await(const chunk of response.body){text+=decoder.decode(chunk,{stream:true});if(text.length>1024*1024)throw Error('清单响应过大');}text+=decoder.decode();
  try{return JSON.parse(text);}catch{throw Error('GitHub 返回的清单无法解析');}
 }
 return {request,json};
}
export async function downloadReleaseFile(client,url,file,cache,{attempts=3,log=()=>{},fallbackUrl}={}){
 const complete=path.join(cache,file.sha256+'.complete'),partial=path.join(cache,file.sha256+'.partial');
 if(existsSync(complete)){if(safeFile(complete)===file.size&&await fileHash(complete)===file.sha256)return complete;await unlink(complete);log(file.filename+': 缓存校验失败，重新下载');}
 let failure;
 for(let attempt=1;attempt<=attempts;attempt++){
  let timer,handle;const controller=new AbortController(),arm=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),60000);timer.unref?.();};
  try{
   let offset=safeFile(partial);
   if(offset>=file.size){if(offset===file.size&&await fileHash(partial)===file.sha256){await rename(partial,complete);return complete;}await unlink(partial);offset=0;}
   log(`${file.filename}: ${offset?'继续下载 '+offset+' / '+file.size+' 字节':'开始下载'}`);
   arm();const address=attempt===attempts&&fallbackUrl&&offset===0?fallbackUrl:typeof url==='function'?await url():url;const response=await client.request(address,{accept:'application/vnd.github.raw+json',range:offset?'bytes='+offset+'-':undefined,controller});arm();
   if(![200,206].includes(response.status)){await response.body?.cancel();throw Error('下载失败，HTTP '+response.status);}
   if(response.status===206){const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');if(!range||Number(range[1])!==offset||Number(range[3])!==file.size||Number(range[2])<offset||Number(range[2])>=file.size){await response.body?.cancel();throw Error('续传范围不正确');}}
   else {if(offset)log(file.filename+': 下载端不支持 Range，本次安全重新下载');offset=0;} // Never append a full response to a partial file.
   handle=await open(partial,offset?'a':'w',0o600);
   let received=offset;
   for await(const chunk of response.body){arm();if(received+chunk.length>file.size)throw Error('下载数据超过清单大小');await handle.writeFile(chunk);received+=chunk.length;}
   await handle.close();handle=null;
   if(received!==file.size)throw Error('下载尚未完成');
   if(await fileHash(partial)!==file.sha256){await unlink(partial);throw Error('SHA256 校验失败');}
   await rename(partial,complete);log(file.filename+': SHA256 校验通过');return complete;
  }catch(error){failure=error;log(file.filename+': 本次下载未完成，保留可续传数据（'+attempt+'/'+attempts+'）');}
  finally{clearTimeout(timer);if(handle)await handle.close();}
 }
 throw failure;
}
export async function syncAppReleases({repo,branch='main',cache,target,token,fetchImpl=fetch,log=console.log,attempts=3}){
 const name=repositoryName(repo);if(typeof branch!=='string'||!branch||branch.length>200||/[\r\n]/.test(branch))throw Error('分支无效');
 await mkdir(cache,{recursive:true,mode:0o700});await mkdir(target,{recursive:true});
 const client=githubClient({token,fetchImpl}),base='https://api.github.com/repos/'+name;
 const metadata=await client.json(base);if(metadata.private!==true)throw Error('安装包仓库必须是私有仓库');
 const reference=await client.json(base+'/git/ref/heads/'+encodeURIComponent(branch));const revision=reference.object?.sha;
 if(!/^[a-f0-9]{40}$/.test(revision||'')||reference.object?.type!=='commit')throw Error('私库提交信息无效');
 const content=name=>base+'/contents/'+encodeURIComponent(name)+'?ref='+revision;
 log('正在检查 Android / Windows 最新安装包清单…');
 const manifests=await Promise.all(releasePlatforms.map(async([manifest,platform])=>({manifest,platform,info:await client.json(content(manifest),true,true)})));
 let failures=0,found=0;
 for(const {manifest,platform,info} of manifests){
  if(!info){log(platform+': 尚未发布，跳过');continue;}found++;
  try{
   validateRelease(info,platform);
   let current;try{current=validateRelease(JSON.parse(readFileSync(path.join(target,manifest),'utf8')),platform);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(current&&current.versionCode>=info.versionCode){
    if(current.versionCode===info.versionCode&&current.sha256!==info.sha256)throw Error('同构建号内容不同，拒绝替换');
    const published=path.join(target,current.filename);
    if(safeFile(published)!==current.size)throw Error('当前已发布文件缺失或大小不符，请恢复服务器安装包');
    log(platform+': 构建 '+current.versionCode+' 未变化或更高，跳过安装包下载');continue;
   }
   const stage=mkdtempSync(path.join(cache,'release-'+platform+'-'));
   try{
    for(const file of info.parts||[info]){
     const signedUrl=async()=>{const metadata=await client.json(content(file.filename),'object');if(metadata.type!=='file'||metadata.path!==file.filename||metadata.size!==file.size||typeof metadata.download_url!=='string')throw Error('下载文件信息不符');return metadata.download_url;};
     const cached=await downloadReleaseFile(client,signedUrl,file,cache,{attempts,log,fallbackUrl:content(file.filename)});copyFileSync(cached,path.join(stage,file.filename));
    }
    writeFileSync(path.join(stage,manifest),JSON.stringify(info));
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./import-app-release.mjs',import.meta.url)),stage,target],{encoding:'utf8'});
    if(result.status!==0)throw Error('安装包发布失败，旧包仍然保留');
    log(platform+': 已发布构建 '+info.versionCode+'（仅下载本版本文件）');
   }finally{rmSync(stage,{recursive:true,force:true});}
  }catch(error){failures++;log(platform+': '+error.message);}
 }
 if(!found)throw Error('私库尚无安装包清单');if(failures)throw Error('部分安装包同步失败；已发布安装包不受影响');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [repo,branch,cache,target]=process.argv.slice(2);
 try{await syncAppReleases({repo,branch,cache,target,token:readFileSync(0,'utf8').trim()});}
 catch(error){console.error(error.message);process.exitCode=1;}
}
