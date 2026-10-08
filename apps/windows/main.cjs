const {app,BrowserWindow,Menu,shell,dialog,Notification}=require('electron');
const path=require('node:path');
const {serverUrl}=require('./config.json');
const origin=new URL(serverUrl).origin;
if(new URL(serverUrl).protocol!=='https:')throw new Error('服务器必须使用 HTTPS');
const trusted=url=>{try{return new URL(url).origin===origin;}catch{return false;}};
let win;
function openExternal(url){if(/^https?:\/\//i.test(url))shell.openExternal(url);}
function createWindow(){
  app.setAppUserModelId?.('xyz.ourdays.desktop');
  win=new BrowserWindow({width:1180,height:820,minWidth:380,minHeight:600,title:'朝夕',icon:path.join(__dirname,'icon.png'),backgroundColor:'#faf6f8',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'persist:our-days'}});
  const session=win.webContents.session;
  win.webContents.setUserAgent?.(win.webContents.getUserAgent()+' OurDaysWindows/1.8.0');
  const notifier=require('./notifications.cjs')({app,Notification,dialog,session,window:win,serverUrl});
  session.setPermissionCheckHandler((contents,permission,requestOrigin,details)=>trusted(requestOrigin)&&permission==='media'&&details.mediaType==='audio');
  session.setPermissionRequestHandler(async(contents,permission,callback,details)=>{
    if(!trusted(details.requestingUrl)||permission!=='media'||!details.mediaTypes?.length||details.mediaTypes.some(type=>type!=='audio'))return callback(false);
    const {response}=await dialog.showMessageBox(win,{type:'question',buttons:['允许录音','取消'],defaultId:1,cancelId:1,title:'麦克风权限',message:'允许朝夕使用麦克风录制语音消息？'});
    callback(response===0);
  });
  win.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(trusted(url)&&new URL(url).pathname==='/app/enable-notifications'){event.preventDefault();notifier.enable();return;}if(!trusted(url)){event.preventDefault();openExternal(url);}});
  win.webContents.on('will-redirect',(event,url)=>{if(!trusted(url))event.preventDefault();});
  win.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)win.loadFile(path.join(__dirname,'offline.html'));});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'朝夕',submenu:[{label:'重新连接',click:()=>win.loadURL(serverUrl)},{label:'刷新',accelerator:'CmdOrCtrl+R',click:()=>trusted(win.webContents.getURL())?win.reload():win.loadURL(serverUrl)},{type:'separator'},{role:'quit',label:'退出'}]},{label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]}]));
  win.loadURL(serverUrl);
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.whenReady().then(createWindow);
  app.on('window-all-closed',()=>app.quit());
}
