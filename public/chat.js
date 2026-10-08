let chatOwner=null,chatTimer=null,chatBusy=false,chatMore=false,chatOldest=null,chatRows=[],chatSending=false,chatGeneration=0,chatRenderKey='';
let voiceStream=null,voiceRecorder=null,voiceBlob=null,voiceUrl=null,voiceTimer=null,voiceSeconds=0,recordGeneration=0,voiceStarting=false;
let chatMembers=[],chatSelecting=false,chatSelected=new Set(),chatSavingMemory=false;
let chatSyncSince=0;
let chatPeerOnline=false,chatPending=null;
function updateChatPresence(online){chatPeerOnline=online;const badge=$('#chat-peer-status');badge.textContent=online?'在线':'离开';badge.classList.toggle('online',online);}
function chatSelection(){const readonly=Boolean(currentUser?.lifecycle?.readonly);$('#chat-selection-bar').hidden=!chatSelecting;$('#chat-selection-cancel').disabled=chatSavingMemory;$('#chat-selection-count').textContent=`已选 ${chatSelected.size} 条`;$('#chat-to-memory').disabled=readonly||chatSavingMemory||!chatSelected.size;$('#chat-to-memory').textContent=chatSavingMemory?'正在收藏…':'存入今日回忆';}
let chatContextRow=null,chatPressTimer=null,chatPressStart=null,chatLongPressed=false;
function closeChatMenu(){clearTimeout(chatPressTimer);$('#chat-context-menu').hidden=true;chatContextRow=null;}
function openChatMenu(row,x,y,host=$('#chat-dialog')){if(row.retracted_at)return;chatContextRow=row;$('#chat-context-transcribe').hidden=row.kind!=='audio';$('#chat-context-transcribe').disabled=Boolean(currentUser?.lifecycle?.readonly);const menu=$('#chat-context-menu');host.append(menu);const bounds=host.getBoundingClientRect();menu.hidden=false;$('#chat-context-copy').hidden=row.kind!=='text';const download=$('#chat-context-download');download.hidden=row.kind!=='audio';download.href='/api/chat/media/'+row.id+'?download=1';$('#chat-context-select').hidden=host.id==='chat-history-dialog';$('#chat-context-retract').hidden=row.sender!==chatOwner;$('#chat-context-retract').disabled=Boolean(currentUser?.lifecycle?.readonly);$('#chat-context-select').disabled=Boolean(currentUser?.lifecycle?.readonly);menu.style.left=Math.max(8,Math.min(x-bounds.left,bounds.width-menu.offsetWidth-8))+'px';menu.style.top=(host.scrollTop+Math.max(8,Math.min(y-bounds.top,bounds.height-menu.offsetHeight-8)))+'px';(row.kind==='text'?$('#chat-context-copy'):row.kind==='audio'?download:$('#chat-context-select')).focus();}
$('#chat-context-download').onclick=()=>closeChatMenu();
$('#chat-context-select').onclick=()=>{const row=chatContextRow;if(!row)return;closeChatMenu();chatSelecting=true;chatSelected.add(row.id);renderChat();};
$('#chat-context-copy').onclick=async()=>{const text=chatContextRow?.text;if(text===undefined)return;closeChatMenu();try{await navigator.clipboard.writeText(text);chatStatus('已复制');}catch{chatStatus('复制失败，请检查浏览器剪贴板权限');}};
$('#chat-context-retract').onclick=async()=>{const row=chatContextRow;if(!row||row.sender!==chatOwner)return;closeChatMenu();const owner=chatOwner;try{await api('/api/chat/messages/'+row.id+'/retract','POST',{});if(owner===chatOwner){chatSelected.delete(row.id);chatStatus('已撤回');await syncChat();if($('#chat-history-dialog').open)await searchChatHistory();}}catch(e){if(owner===chatOwner)chatStatus(e.message);}};
$('#chat-dialog').addEventListener('click',e=>{if(!e.target.closest('#chat-context-menu'))closeChatMenu();});
$('#chat-dialog').addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#chat-context-menu').hidden){e.preventDefault();e.stopPropagation();closeChatMenu();}});
$('#chat-messages').addEventListener('scroll',closeChatMenu);
function chatMessageMenu(card,row){
 card.tabIndex=0;card.addEventListener('contextmenu',e=>{if(row.retracted_at)return;e.preventDefault();openChatMenu(row,e.clientX,e.clientY,card.closest?.('dialog'));});
 card.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();const bounds=card.getBoundingClientRect();openChatMenu(row,bounds.left+20,bounds.top+20,card.closest?.('dialog'));}});
 card.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||e.target.closest('audio,input')||row.retracted_at)return;clearTimeout(chatPressTimer);chatLongPressed=false;chatPressStart={x:e.clientX,y:e.clientY};chatPressTimer=setTimeout(()=>{chatLongPressed=true;openChatMenu(row,e.clientX,e.clientY,card.closest?.('dialog'));},500);});
 card.addEventListener('pointermove',e=>{if(chatPressStart&&Math.hypot(e.clientX-chatPressStart.x,e.clientY-chatPressStart.y)>10)clearTimeout(chatPressTimer);});
 for(const type of ['pointerup','pointercancel','pointerleave'])card.addEventListener(type,()=>{clearTimeout(chatPressTimer);chatPressStart=null;});
 card.addEventListener('click',e=>{if(chatLongPressed){e.preventDefault();e.stopPropagation();chatLongPressed=false;}},true);
}
function chatHeader(){const peer=chatMembers.find(m=>m.id!==chatOwner),host=$('#chat-peer-avatar');$('#chat-title').textContent=peer?.name||'等待对方加入';if(peer)drawAvatar(host,peer);else{host.replaceChildren();delete host.dataset.avatar;}}
const chatStatus=text=>$('#chat-status').textContent=text;
function releaseRecording(){if(typeof nativeVoiceActive!=='undefined'&&nativeVoiceActive){$('#chat-native-cancel').click();resetNativeVoiceUI();}recordGeneration++;clearInterval(voiceTimer);if(voiceRecorder){voiceRecorder.onstop=null;voiceRecorder.ondataavailable=null;voiceRecorder.onerror=null;if(voiceRecorder.state!=='inactive')voiceRecorder.stop();}voiceRecorder=null;voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;voiceBlob=null;if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=null;$('#chat-record-preview').pause();$('#chat-record-preview').removeAttribute('src');$('#chat-record-preview').hidden=true;$('#chat-record-send').hidden=$('#chat-record-cancel').hidden=true;$('#chat-record').textContent='录制语音';}
function stopChat(){leaveChatView();if(typeof closeSpeech==="function")closeSpeech();updateChatPresence(false);$('#chat-history-dialog').close();$('#chat-history-form').reset();chatGeneration++;clearTimeout(chatTimer);chatTimer=null;chatBusy=false;chatOwner=null;chatPending=null;chatMembers=[];chatRows=[];chatRenderKey='';$('#chat-messages').replaceChildren();$('#chat-form').reset();releaseRecording();chatUnreadBadge(0);}
function startChat(){if(chatOwner!==currentUser?.id){stopChat();chatOwner=currentUser?.id;}syncChat();}
function chatSelectableRow(wrap,check){
 const toggle=()=>{if(check.disabled)return;check.checked=!check.checked;check.onchange();};
 wrap.tabIndex=0;
 wrap.addEventListener('click',e=>{if(e.target===check)return;e.preventDefault();e.stopPropagation();if(chatLongPressed){chatLongPressed=false;return;}toggle();},true);
 wrap.addEventListener('keydown',e=>{if(e.target===wrap&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();toggle();}});
}
function renderChat(){
 chatHeader();chatSelection();
 $('#chat-earlier').hidden=!chatMore;
 const readonly=Boolean(currentUser?.lifecycle?.readonly);for(const field of $('#chat-form').elements)field.disabled=readonly||chatSending;
 $('#chat-record').disabled=readonly||chatSending||voiceStarting;$('#chat-image-input').disabled=readonly||chatSending;
 for(const row of chatRows)if(row.retracted_at)chatSelected.delete(row.id);chatSelection();
 const key=chatOwner+':'+chatSelecting+':'+JSON.stringify(chatMembers)+':'+(chatPending?.id||'')+':'+chatRows.map(r=>r.id+'-'+(r.retracted_at||0)+'-'+(r.transcript||'')).join(',');if(key===chatRenderKey)return;chatRenderKey=key;
 const list=$('#chat-messages'),bottom=list.scrollHeight-list.scrollTop-list.clientHeight<70;for(const audio of list.querySelectorAll('audio'))audio.pause();list.replaceChildren();
 let previous=null;
 for(const row of [...chatRows,...(chatPending?[chatPending]:[])]){appendChatTime(list,row.created,previous);previous=row.created;const mine=row.sender===chatOwner,wrap=el('div',undefined,'chat-row'+(mine?' mine':'')),avatar=el('span',undefined,'avatar chat-avatar'),member=chatMembers.find(m=>m.id===row.sender);avatar.setAttribute('aria-label',mine?'我的头像':row.name+'的头像');if(member)drawAvatar(avatar,member);
  if(chatSelecting&&!row.retracted_at){const check=el('input');check.type='checkbox';check.checked=chatSelected.has(row.id);check.disabled=chatSavingMemory;check.setAttribute('aria-label','选择'+row.name+'的'+({text:'文字',image:'图片',audio:'语音'}[row.kind])+'消息');check.onchange=()=>{if(check.checked&&chatSelected.size>=50){check.checked=false;chatStatus('一次最多选择50条消息');return;}if(check.checked)chatSelected.add(row.id);else chatSelected.delete(row.id);wrap.classList.toggle('selected',check.checked);chatSelection();};wrap.append(check);wrap.classList.toggle('selected',check.checked);wrap.classList.add('selectable');chatSelectableRow(wrap,check);}
  const card=el('article',undefined,'chat-message'+(mine?' mine':''));
  if(row.retracted_at){wrap.classList.add('retracted');card.append(el('p',mine?'你撤回了一条消息':'对方撤回了一条消息','chat-retracted'));wrap.append(card);list.append(wrap);continue;}
  if(!row.pending)chatMessageMenu(card,row);
  if(row.kind==='text')card.append(el('p',row.text,'chat-text'));
  if(row.kind==='image'){const img=el('img');img.src=row.pending?row.preview:'/api/chat/media/'+row.id;img.alt='聊天图片';img.loading='lazy';const button=el('button',undefined,'chat-image');button.type='button';button.setAttribute('aria-label','放大聊天图片');button.append(img);button.onclick=()=>openPhoto(img);card.append(button);}
  if(row.pending&&row.kind==='audio')card.append(el('p','语音 · '+Math.ceil(row.duration||1)+'秒','chat-text'));
  if(!row.pending&&row.kind==='audio'){card.classList.add('voice-card');card.append(voiceMessage('/api/chat/media/'+row.id,row.duration));speechTranscript(card,row);}wrap.append(avatar,card);if(row.pending){const spinner=el('span',undefined,'chat-send-spinner');spinner.setAttribute('role','status');spinner.setAttribute('aria-label','正在发送');wrap.append(spinner);}list.append(wrap);
 }
 if(!chatRows.length&&!chatPending)list.append(el('p','想说的话，随时留给对方。','chat-empty'));
 if(bottom)list.scrollTop=list.scrollHeight;
}
async function syncChat(){
 clearTimeout(chatTimer);if(!chatOwner||chatBusy)return;chatBusy=true;const generation=chatGeneration;
 try{
  if(!$('#chat-dialog').hidden){const data=await api('/api/chat/messages?since='+chatSyncSince);if(generation!==chatGeneration)return;chatUnreadBadge(data.unread?.count||0);chatSyncSince=data.revision;chatMembers=data.members;const byId=new Map(chatRows.map(r=>[r.id,r]));for(const row of data.messages)byId.set(row.id,row);for(const retracted of data.retractions||[]){const row=byId.get(retracted.id);if(row)byId.set(row.id,{...row,text:'',mime:null,retracted_at:retracted.retracted_at});}chatRows=[...byId.values()].sort((a,b)=>a.id-b.id);if(chatOldest===null){chatMore=data.more;chatOldest=chatRows[0]?.id||null;}
   let oldest=data.messages[0]?.id;let more=data.more,fetchedEarlier=false;
   while(data.unread?.count&&more&&oldest>data.unread.readThrough){const earlier=await api('/api/chat/messages?before='+oldest);if(generation!==chatGeneration||$('#chat-dialog').hidden)return;fetchedEarlier=true;for(const row of earlier.messages)byId.set(row.id,row);const next=earlier.messages[0]?.id;if(!next||next>=oldest)break;oldest=next;more=earlier.more;}
   chatRows=[...byId.values()].sort((a,b)=>a.id-b.id);chatOldest=chatRows[0]?.id||null;if(fetchedEarlier)chatMore=more;renderChat();
   if(!$('#chat-dialog').hidden&&!document.hidden){if(data.unread?.count)$('#chat-messages').scrollTop=$('#chat-messages').scrollHeight;await new Promise(resolve=>requestAnimationFrame(resolve));if(generation!==chatGeneration||$('#chat-dialog').hidden||document.hidden)return;const read=await api('/api/chat/read','POST',{through:data.unread?.latest||0});if(generation===chatGeneration)chatUnreadBadge(read.count);}
  }else{const unread=await api('/api/chat/unread');if(generation===chatGeneration)chatUnreadBadge(unread.count);}
 }catch(e){if(generation===chatGeneration)chatStatus(e.message);}finally{if(generation===chatGeneration){chatBusy=false;if(chatOwner)chatTimer=setTimeout(syncChat,!$('#chat-dialog').hidden?4000:15000);}}
}
window.addEventListener('chat-update',()=>syncChat());
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&chatOwner)syncChat();});
function openChatView(){chatGeneration++;chatBusy=false;clearTimeout(chatTimer);closeChatMenu();chatSyncSince=0;chatSelecting=false;chatSelected.clear();chatRenderKey='';chatSelection();chatHeader();chatStatus('');chatRows=[];chatOldest=null;return syncChat();}
$('#chat-open').onclick=()=>switchView('chat');
$('#chat-selection-cancel').onclick=()=>{chatSelecting=false;chatSelected.clear();renderChat();};
$('#chat-to-memory').onclick=async()=>{if(chatSavingMemory||!chatSelected.size)return;chatSavingMemory=true;chatSelection();const owner=chatOwner;try{const result=await api('/api/chat/memory','POST',{ids:[...chatSelected]});if(owner!==chatOwner)return;chatSelected.clear();chatSelecting=false;chatStatus(`已将 ${result.count} 条对话存入 ${result.day} 的回忆`);renderChat();await load();}catch(e){if(owner===chatOwner)chatStatus(e.message);}finally{chatSavingMemory=false;if(owner===chatOwner)chatSelection();}};
function leaveChatView(){chatGeneration++;chatBusy=false;clearTimeout(chatTimer);if(chatOwner)chatTimer=setTimeout(syncChat,15000);if(typeof voiceHoldTimer!=='undefined'){clearTimeout(voiceHoldTimer);voiceHold=null;voiceHeld=false;voiceHoldAction='cancel';$('#chat-hold-actions').hidden=true;if(nativeVoiceBuild>=10806)nativeVoiceCommand('cancel');}closeChatMenu();releaseRecording();for(const audio of $('#chat-messages').querySelectorAll('audio'))audio.pause();$('#chat-history-dialog').close();chatSelecting=false;chatSelected.clear();chatSelection();}
$('#chat-earlier').onclick=async()=>{const owner=chatOwner;try{const data=await api('/api/chat/messages?before='+chatOldest);if(owner!==chatOwner)return;chatRows=[...data.messages,...chatRows];chatMore=data.more;chatOldest=chatRows[0]?.id||null;renderChat();}catch(e){chatStatus(e.message);}};
const chatBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('附件读取失败'));reader.readAsDataURL(blob);});
async function sendChat(input){if(chatSending)return false;const owner=chatOwner;chatSending=true;chatPending={...input,id:'pending',sender:owner,name:'我',created:Date.now(),pending:true};renderChat();chatStatus('');try{const {preview,...payload}=input;const result=await api('/api/chat/messages','POST',payload);if(owner!==chatOwner)return false;chatPending=null;if(!chatRows.some(row=>row.id===result.id))chatRows.push({...input,id:result.id,sender:owner,name:'我',created:Date.now()});chatRenderKey='';renderChat();await syncChat();return true;}catch(e){if(owner===chatOwner)chatStatus(e.message);return false;}finally{chatPending=null;chatSending=false;if(chatOwner)renderChat();}}

