import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Script,createContext} from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import {appUpdates} from './app-updates.mjs';
import {releaseDefinition,validateRelease} from './scripts/app-release-manifest.mjs';

test('鸿蒙 HAP 清单与 Android 隔离，发布、导入和下载保留哈希及旧包',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'ourdays-harmony-'));
 const source=path.join(dir,'source'),target=path.join(dir,'target'),file=path.join(dir,'fixture.hap');
 const bytes=Buffer.from([0x50,0x4b,0x03,0x04,1,2,3,4]);writeFileSync(file,bytes);
 const run=(script,args)=>{const result=spawnSync(process.execPath,['scripts/'+script,...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 let server;
 try{
  run('publish-app.mjs',[file,source,'10801','1.8.0','鸿蒙测试','harmony']);
  run('import-app-release.mjs',[source,target]);
  const info=JSON.parse(readFileSync(path.join(target,'harmony.json'),'utf8'));
  assert.equal(validateRelease(info,'harmony').packageId,'xyz.ourdays.harmony');
  assert.throws(()=>validateRelease(info,'android'));assert.throws(()=>releaseDefinition('__proto__'));
  assert.throws(()=>validateRelease({...info,filename:'../bad.hap'},'harmony'));
  assert.throws(()=>validateRelease({...info,parts:[]},'harmony'));
  const route=appUpdates(target);
  server=createServer((req,res)=>{try{route(req,res,new URL(req.url,'http://localhost'));}catch(error){res.writeHead(error.status||500);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  assert.deepEqual(await (await fetch(origin+'/api/app/update')).json(),{available:false});
  assert.deepEqual(await (await fetch(origin+'/api/app/update?platform=windows')).json(),{available:false});
  const update=await (await fetch(origin+'/api/app/update?platform=harmony')).json();assert.equal(update.packageId,'xyz.ourdays.harmony');
  const response=await fetch(origin+update.downloadUrl);assert.equal(response.headers.get('content-type'),'application/octet-stream');
  assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),info.sha256);
  const head=await fetch(origin+update.downloadUrl,{method:'HEAD'});assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  writeFileSync(file,Buffer.from([0x50,0x4b,0x03,0x04,4,3,2,1]));
  const repeat=spawnSync(process.execPath,['scripts/publish-app.mjs',file,target,'10801','1.8.0','test','harmony'],{encoding:'utf8'});assert.notEqual(repeat.status,0);assert.deepEqual(readFileSync(path.join(target,info.filename)),bytes);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});

test('鸿蒙客户端隐藏客户端下载，网页和旧客户端行为保持原状',()=>{
 const source=readFileSync('public/client-downloads.js','utf8');
 for(const [ua,hidden] of [['Mozilla/5.0 OurDaysHarmony/10801',true],['OurDaysAndroid/10808',true],['OurDaysWindows/10804',true],['Mozilla/5.0 OpenHarmony Phone',false]]){
  const nodes=new Map();const $=name=>{if(!nodes.has(name))nodes.set(name,{});return nodes.get(name);};
  new Script(source).runInNewContext({navigator:{userAgent:ua},$});assert.equal(nodes.get('#client-downloads').hidden,hidden);
 }
});

test('鸿蒙文档启动适配兼容旧网页，但不影响外站和子框架',()=>{
 const source=stripTypeScriptTypes(readFileSync('apps/harmony/entry/src/main/ets/common/PageBootstrap.ets','utf8'),{mode:'transform'}).replaceAll('export const','const');
 const bootstrap=new Script(source+';HARMONY_BOOTSTRAP;').runInNewContext({});
 for(const [origin,main,enabled] of [['https://love.11215739.xyz:11961',true,true],['https://evil.example',true,false],['https://love.11215739.xyz:11961',false,false]]){
  const styles=[],navigator={userAgent:'Mozilla/5.0 OpenHarmony'},window={};window.top=main?window:{};
  new Script(bootstrap).runInNewContext({location:{origin},window,navigator,MutationObserver:class{observe(){}},document:{querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>({}),documentElement:{append:style=>styles.push(style)},addEventListener:()=>{}}});
  assert.equal(navigator.userAgent.includes('OurDaysHarmony/10813'),enabled);assert.equal(styles.length,enabled?1:0);
  if(enabled){assert.match(navigator.userAgent,/OurDaysAndroid\/10808/);assert.equal(styles[0].rel,'stylesheet');assert.equal(styles[0].href,'https://love.11215739.xyz:11961/__ourdays_harmony__/appearance.css?build=10813');}
 }
});

test('鸿蒙内置CSS仅拦截指定同源GET子资源，遵守服务器style-src self',()=>{
 const page=readFileSync('apps/harmony/entry/src/main/ets/common/PageBootstrap.ets','utf8');
 const constants=new Script(stripTypeScriptTypes(page,{mode:'transform'}).replaceAll('export const','const')+';({HARMONY_APPEARANCE,HARMONY_STYLE_PATH});').runInNewContext({});
 const config=stripTypeScriptTypes(readFileSync('apps/harmony/entry/src/main/ets/common/ClientConfig.ets','utf8'),{mode:'transform'}).replaceAll('export ','');
 const commandPath=new Script(config+';commandPath;').runInNewContext({});
 const source=readFileSync('apps/harmony/entry/src/main/ets/pages/Index.ets','utf8'),method=source.slice(source.indexOf('  private appearance('),source.indexOf('  private intercept('));
 const code=stripTypeScriptTypes('class Harness {'+method+'}\nHarness;',{mode:'transform'});
 class Response{setResponseData(value){this.body=value;}setResponseMimeType(value){this.mime=value;}setResponseEncoding(value){this.encoding=value;}setResponseCode(value){this.status=value;}setReasonMessage(){}setResponseHeader(value){this.headers=value;}}
 const Harness=new Script(code).runInNewContext({...constants,commandPath,WebResourceResponse:Response});
 for(const [url,verb,main,allowed] of [
  ['https://love.11215739.xyz:11961/__ourdays_harmony__/appearance.css?build=10813','GET',false,true],
  ['https://evil.example/__ourdays_harmony__/appearance.css','GET',false,false],
  ['https://love.11215739.xyz:11961/style.css','GET',false,false],
  ['https://love.11215739.xyz:11961/__ourdays_harmony__/appearance.css','POST',false,false],
  ['https://love.11215739.xyz:11961/__ourdays_harmony__/appearance.css','GET',true,false]]){
  const response=new Harness().appearance({getRequestUrl:()=>url,getRequestMethod:()=>verb,isMainFrame:()=>main});
  assert.equal(!!response,allowed);if(response){assert.equal(response.status,200);assert.equal(response.mime,'text/css');assert.equal(response.encoding,'UTF-8');assert.match(response.body,/\.ourdays-scroll-layer\{position:fixed/);assert.match(response.body,/#client-downloads,#android-update-entry/);}
 }
});

test('鸿蒙加载后补注入复用已安装适配，丢失样式可恢复',()=>{
 const source=stripTypeScriptTypes(readFileSync('apps/harmony/entry/src/main/ets/common/PageBootstrap.ets','utf8'),{mode:'transform'}).replaceAll('export const','const');
 const bootstrap=new Script(source+';HARMONY_BOOTSTRAP;').runInNewContext({});
 let style=null,appends=0,observers=0,refreshes=0;
 const window={dispatchEvent:()=>refreshes++};window.top=window;
 const context=createContext({location:{origin:'https://love.11215739.xyz:11961'},window,navigator:{userAgent:'OurDaysHarmony/10813'},Event:class{},MutationObserver:class{constructor(){observers++;}observe(){}},document:{getElementById:()=>style,createElement:()=>({}),documentElement:{append:node=>{style=node;appends++;}},querySelectorAll:()=>[],addEventListener:()=>{}}});
 const run=()=>new Script(bootstrap).runInContext(context);
 run();assert.equal(window.__ourdaysHarmonyBootstrap,'10813');assert.equal(appends,1);const initialObservers=observers;
 run();assert.equal(appends,1);assert.equal(observers,initialObservers);assert.equal(refreshes,1);
 style=null;run();assert.equal(appends,2);assert.equal(observers,initialObservers);
});

test('鸿蒙日历随原生可用高度、导航高度和月份行数重新分配空间',()=>{
 const source=stripTypeScriptTypes(readFileSync('apps/harmony/entry/src/main/ets/common/PageBootstrap.ets','utf8'),{mode:'transform'}).replaceAll('export const','const');
 const layout=new Script(source+';HARMONY_LAYOUT;').runInNewContext({});
 const vars=new Map(),listeners={},frames=[],attrs=new Map();const attr={getAttribute:key=>attrs.get(key),setAttribute:(key,value)=>attrs.set(key,value)};let rows=6,navigationHeight=64;
 const style={getPropertyValue:key=>vars.get(key),setProperty:(key,value)=>vars.set(key,value)};
 const box=height=>({hidden:false,getBoundingClientRect:()=>({height})});
 const grid={get children(){return Array(rows*7).fill({});}},toolbar=box(70),week=box(30),note=box(20);
 const calendar={...box(0),children:[toolbar,week,grid,note],querySelector:()=>grid};
 const workspace={getBoundingClientRect:()=>({top:140}),querySelector:()=>calendar};
 const nav={getBoundingClientRect:()=>({height:navigationHeight,top:parseInt(vars.get('--ourdays-viewport-height'))-navigationHeight})};
 const nodes={'.view-switch':nav,'#calendar-view':{getAttribute:()=> 'true'},'.workspace':workspace,':scope>.bottom':box(24),':scope>#status':null};
 const app={...attr,hidden:false,classList:{contains:()=>true},querySelector:selector=>nodes[selector]};
 const window={innerWidth:393,innerHeight:800,visualViewport:{height:760,addEventListener:()=>{}},__ourdaysViewport:{width:393,height:720},addEventListener:(name,fn)=>listeners[name]=fn};
 new Script(layout).runInNewContext({window,document:{documentElement:{style,...attr},querySelector:()=>app,querySelectorAll:()=>[],addEventListener:()=>{}},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},getComputedStyle:()=>({display:'block'})});
 const flush=()=>{while(frames.length)frames.shift()();};flush();
 assert.equal(vars.get('--ourdays-viewport-height'),'720px');
 assert.equal(vars.get('--ourdays-nav-height'),'64px');
 assert.equal(vars.get('--ourdays-calendar-height'),'488px');
 assert.equal(vars.get('--ourdays-grid-height'),'368px');
 for(rows of [4,5,6]){listeners.resize();flush();assert.equal(vars.get('--ourdays-calendar-rows'),String(rows));}
 window.__ourdaysViewport.height=600;navigationHeight=80;listeners['ourdays-viewport']();flush();
 assert.equal(vars.get('--ourdays-calendar-height'),'352px');
 assert.equal(vars.get('--ourdays-grid-height'),'232px');
});

test('鸿蒙个性设置可切换并保存导航位置，兼容标记不会显示更新选项',()=>{
 const source=readFileSync('public/settings.js','utf8'),code=source.slice(source.indexOf('const harmonyClient=')),nodes=new Map(),radios=[{value:'top'},{value:'bottom'}];let bottom=false,saved='bottom';
 const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,classList:{toggle:(_name,value)=>bottom=value},showModal:()=>{}});return nodes.get(id);};
 new Script(code).runInNewContext({navigator:{userAgent:'OurDaysHarmony/10802 OurDaysAndroid/10808'},$,menuOpen:()=>{},document:{querySelectorAll:()=>radios},localStorage:{getItem:()=>saved,setItem:(_key,value)=>saved=value}});
 assert.equal($('#system-personalization').hidden,false);assert.equal($('#android-update-entry').hidden,true);assert.equal($('#system-menu-description').textContent,'个性设置');assert.equal(bottom,true);
 radios[0].checked=true;radios[0].onchange();assert.equal(bottom,false);assert.equal(saved,'top');
});

test('鸿蒙旧网页录音链接移除拖拽地址，移动不结束录音且取消点击仍可用',async()=>{
 const source=stripTypeScriptTypes(readFileSync('apps/harmony/entry/src/main/ets/common/PageBootstrap.ets','utf8'),{mode:'transform'}).replaceAll('export const','const');
 const bootstrap=new Script(source+';HARMONY_BOOTSTRAP;').runInNewContext({});
 const listeners={},attrs=new Map([['href','/app/record-voice']]);let changed,prevented=false,stopped=false;
 const node={getAttribute:name=>attrs.has(name)?attrs.get(name):null,removeAttribute:name=>attrs.delete(name),closest:()=>node,draggable:true};
 const window={location:{}};window.top=window;
 new Script(bootstrap).runInNewContext({location:{origin:'https://love.11215739.xyz:11961'},window,navigator:{userAgent:'OpenHarmony'},queueMicrotask,MutationObserver:class{constructor(fn){changed=fn;}observe(){}},document:{getElementById:()=>null,createElement:()=>({}),documentElement:{append:()=>{}},querySelectorAll:()=>[node],addEventListener:(name,fn)=>listeners[name]=fn}});
 assert.equal(attrs.has('href'),false);assert.equal(node.draggable,false);
 listeners.dragstart({target:node,preventDefault:()=>prevented=true,stopPropagation:()=>stopped=true});assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(window.location.href,undefined);
 listeners.click({target:node,defaultPrevented:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(window.location.href,undefined);
 attrs.set('href','/app/cancel-voice');changed();assert.equal(attrs.has('href'),false);
 listeners.click({target:node,defaultPrevented:false});await new Promise(resolve=>setImmediate(resolve));assert.equal(window.location.href,'/app/cancel-voice');
 attrs.set('href','https://evil.example');changed();window.location.href='unchanged';listeners.click({target:node,defaultPrevented:false});await new Promise(resolve=>setImmediate(resolve));assert.equal(window.location.href,'unchanged');
});

test('Web麦克风只在本站前台取得系统授权后放行，外站和摄像头请求拒绝',async()=>{
 const source=readFileSync('apps/harmony/entry/src/main/ets/pages/Index.ets','utf8');
 const methods=source.slice(source.indexOf('  private cancelWebPermission()'),source.indexOf('  private personalize()'));
 const code=stripTypeScriptTypes('class Harness { webPermissionGeneration=0;webPermission=undefined;foreground=true;isTrusted(){return true;}context(){return {};}toast(){};'+methods+'}\nHarness;',{mode:'transform'});
 for(const [origin,resources,auth,allowed,shown,settingAuth] of [['https://love.11215739.xyz:11961',['TYPE_AUDIO_CAPTURE'],0,true],['https://evil.example',['TYPE_AUDIO_CAPTURE'],0,false],['https://love.11215739.xyz:11961',['TYPE_VIDEO_CAPTURE'],0,false],['https://love.11215739.xyz:11961',['TYPE_AUDIO_CAPTURE'],-1,false,true],['https://love.11215739.xyz:11961',['TYPE_AUDIO_CAPTURE'],-1,true,false,0],['https://love.11215739.xyz:11961',['TYPE_AUDIO_CAPTURE'],-1,false,false,-1]]){
  let grants=0,denied=0,requests=0,settings=0;
  const Class=new Script(code).runInNewContext({trusted:value=>value==='https://love.11215739.xyz:11961',abilityAccessCtrl:{createAtManager:()=>({requestPermissionsFromUser:async()=>{requests++;return {authResults:[auth],dialogShownResults:shown===undefined?undefined:[shown]};},requestPermissionOnSetting:async()=>{settings++;return [settingAuth];}})}});
  const request={getOrigin:()=>origin,getAccessibleResource:()=>resources,deny:()=>denied++,grant:values=>{assert.equal(values.join(','),'TYPE_AUDIO_CAPTURE');grants++;}};
  await new Class().grantWebMicrophone(request);assert.equal(grants,allowed?1:0);assert.equal(denied,allowed?0:1);if(origin==='https://evil.example'||resources[0]==='TYPE_VIDEO_CAPTURE')assert.equal(requests,0);assert.equal(settings,shown===false?1:0);
 }
});

// Execute the actual recorder state machine with fake OS services. This checks
// cancellation/permission races; it is not an ArkTS compiler or device test.
function recorderFixture({settingStatus=0}={}){
 let permissionResolve,prepareResolve;let delayPrepare=false,now=0;const messages=[],calls=[],files=new Map();let nextFd=1;
 const permissions=new Promise(resolve=>{permissionResolve=resolve;});
 const fs={OpenMode:{READ_WRITE:1,CREATE:2,TRUNC:4,READ_ONLY:8},openSync(name){const file={fd:nextFd++,path:name,offset:0};files.set(file.fd,file);return file;},closeSync(file){calls.push('close');files.delete(file.fd??file);},unlinkSync(){calls.push('unlink');},statSync(){return {size:4};},readSync(fd,buffer){const file=files.get(fd),count=Math.min(buffer.byteLength,4-file.offset);new Uint8Array(buffer).fill(7,0,count);file.offset+=count;return count;}};
 const recorder={on(){},async prepare(){calls.push('prepare');if(delayPrepare)await new Promise(resolve=>{prepareResolve=resolve;});},async start(){calls.push('start');},async stop(){calls.push('stop');},async release(){calls.push('release');}};
 const mocks={abilityAccessCtrl:{createAtManager:()=>({requestPermissionsFromUser:()=>permissions,requestPermissionOnSetting:async()=>{calls.push('settings');return [settingStatus];}})},media:{createAVRecorder:async()=>recorder,AudioSourceType:{AUDIO_SOURCE_TYPE_MIC:1},CodecMimeType:{AUDIO_AAC:1},ContainerFormatType:{CFT_MPEG_4A:1}},fs,util:{Base64Helper:class{encodeToStringSync(bytes){return Buffer.from(bytes).toString('base64');}}}};
 let source=readFileSync('apps/harmony/entry/src/main/ets/common/NativeVoiceRecorder.ets','utf8').replace(/^import .*;\r?\n/gm,'');
 source=stripTypeScriptTypes(source,{mode:'transform'}).replace('export class NativeVoiceRecorder','class NativeVoiceRecorder');
 const sandbox=createContext({...mocks,Date:{now:()=>now},setInterval:()=>1,clearInterval:()=>{}});
 const Class=new Script(source+'\nNativeVoiceRecorder;').runInContext(sandbox);
 const instance=new Class({cacheDir:'/cache'},async value=>{messages.push(value);},()=>true);
 return {instance,messages,calls,files,grant:()=>permissionResolve({authResults:[0]}),deny:()=>permissionResolve({authResults:[-1],dialogShownResults:[true]}),previouslyDenied:()=>permissionResolve({authResults:[-1],dialogShownResults:[false]}),delay:()=>{delayPrepare=true;},prepared:()=>prepareResolve(),time:value=>{now=value;},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('录音授权等待期间取消不会打开麦克风',async()=>{
 const f=recorderFixture();f.instance.start();await f.flush();f.instance.cancel();f.grant();await f.flush();
 assert.ok(!f.calls.includes('start'));assert.equal(f.files.size,0);assert.equal(f.messages.at(-1).cancelled,true);
});
test('系统授权面板导致的暂时后台不取消首次录音',async()=>{
 const f=recorderFixture();f.instance.start();await f.flush();f.instance.background();f.grant();await f.flush();
 assert.ok(f.calls.includes('start'));assert.equal(f.messages[0].recording,true);f.instance.cancel();await f.flush();assert.equal(f.files.size,0);
});
test('录音 prepare 等待期间取消会释放文件和录音器',async()=>{
 const f=recorderFixture();f.delay();f.instance.start();f.grant();await f.flush();f.instance.cancel();f.prepared();await f.flush();
 assert.ok(!f.calls.includes('start'));assert.equal(f.files.size,0);assert.ok(f.calls.includes('release'));assert.equal(f.messages.at(-1).cancelled,true);
});
test('拒绝授权不录音；正常结束输出与 Android 一致的语音结果',async()=>{
 const denied=recorderFixture();denied.instance.start();denied.deny();await denied.flush();assert.ok(denied.messages.at(-1).error);assert.ok(!denied.calls.includes('start'));
 const f=recorderFixture();f.instance.start();f.grant();await f.flush();assert.equal(f.messages[0].recording,true);
 f.time(1500);f.instance.finish();await f.flush();assert.equal(f.messages.at(-1).data,'BwcHBw==');assert.equal(f.messages.at(-1).duration,1.5);assert.equal(f.files.size,0);assert.ok(f.calls.includes('stop'));assert.ok(f.calls.includes('unlink'));
});

test('历史麦克风拒绝通过系统设置再次征求同意，同意才启动录音',async()=>{
 for(const settingStatus of [0,-1]){
  const f=recorderFixture({settingStatus});f.instance.start();f.previouslyDenied();await f.flush();
  assert.ok(f.calls.includes('settings'));assert.equal(f.calls.includes('start'),settingStatus===0);
  if(settingStatus===0){assert.equal(f.messages[0].recording,true);f.instance.cancel();await f.flush();}else assert.ok(f.messages[0].error);
 }
 const fresh=recorderFixture();fresh.instance.start();fresh.deny();await fresh.flush();assert.ok(!fresh.calls.includes('settings'));assert.ok(!fresh.calls.includes('start'));
 const cancelled=recorderFixture();cancelled.instance.start();await cancelled.flush();cancelled.instance.cancel();cancelled.previouslyDenied();await cancelled.flush();assert.ok(!cancelled.calls.includes('settings'));assert.ok(!cancelled.calls.includes('start'));
});
