const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('远程网页隔离、导航和麦克风权限限制',async()=>{
  const handlers={},calls=[];
  let windowOptions,checkPermission,requestPermission,openWindow;
  const session={setPermissionCheckHandler:fn=>checkPermission=fn,setPermissionRequestHandler:fn=>requestPermission=fn};
  const contents={session,on:(name,fn)=>handlers[name]=fn,setWindowOpenHandler:fn=>openWindow=fn,getURL:()=> 'https://love.11215739.xyz:11961/'};
  class Window {constructor(options){windowOptions=options;this.webContents=contents;}loadURL(url){calls.push(url);}loadFile(file){calls.push(file);}}
  const electron={app:{requestSingleInstanceLock:()=>true,on:()=>{},whenReady:()=>Promise.resolve(),quit:()=>{}},BrowserWindow:Window,Menu:{buildFromTemplate:value=>value,setApplicationMenu:()=>{}},shell:{openExternal:url=>calls.push(url)},dialog:{showMessageBox:async()=>({response:0})}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/main.cjs','utf8'),{require:name=>name==='electron'?electron:name==='./config.json'?require('./config.json'):require(name),URL,__dirname});
  await Promise.resolve();
  assert.equal(windowOptions.webPreferences.nodeIntegration,false);
  assert.equal(windowOptions.webPreferences.contextIsolation,true);
  assert.equal(windowOptions.webPreferences.sandbox,true);
  assert.equal(checkPermission(null,'media','https://love.11215739.xyz:11961',{mediaType:'audio'}),true);
  assert.equal(checkPermission(null,'media','https://example.com',{mediaType:'audio'}),false);
  assert.equal(checkPermission(null,'media','https://love.11215739.xyz:11961',{mediaType:'video'}),false);
  let prevented=false;handlers['will-navigate']({preventDefault:()=>prevented=true},'https://example.com');assert.equal(prevented,true);
  assert.equal(openWindow({url:'file:///C:/secret'}).action,'deny');assert.equal(calls.includes('file:///C:/secret'),false);
  let granted;
  await requestPermission(null,'media',value=>granted=value,{requestingUrl:'https://love.11215739.xyz:11961/',mediaTypes:['audio']});assert.equal(granted,true);
  await requestPermission(null,'media',value=>granted=value,{requestingUrl:'https://example.com',mediaTypes:['audio']});assert.equal(granted,false);
  await requestPermission(null,'media',value=>granted=value,{requestingUrl:'https://love.11215739.xyz:11961/',mediaTypes:['video','audio']});assert.equal(granted,false);
  handlers['did-fail-load'](null,-105,'','',true);assert.ok(calls.some(value=>value.endsWith('offline.html')));
});


test('桌面通知用户授权后启用、日期去重、点击跳转及账号切换游标',async()=>{
 const os=require('node:os'),path=require('node:path'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'love-desktop-notifications-')),shown=[],urls=[];let answer=0,index=0;
 class Notification{static isSupported(){return true;}constructor(options){this.options=options;this.handlers={};}on(name,callback){this.handlers[name]=callback;}show(){shown.push(this);}}
 const responses=[{owner:1,cursor:1,events:[],reminders:[{key:'1:2026-10-08',title:'今天',body:'纪念日',target:'2026-10-08'}]},{owner:1,cursor:2,events:[{title:'对方',body:'你好',target:'chat'}],reminders:[{key:'1:2026-10-08',title:'今天',body:'纪念日',target:'2026-10-08'}]},{owner:2,cursor:10,events:[],reminders:[]}];
 const session={async fetch(url,options){assert.equal(options.credentials,'include');urls.push(url);return {ok:true,status:200,async json(){return responses[index++];}};}};
 try{const notifier=require('./notifications.cjs')({app:{getPath:()=>directory},Notification,dialog:{showMessageBox:async()=>({response:answer})},session,window:{show(){},isMinimized:()=>false,focus(){},loadURL:url=>urls.push(url)},serverUrl:'https://love.11215739.xyz:11961/'});
  answer=2;await notifier.enable();assert.equal(index,0);answer=0;await notifier.enable();await notifier.enable();assert.equal(shown.length,2);assert.ok(urls[1].includes('owner=1'));assert.ok(urls[1].includes('after=1'));shown[1].handlers.click();assert.ok(urls.at(-1).endsWith('?notification=chat'));await notifier.enable();assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'notifications.json'),'utf8')).owner,2);answer=1;await notifier.enable();assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'notifications.json'),'utf8')).enabled,false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});


test('Windows应用内更新校验地址与哈希，下载后由用户决定安装',async()=>{
 const crypto=require('node:crypto'),os=require('node:os'),path=require('node:path'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'love-windows-update-')),factory=require('./updater.cjs'),base='https://love.11215739.xyz:11961/',bytes=Buffer.from('MZfake-installer'),info={available:true,packageId:'xyz.ourdays.desktop',versionCode:10804,versionName:'1.8.0',filename:'OurDays-test.exe',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'更新',downloadUrl:'/api/app/download/OurDays-test.exe'},messages=[];let calls=0;
 try{for(const patch of [{downloadUrl:'https://evil.test/api/app/download/OurDays-test.exe'},{downloadUrl:'/api/app/download/../secret.exe'},{size:201*1024*1024},{sha256:'bad'},{packageId:'wrong'}])assert.throws(()=>factory.validate({...info,...patch},base));
  const updater=factory({app:{getPath:()=>directory,quit:()=>assert.fail('用户未选择安装')},window:{},dialog:{async showMessageBox(_win,options){messages.push(options);return {response:options.buttons?.[0]==='下载更新'?0:1};}},session:{async fetch(url,options){assert.equal(options.redirect,'error');calls++;if(url.includes('/update?'))return {ok:true,json:async()=>info};return {ok:true,body:(async function*(){yield bytes;})()};}},serverUrl:base,build:10803});await updater.check();assert.equal(calls,2);assert.deepEqual(fs.readFileSync(path.join(directory,'updates',info.filename)),bytes);assert.ok(messages.some(m=>m.title==='更新已准备好'));
  info.sha256='0'.repeat(64);await updater.check();assert.ok(messages.at(-1).message.includes('校验失败'));assert.equal(fs.readdirSync(path.join(directory,'updates')).length,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