$('#chat-form').onsubmit=async e=>{e.preventDefault();const input=e.target.elements.text;if(await sendChat({kind:'text',text:input.value}))input.value='';};
$('#chat-image-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('图片不能超过20MB');await sendChat({kind:'image',data:await chatBase64(file),preview:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);})});}catch(error){chatStatus(error.message);}finally{e.target.value='';}};
async function microphone(){if(!navigator.mediaDevices?.getUserMedia)throw Error('语音需要 HTTPS 或 localhost，以及支持麦克风的浏览器');try{try{return await navigator.mediaDevices.getUserMedia({audio:true});}catch(error){if(error.name!=='NotReadableError'&&error.name!=='AbortError')throw error;await new Promise(resolve=>setTimeout(resolve,350));return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}}catch(error){const messages={NotAllowedError:'麦克风访问被拒绝；若已授权，请检查手机的全局麦克风开关，并重新打开 App 后重试。',NotReadableError:'麦克风启动失败，请重新点击录制；若仍失败，请关闭并重新打开 App 后重试。',NotFoundError:'未找到可用的麦克风，请检查设备。',SecurityError:'当前页面无法访问麦克风，请检查 HTTPS 和系统 WebView。',AbortError:'录音启动被中断，请重新点击录制。'};throw Error(messages[error.name]||'麦克风启动失败（'+(error.name||'未知错误')+'），请重试。');}}
async function startWebVoice(){
 if(voiceStarting)return;
 if(voiceRecorder?.state==='recording'){voiceRecorder.stop();return;}
 const owner=chatOwner;releaseRecording();for(const audio of document.querySelectorAll('audio'))audio.pause();const generation=recordGeneration;voiceStarting=true;$('#chat-record').disabled=true;$('#chat-record').textContent='正在启动录音…';
 try{
  if(!window.MediaRecorder)throw Error('当前浏览器不支持录音');const stream=await microphone();if(owner!==chatOwner||generation!==recordGeneration||$('#chat-dialog').hidden){stream.getTracks().forEach(t=>t.stop());return;}voiceStream=stream;
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));voiceRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});const recorder=voiceRecorder;const parts=[];let size=0;
  voiceRecorder.ondataavailable=e=>{if(e.data.size){parts.push(e.data);size+=e.data.size;if(size>5*1024*1024&&voiceRecorder?.state==='recording')voiceRecorder.stop();}};
  recorder.onerror=()=>{if(generation!==recordGeneration)return;releaseRecording();chatStatus('录音被中断，请重新录制');};
  recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(owner!==chatOwner||generation!==recordGeneration||voiceRecorder!==recorder||$('#chat-dialog').hidden)return;clearInterval(voiceTimer);voiceStream=null;voiceBlob=new Blob(parts,{type:recorder.mimeType});voiceRecorder=null;$('#chat-record').textContent='重新录制';if(voiceBlob.size>5*1024*1024){releaseRecording();chatStatus('录音超过5MB，请重新录制');return;}voiceUrl=URL.createObjectURL(voiceBlob);$('#chat-record-preview').src=voiceUrl;$('#chat-record-preview').hidden=false;$('#chat-record-send').hidden=$('#chat-record-cancel').hidden=false;chatStatus('录音已完成，可试听后发送');completeHeldVoice();};
  voiceRecorder.start(1000);voiceSeconds=0;$('#chat-record').textContent='结束录音 · 0秒';voiceTimer=setInterval(()=>{voiceSeconds++;$('#chat-record').textContent='结束录音 · '+voiceSeconds+'秒';if(voiceSeconds>=120&&voiceRecorder?.state==='recording')voiceRecorder.stop();},1000);chatStatus('正在录音，最长2分钟');
 }catch(e){voiceHeld=false;$('#chat-hold-actions').hidden=true;releaseRecording();chatStatus(e.message);}
 finally{voiceStarting=false;$('#chat-record').disabled=Boolean(currentUser?.lifecycle?.readonly)||chatSending;}
}
$('#chat-record').onclick=startWebVoice;
$('#chat-record-cancel').onclick=releaseRecording;
$('#chat-record-send').onclick=async()=>{if(voiceBlob&&await sendChat({kind:'audio',data:await chatBase64(voiceBlob),duration:Math.max(1,voiceSeconds)}))releaseRecording();};
let chatHistoryRequest=0,chatHistoryCursor=null,chatHistoryQuery='',chatHistoryLoading=false,chatHistoryLastTime=null;
async function searchChatHistory(append=false){
 if(append&&chatHistoryLoading)return;
 const request=++chatHistoryRequest,owner=chatOwner,params=new URLSearchParams(append?chatHistoryQuery:new FormData($('#chat-history-form')));
 if(!append){chatHistoryQuery=params.toString();chatHistoryCursor=null;$('#chat-history-results').replaceChildren();}
 if(append&&chatHistoryCursor)params.set('before',chatHistoryCursor);
 chatHistoryLoading=true;$('#chat-history-more').disabled=true;$('#chat-history-status').textContent='正在查找…';
 try{const data=await api('/api/chat/history?'+params);if(request!==chatHistoryRequest||owner!==chatOwner||!$('#chat-history-dialog').open)return;
  const list=$('#chat-history-results');let previous=append?chatHistoryLastTime:null;for(const row of data.messages){appendChatTime(list,row.created,previous);previous=row.created;const card=el('article',undefined,'chat-history-entry');card.append(el('small',row.sender===chatOwner?'我':row.name));
   if(row.kind==='text')card.append(el('p',row.text,'chat-text'));
   if(row.kind==='image'){const img=el('img');img.src='/api/chat/media/'+row.id;img.alt='历史聊天图片';img.loading='lazy';const button=el('button',undefined,'chat-image');button.type='button';button.setAttribute('aria-label','放大历史聊天图片');button.append(img);button.onclick=()=>openPhoto(img);card.append(button);}
   if(row.kind==='audio'){card.append(voiceMessage('/api/chat/media/'+row.id,row.duration));speechTranscript(card,row);}chatMessageMenu(card,row);list.append(card);
  }
  chatHistoryLastTime=previous;chatHistoryCursor=data.messages.at(-1)?.id||null;$('#chat-history-more').hidden=!data.more;$('#chat-history-status').textContent=list.querySelectorAll('.chat-history-entry').length?'已显示 '+list.querySelectorAll('.chat-history-entry').length+' 条记录'+(data.more?'，可继续加载':''):'没有找到符合条件的记录';
 }catch(e){if(request===chatHistoryRequest&&owner===chatOwner){$('#chat-history-status').textContent=e.message;$('#chat-history-more').hidden=!append;}}finally{if(request===chatHistoryRequest){chatHistoryLoading=false;$('#chat-history-more').disabled=false;}}
}
$('#chat-history-open').onclick=async()=>{try{closeChatMenu();$('#chat-history-dialog').showModal();await searchChatHistory();}catch(e){chatStatus('历史记录打开失败：'+e.message);}};
$('#chat-history-close').onclick=()=>$('#chat-history-dialog').close();
$('#chat-history-form').onsubmit=e=>{e.preventDefault();searchChatHistory();};
$('#chat-history-reset').onclick=()=>{$('#chat-history-form').reset();searchChatHistory();};
$('#chat-history-more').onclick=()=>searchChatHistory(true);
$('#chat-history-dialog').addEventListener('click',e=>{if(!e.target.closest('#chat-context-menu'))closeChatMenu();});
$('#chat-history-dialog').addEventListener('close',()=>{closeChatMenu();$('#chat-dialog').append($('#chat-context-menu'));chatHistoryRequest++;chatHistoryLoading=false;for(const audio of $('#chat-history-results').querySelectorAll('audio'))audio.pause();$('#chat-history-results').replaceChildren();});
window.addEventListener('pagehide',releaseRecording);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voiceHoldAction='cancel';voiceHeld=false;clearTimeout(voiceHoldTimer);voiceHold=null;$('#chat-hold-actions').hidden=true;if(voiceStarting||voiceRecorder)releaseRecording();}});

