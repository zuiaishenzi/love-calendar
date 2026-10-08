const fs=require('node:fs');const path=require('node:path');
module.exports=function({app,Notification,dialog,session,window,serverUrl}){
 if(!Notification)return {enable:async()=>{}};
 const file=path.join(app.getPath('userData'),'notifications.json');let state={enabled:false,cursor:null,owner:null,days:[]},busy=false;
 try{state={...state,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}
 const save=()=>{try{fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});}catch{}};
 const show=event=>{if(!Notification.isSupported())return;const notification=new Notification({title:event.title,body:event.body,icon:path.join(__dirname,'icon.png'),silent:false});notification.on('click',()=>{window.show();if(window.isMinimized())window.restore();window.focus();window.loadURL(serverUrl+'?notification='+encodeURIComponent(event.target));});notification.show();};
 async function poll(){if(!state.enabled||busy)return;busy=true;try{
  const query=new URLSearchParams();if(state.owner!=null)query.set('owner',state.owner);if(state.cursor!=null)query.set('after',state.cursor);
  const response=await session.fetch(serverUrl+'api/notifications?'+query,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(12000)});if(response.status===401){state.owner=null;state.cursor=null;state.days=[];save();return;}if(!response.ok)return;
  const data=await response.json();if(data.owner!==state.owner){state.owner=data.owner;state.cursor=null;state.days=[];}
  for(const event of data.events)show(event);for(const event of data.reminders){if(!state.days.includes(event.key)){show(event);state.days.push(event.key);}}
  state.days=state.days.slice(-200);state.cursor=data.cursor;save();
 }catch{}finally{busy=false;}}
 setInterval(poll,15000).unref();poll();
 return {async enable(){const response=await dialog.showMessageBox(window,{type:'question',buttons:['开启通知','关闭通知','取消'],defaultId:0,cancelId:2,title:'通知设置',message:'新消息使用社交通讯提醒，新增回忆和特殊日期使用服务通知。',detail:'客户端运行期间可接收通知，最小化后仍有效。Windows 系统通知需允许朝夕发送通知。'});if(response.response===2)return;state.enabled=response.response===0;save();if(state.enabled)await poll();}};
};
