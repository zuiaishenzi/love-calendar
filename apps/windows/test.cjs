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