function chatUnreadBadge(count){const badge=$('#chat-unread-badge');badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);$('#chat-open').setAttribute('aria-label',count?'聊天，'+count+'条未读消息':'聊天');}

const nativeVoiceBuild=Number(/OurDaysAndroid\/(\d+)/.exec(navigator.userAgent)?.[1]||0);
if(nativeVoiceBuild>=10804){$('#chat-native-record').hidden=false;$('#chat-native-record').textContent='录制语音';$('#chat-record').hidden=true;}
let nativeVoiceOwner=null,nativeVoiceGeneration=null,nativeVoiceActive=false,nativeVoiceTimer=null;
function resetNativeVoiceUI(){nativeVoiceActive=false;clearInterval(nativeVoiceTimer);nativeVoiceTimer=null;$('#chat-native-record').textContent=matchMedia('(pointer: coarse)').matches&&nativeVoiceBuild>=10806?'按住说话':'录制语音';$('#chat-native-record').href='/app/record-voice';$('#chat-native-cancel').hidden=true;}
$('#chat-native-cancel').onclick=()=>{resetNativeVoiceUI();chatStatus('已取消录音');};
$('#chat-native-record').onclick=event=>{if(nativeVoiceActive)return;if(!chatOwner||voiceStarting||voiceRecorder?.state==='recording'||currentUser?.lifecycle?.readonly||chatSending){event.preventDefault();return;}releaseRecording();for(const audio of document.querySelectorAll('audio'))audio.pause();nativeVoiceOwner=chatOwner;nativeVoiceGeneration=recordGeneration;};
window.addEventListener('native-voice-result',event=>{const input=event.detail;if(!input||chatOwner!==nativeVoiceOwner||nativeVoiceGeneration!==recordGeneration||$('#chat-dialog').hidden)return;if(input.recording){nativeVoiceActive=true;voiceSeconds=0;$('#chat-native-record').href='/app/finish-voice';$('#chat-native-record').textContent='结束录音 · 0秒';$('#chat-native-cancel').hidden=false;nativeVoiceTimer=setInterval(()=>{voiceSeconds++;$('#chat-native-record').textContent='结束录音 · '+voiceSeconds+'秒';},1000);chatStatus('正在录音，最长2分钟');if(voiceHoldReleased)finishHeldVoice();return;}resetNativeVoiceUI();if(input.cancelled){chatStatus('已取消录音');return;}if(input.error){voiceHeld=false;$('#chat-hold-actions').hidden=true;chatStatus(input.error);return;}try{const bytes=Uint8Array.from(atob(input.data),char=>char.charCodeAt(0));if(bytes.length>5*1024*1024)throw Error('录音超过5MB');voiceBlob=new Blob([bytes],{type:'audio/mp4'});voiceSeconds=input.duration;voiceUrl=URL.createObjectURL(voiceBlob);$('#chat-record-preview').src=voiceUrl;$('#chat-record-preview').hidden=false;$('#chat-record-send').hidden=$('#chat-record-cancel').hidden=false;chatStatus('录音已完成，可试听后发送');completeHeldVoice();}catch{chatStatus('无法读取 App 录音，请重试');}});

