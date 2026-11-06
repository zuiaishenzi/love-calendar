let stickerRows=[],stickerResults=[],stickerMode='mine',stickerManage=false,stickerOwner=null,stickerRequest=0,stickerSearching=false,stickerQuery='',stickerPage=1,stickerProvider='',stickerMore=false,stickerState=null,stickerStateTimer=null,stickerSaveInput=null,stickerPreviewUrl=null,stickerSaveBusy=false,stickerFileGeneration=0,stickerHold=null;
function endStickerPreview(){if(stickerHold)clearTimeout(stickerHold.timer);stickerHold=null;$('#sticker-peek').hidden=true;$('#sticker-peek img').removeAttribute('src');}
function stickerPreview(button,image){
 let held=false;
 button.addEventListener('pointerdown',event=>{if(event.button!==0)return;endStickerPreview();held=false;const hold={id:event.pointerId,x:event.clientX,y:event.clientY};hold.timer=setTimeout(()=>{if(stickerHold!==hold)return;held=true;$('#sticker-peek img').src=image.src;$('#sticker-peek').hidden=false;},350);stickerHold=hold;});
 button.addEventListener('click',event=>{if(held){event.preventDefault();event.stopImmediatePropagation();held=false;}},true);
 button.addEventListener('contextmenu',event=>event.preventDefault());image.draggable=false;
}
window.addEventListener('pointermove',event=>{if(stickerHold&&event.pointerId===stickerHold.id&&Math.hypot(event.clientX-stickerHold.x,event.clientY-stickerHold.y)>12)endStickerPreview();},{passive:true});
window.addEventListener('pointerup',endStickerPreview);window.addEventListener('pointercancel',endStickerPreview);window.addEventListener('blur',endStickerPreview);
function closeStickerDialogs(){$('#stickers-dialog').close();$('#sticker-save-dialog').close();}
function stopStickers(){closeStickerDialogs();stickerRequest++;stickerOwner=null;stickerRows=[];stickerResults=[];stickerState=null;stickerManage=false;}
function paintStickerState(state){
 stickerState=state;clearTimeout(stickerStateTimer);const online=stickerMode==='online',blocked=Boolean(state?.disabled||state?.temporary),form=$('#sticker-search-form');form.elements.q.disabled=online&&blocked;$('#sticker-search-submit').disabled=online&&(blocked||stickerSearching);$('#sticker-search-submit').textContent=stickerSearching?'搜索中':'搜索';
 $('#sticker-search-status').textContent=online&&state?.disabled?'本月在线搜索额度已用完，将于'+new Date(state.resetAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'})+'重新尝试。上传和收藏的表情仍可使用。':online&&state?.temporary?'在线搜索暂时繁忙，请稍候再试。':'';
 const retry=state?.disabled?state.resetAt:state?.temporary?state.retryAt:null;if(retry&&$('#stickers-dialog').open)stickerStateTimer=setTimeout(refreshStickerState,Math.min(86400000,Math.max(1000,retry-Date.now())));
}
async function refreshStickerState(){const owner=stickerOwner;try{const state=await api('/api/stickers/status');if(owner!==stickerOwner||!$('#stickers-dialog').open)return;paintStickerState(state);}catch{if(owner===stickerOwner)$('#sticker-search-status').textContent='暂时无法检查搜索服务，请稍后重试。';}}
function paintStickers(append=false){
 const online=stickerMode==='online',readonly=Boolean(currentUser?.lifecycle?.readonly);for(const button of document.querySelectorAll('[data-sticker-tab]'))button.setAttribute('aria-selected',String(button.dataset.stickerTab===stickerMode));
 $('#sticker-library-tools').hidden=online;$('#sticker-manage').textContent=stickerManage?'完成':'管理';$('#sticker-manage').disabled=readonly;$('#sticker-file').disabled=readonly;$('#sticker-search-form').hidden=!online;
 const list=$('#sticker-grid'),top=list.scrollTop,all=online?stickerResults:stickerRows,rows=append?all.slice(list.querySelectorAll('.sticker-tile').length):all;if(append)list.querySelector('.sticker-load-status')?.remove();else{endStickerPreview();list.replaceChildren();}
 if(!online){const add=el('label',undefined,'sticker-add'),icon=el('span','＋');add.htmlFor='sticker-file';add.setAttribute('aria-label','添加表情');add.append(icon);add.tabIndex=readonly?-1:0;add.setAttribute('aria-disabled',String(readonly));add.onkeydown=event=>{if(!readonly&&(event.key==='Enter'||event.key===' ')){event.preventDefault();$('#sticker-file').click();}};list.append(add);}
 if(!all.length&&!append)list.append(el('p',online?(stickerQuery?'没有找到合适的表情，换个词试试。':'输入关键词，找一个此刻想发的表情。'):'点击加号添加，也可以长按聊天图片收藏。','sticker-empty'));
 for(const row of rows){const cell=el('div',undefined,'sticker-tile'),send=el('button',undefined,'sticker-send'),image=el('img'),title=el('span',row.title);send.type='button';send.disabled=readonly||chatSending;send.setAttribute('aria-label','发送表情：'+row.title);image.src=online?row.preview:'/api/stickers/media/'+row.id;image.alt=row.title;image.loading='lazy';send.append(image,title);send.onclick=async()=>{if(chatSending)return;send.disabled=true;const owner=stickerOwner;if(await sendChat({kind:'image',sticker:true,...(online?{search_id:row.id}:{sticker_id:row.id}),preview:image.src})){if(owner===stickerOwner)$('#stickers-dialog').close();}else if(owner===stickerOwner){$('#sticker-panel-error').textContent=$('#chat-status').textContent||'表情发送失败，请重试';send.disabled=false;}};cell.append(send);
  stickerPreview(send,image);
  if(online){const save=el('button','＋','sticker-tile-action');save.type='button';save.title='添加到我的表情';save.setAttribute('aria-label','收藏表情：'+row.title);save.disabled=readonly;save.onclick=()=>openStickerSave({search_id:row.id},image.src,row.title);cell.append(save);}
  else if(stickerManage){const remove=el('button','×','sticker-tile-action');remove.type='button';remove.setAttribute('aria-label','删除表情：'+row.title);remove.disabled=readonly;remove.onclick=async()=>{const owner=stickerOwner;remove.disabled=true;try{const rows=await api('/api/stickers/'+row.id,'DELETE',{});if(owner!==stickerOwner)return;stickerRows=rows;paintStickers();}catch(error){if(owner===stickerOwner){$('#sticker-search-status').textContent=error.message;remove.disabled=false;}}};cell.append(remove);}
  list.append(cell);
 }
 if(online&&stickerMore)list.append(el('p',stickerSearching?'正在寻找更多表情…':'','sticker-load-status'));list.scrollTop=top;paintStickerState(stickerState);requestAnimationFrame(loadMoreStickers);
}
function loadMoreStickers(){const list=$('#sticker-grid');if($('#stickers-dialog').open&&stickerMode==='online'&&stickerMore&&!stickerSearching&&!stickerState?.disabled&&!stickerState?.temporary&&!$('#sticker-panel-error').textContent&&list.scrollHeight-list.scrollTop-list.clientHeight<32)runStickerSearch(true);}
$('#sticker-grid').addEventListener('scroll',()=>{endStickerPreview();loadMoreStickers();},{passive:true});
async function openStickers(){
 if(!chatOwner)return;const owner=chatOwner,request=++stickerRequest;if(stickerOwner!==owner){stickerRows=[];stickerResults=[];stickerMode='mine';stickerState=null;}stickerOwner=owner;stickerMode='mine';stickerManage=false;stickerSearching=false;$('#sticker-search-form').reset();$('#sticker-panel-error').textContent='';$('#stickers-dialog').showModal();paintStickers();
 try{const [rows,state]=await Promise.all([api('/api/stickers'),api('/api/stickers/status')]);if(owner!==stickerOwner||request!==stickerRequest||!$('#stickers-dialog').open)return;stickerRows=rows;stickerState=state;paintStickers();}catch(error){if(owner===stickerOwner)$('#sticker-panel-error').textContent=error.message;}
}
async function runStickerSearch(append=false){
 if(stickerMode!=='online'||stickerSearching)return;const q=append?stickerQuery:$('#sticker-search-form').elements.q.value.trim();if(!q||[...q].length>10){$('#sticker-panel-error').textContent='请输入10字以内的搜索词';return;}
 const owner=stickerOwner,request=++stickerRequest;stickerSearching=true;$('#sticker-panel-error').textContent='';paintStickerState(stickerState);const loading=$('#sticker-grid .sticker-load-status');if(loading)loading.textContent='正在寻找更多表情…';if(!append)$('#sticker-grid').scrollTop=0;
 try{const params=new URLSearchParams({q,page:String(append?stickerPage+1:1),...(append?{provider:stickerProvider}:{})}),data=await api('/api/stickers/search?'+params);if(owner!==stickerOwner||request!==stickerRequest||!$('#stickers-dialog').open)return;stickerResults=append?[...stickerResults,...data.items]:data.items;stickerQuery=q;stickerPage=data.page||1;stickerProvider=data.provider||'';stickerMore=Boolean(data.more);stickerState=data;if(data.unavailable)$('#sticker-panel-error').textContent='搜索服务暂时不可用，稍后再试。';}
 catch(error){if(owner===stickerOwner&&request===stickerRequest)$('#sticker-panel-error').textContent=error.message;}finally{if(owner===stickerOwner&&request===stickerRequest){stickerSearching=false;paintStickers(append);}}
}
$('#chat-stickers').onclick=openStickers;$('#stickers-close').onclick=()=>$('#stickers-dialog').close();
$('#stickers-dialog').addEventListener('close',()=>{endStickerPreview();stickerRequest++;stickerFileGeneration++;stickerSearching=false;clearTimeout(stickerStateTimer);});
for(const button of document.querySelectorAll('[data-sticker-tab]'))button.onclick=()=>{stickerRequest++;stickerSearching=false;stickerMode=button.dataset.stickerTab;stickerManage=false;$('#sticker-search-form').reset();if(stickerMode==='online')$('#sticker-search-form').elements.q.value=stickerQuery;$('#sticker-panel-error').textContent='';paintStickers();if(stickerMode==='online')refreshStickerState();};
$('#sticker-search-form').onsubmit=event=>{event.preventDefault();runStickerSearch();};$('#sticker-manage').onclick=()=>{stickerManage=!stickerManage;paintStickers();};
function openStickerSave(input,preview,title='收藏的表情'){
 if(currentUser?.lifecycle?.readonly)return;stickerSaveInput=input;$('#sticker-save-form').reset();$('#sticker-save-form').elements.title.value=title.slice(0,60);$('#sticker-save-preview').src=preview;$('#sticker-save-status').textContent='';$('#sticker-save-dialog').showModal();
}
$('#chat-context-save-sticker').onclick=()=>{const row=chatContextRow;if(!row||row.kind!=='image')return;closeChatMenu();openStickerSave({message_id:row.id},'/api/chat/media/'+row.id);};
$('#sticker-file').onchange=async event=>{const file=event.target.files[0],owner=chatOwner,generation=++stickerFileGeneration;if(!file)return;try{if(file.size>20*1024*1024)throw Error('表情图片不能超过20MB');const data=await chatBase64(file);if(owner!==chatOwner||generation!==stickerFileGeneration||view!=='chat')return;if(stickerPreviewUrl)URL.revokeObjectURL(stickerPreviewUrl);stickerPreviewUrl=URL.createObjectURL(file);openStickerSave({data},stickerPreviewUrl,file.name.replace(/\.[^.]+$/,'')||'我的表情');}catch(error){$('#sticker-panel-error').textContent=error.message;}finally{event.target.value='';}};
$('#sticker-save-close').onclick=$('#sticker-save-cancel').onclick=()=>$('#sticker-save-dialog').close();
$('#sticker-save-dialog').addEventListener('close',()=>{stickerSaveInput=null;$('#sticker-save-preview').removeAttribute('src');if(stickerPreviewUrl)URL.revokeObjectURL(stickerPreviewUrl);stickerPreviewUrl=null;});
$('#sticker-save-form').onsubmit=async event=>{event.preventDefault();if(!stickerSaveInput||stickerSaveBusy)return;stickerSaveBusy=true;$('#sticker-save-submit').disabled=true;const owner=chatOwner;
 try{const form=event.target,data=await api('/api/stickers','POST',{...stickerSaveInput,title:form.elements.title.value});if(owner!==chatOwner)return;stickerOwner=owner;stickerRows=data.items;$('#sticker-save-dialog').close();if($('#stickers-dialog').open)paintStickers();chatStatus(data.duplicate?'这个表情已经收藏过了':'已添加到我的表情');}catch(error){if(owner===chatOwner)$('#sticker-save-status').textContent=error.message;}finally{stickerSaveBusy=false;$('#sticker-save-submit').disabled=false;}
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('#stickers-dialog').open)refreshStickerState();});