let voiceHold=null,voiceHoldReleased=false,voiceHoldAction='send',voiceHoldTimer=null,voiceHeld=false;
function nativeVoiceCommand(action){window.location.href='/app/'+action+'-voice';}
function finishHeldVoice(){if(voiceHoldAction==='cancel'){if(nativeVoiceBuild>=10806)nativeVoiceCommand('cancel');else releaseRecording();voiceHeld=false;chatStatus('已取消录音');return;}if(nativeVoiceBuild>=10806)nativeVoiceCommand('finish');else if(voiceRecorder?.state==='recording')voiceRecorder.stop();}
async function completeHeldVoice(){if(!voiceHeld)return;voiceHeld=false;const action=voiceHoldAction,owner=chatOwner,generation=recordGeneration,blob=voiceBlob,seconds=voiceSeconds;if(!blob)return;if(action==='cancel'){releaseRecording();return;}if(action==='text'){chatStatus('正在转文字…');try{const text=await transcribeVoiceDraft(blob);if(owner!==chatOwner||generation!==recordGeneration||$('#chat-dialog').hidden)return;$('#chat-form').elements.text.value=text;releaseRecording();chatStatus('');$('#chat-form').elements.text.focus();}catch(error){if(owner===chatOwner&&generation===recordGeneration)chatStatus(error.message+'，录音已保留，可试听或发送');}return;}if(await sendChat({kind:'audio',data:await chatBase64(blob),duration:Math.max(1,seconds)}))releaseRecording();}
function setupHoldVoice(button,native){button.textContent='按住说话';button.style.touchAction='none';button.oncontextmenu=event=>event.preventDefault();button.onclick=event=>event.preventDefault();
 button.addEventListener('pointerdown',event=>{if(event.button!==0||voiceHold||voiceStarting||chatSending||currentUser?.lifecycle?.readonly)return;event.preventDefault();voiceHold=event.pointerId;voiceHoldReleased=false;voiceHoldAction='send';for(const item of $('#chat-hold-actions').children)item.classList.toggle('active',false);button.setPointerCapture(event.pointerId);voiceHoldTimer=setTimeout(async()=>{voiceHeld=true;$('#chat-hold-actions').hidden=false;if(native){releaseRecording();nativeVoiceOwner=chatOwner;nativeVoiceGeneration=recordGeneration;for(const audio of document.querySelectorAll('audio'))audio.pause();nativeVoiceCommand('record');}else{await startWebVoice();if(voiceHoldReleased&&voiceRecorder)finishHeldVoice();}},250);});
 button.addEventListener('pointermove',event=>{if(voiceHold!==event.pointerId)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-action]');voiceHoldAction=target?.dataset.action||'send';for(const item of $('#chat-hold-actions').children)item.classList.toggle('active',item===target);});
 const end=event=>{if(voiceHold!==event.pointerId)return;clearTimeout(voiceHoldTimer);voiceHold=null;voiceHoldReleased=true;$('#chat-hold-actions').hidden=true;if(event.type==='pointercancel')voiceHoldAction='cancel';if(voiceHeld&&(nativeVoiceActive||voiceRecorder?.state==='recording'||voiceHoldAction==='cancel'))finishHeldVoice();};button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);
}
if(matchMedia('(pointer: coarse)').matches){if(nativeVoiceBuild>=10806)setupHoldVoice($('#chat-native-record'),true);else if(!nativeVoiceBuild)setupHoldVoice($('#chat-record'),false);}
