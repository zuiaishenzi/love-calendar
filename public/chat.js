let chatOwner=null,chatTimer=null,chatBusy=false,chatMore=false,chatOldest=null,chatRows=[],chatSending=false,chatGeneration=0,chatRenderKey='';
let voiceStream=null,voiceRecorder=null,voiceBlob=null,voiceUrl=null,voiceTimer=null,voiceSeconds=0,recordGeneration=0;
let voiceCall=null,voicePeer=null,callStream=null,callIceCount=0,callCreating=false,callIceQueue=[],callConfig=null;
let chatMembers=[],chatSelecting=false,chatSelected=new Set(),chatSavingMemory=false;
function chatSelection(){const readonly=Boolean(currentUser?.lifecycle?.readonly);$('#chat-select').textContent=chatSelecting?'取消勾选':'勾选对话';$('#chat-select').disabled=readonly||chatSavingMemory;$('#chat-selection-count').hidden=$('#chat-to-memory').hidden=!chatSelecting;$('#chat-selection-count').textContent=`已选 ${chatSelected.size} 条`;$('#chat-to-memory').disabled=readonly||chatSavingMemory||!chatSelected.size;$('#chat-to-memory').textContent=chatSavingMemory?'正在收藏…':'存入今日回忆';}
function chatHeader(){const peer=chatMembers.find(m=>m.id!==chatOwner);$('#chat-title').textContent=peer?.name||'等待对方加入';if(peer)drawAvatar($('#chat-peer-avatar'),peer);else $('#chat-peer-avatar').replaceChildren();}
const chatStatus=text=>$('#chat-status').textContent=text;
function releaseRecording(){recordGeneration++;clearInterval(voiceTimer);if(voiceRecorder?.state==='recording'){voiceRecorder.onstop=null;voiceRecorder.stop();}voiceRecorder=null;voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;voiceBlob=null;if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=null;$('#chat-record-preview').pause();$('#chat-record-preview').removeAttribute('src');$('#chat-record-preview').hidden=true;$('#chat-record-send').hidden=$('#chat-record-cancel').hidden=true;$('#chat-record').textContent='录制语音';}
function releaseCall(){voicePeer?.close();voicePeer=null;callStream?.getTracks().forEach(t=>t.stop());callStream=null;callIceCount=0;callIceQueue=[];$('#chat-call-audio').srcObject=null;$('#chat-call-audio').hidden=true;$('#chat-call-mute').textContent='静音';}
function stopChat(){chatGeneration++;clearTimeout(chatTimer);chatTimer=null;chatBusy=false;callCreating=false;chatOwner=null;chatRows=[];chatRenderKey='';$('#chat-messages').replaceChildren();$('#chat-form').reset();releaseRecording();releaseCall();voiceCall=null;$('#chat-open').textContent='聊天';}
function startChat(){if(chatOwner!==currentUser?.id){stopChat();chatOwner=currentUser?.id;}syncChat();}
function renderChat(){
 chatHeader();chatSelection();
 $('#chat-earlier').hidden=!chatMore;
 const readonly=Boolean(currentUser?.lifecycle?.readonly);for(const field of $('#chat-form').elements)field.disabled=readonly||chatSending;
 $('#chat-record').disabled=readonly||chatSending||Boolean(voicePeer)||callCreating;$('#chat-image-input').disabled=readonly||chatSending;
 const key=chatOwner+':'+chatSelecting+':'+JSON.stringify(chatMembers)+':'+chatRows.map(r=>r.id).join(',');if(key===chatRenderKey)return;chatRenderKey=key;
 const list=$('#chat-messages'),bottom=list.scrollHeight-list.scrollTop-list.clientHeight<70;list.replaceChildren();
 for(const row of chatRows){const mine=row.sender===chatOwner,wrap=el('div',undefined,'chat-row'+(mine?' mine':'')),avatar=el('span',undefined,'avatar chat-avatar'),member=chatMembers.find(m=>m.id===row.sender);avatar.setAttribute('aria-label',mine?'我的头像':row.name+'的头像');if(member)drawAvatar(avatar,member);
  if(chatSelecting){const check=el('input');check.type='checkbox';check.checked=chatSelected.has(row.id);check.disabled=chatSavingMemory;check.setAttribute('aria-label','选择'+row.name+'的'+({text:'文字',image:'图片',audio:'语音'}[row.kind])+'消息');check.onchange=()=>{if(check.checked&&chatSelected.size>=50){check.checked=false;chatStatus('一次最多选择50条消息');return;}if(check.checked)chatSelected.add(row.id);else chatSelected.delete(row.id);wrap.classList.toggle('selected',check.checked);chatSelection();};wrap.append(check);wrap.classList.toggle('selected',check.checked);}
  const card=el('article',undefined,'chat-message'+(mine?' mine':''));card.append(el('small',(mine?'':row.name+' · ')+new Date(row.created).toLocaleString('zh-CN'),'chat-meta'));
  if(row.kind==='text')card.append(el('p',row.text,'chat-text'));
  if(row.kind==='image'){const img=el('img');img.src='/api/chat/media/'+row.id;img.alt='聊天图片';img.loading='lazy';const button=el('button',undefined,'chat-image');button.type='button';button.setAttribute('aria-label','放大聊天图片');button.append(img);button.onclick=()=>openPhoto(img);card.append(button);}
  if(row.kind==='audio'){const audio=el('audio');audio.src='/api/chat/media/'+row.id;audio.controls=true;audio.preload='none';audio.setAttribute('aria-label','播放语音消息');card.append(audio);}wrap.append(avatar,card);list.append(wrap);
 }
 if(!chatRows.length)list.append(el('p','想说的话，随时留给对方。','chat-empty'));
 if(bottom)list.scrollTop=list.scrollHeight;
}
function renderCall(){
 const incoming=voiceCall?.callee===chatOwner&&voiceCall.status==='ringing';
 $('#chat-call-accept').hidden=!incoming;$('#chat-call-end').hidden=!voiceCall&&!callCreating;$('#chat-call-start').hidden=Boolean(voiceCall)||callCreating;
 $('#chat-call-start').disabled=Boolean(currentUser?.lifecycle?.readonly)||currentUser?.members.length!==2||Boolean(voiceRecorder);
 $('#chat-call-end').disabled=callCreating;
 $('#chat-call-mute').hidden=!voicePeer;$('#chat-call-state').textContent=callCreating?'正在准备麦克风…':voiceCall?(voiceCall.status==='ringing'?(incoming?'对方邀请你语音通话':'正在呼叫对方…'):voicePeer?.connectionState==='connected'?'语音通话中':'正在连接语音…'):'';
 $('#chat-open').textContent=incoming?'聊天 · 语音来电':'聊天';
}
async function applyCall(next){
 if(voiceCall&&(!next||next.id!==voiceCall.id)){releaseCall();chatStatus('通话已结束');}
 voiceCall=next;renderCall();if(!voicePeer||!next||callCreating)return;
 if(next.answer&&!voicePeer.remoteDescription)await voicePeer.setRemoteDescription(next.answer);
 if(voicePeer.remoteDescription)while(callIceCount<next.ice.length)await voicePeer.addIceCandidate(next.ice[callIceCount++]);
}
async function syncChat(){
 clearTimeout(chatTimer);if(!chatOwner||chatBusy)return;chatBusy=true;const generation=chatGeneration;
 try{
  const call=await api('/api/chat/call');if(generation!==chatGeneration)return;if(!callCreating)await applyCall(call.call);
  if($('#chat-dialog').open){const data=await api('/api/chat/messages');if(generation!==chatGeneration)return;chatMembers=data.members;const byId=new Map(chatRows.map(r=>[r.id,r]));for(const row of data.messages)byId.set(row.id,row);chatRows=[...byId.values()].sort((a,b)=>a.id-b.id);if(chatOldest===null){chatMore=data.more;chatOldest=chatRows[0]?.id||null;}renderChat();}
 }catch(e){if(generation===chatGeneration)chatStatus(e.message);}finally{if(generation===chatGeneration){chatBusy=false;if(chatOwner)chatTimer=setTimeout(syncChat,voiceCall?1500:$('#chat-dialog').open?4000:15000);}}
}
window.addEventListener('chat-update',()=>{if(!$('#chat-dialog').open&&!voiceCall)$('#chat-open').textContent='聊天 · 新动态';syncChat();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&chatOwner)syncChat();});
$('#chat-open').onclick=()=>{chatSelecting=false;chatSelected.clear();chatMembers=[];chatRenderKey='';chatSelection();chatHeader();$('#chat-dialog').showModal();chatStatus('');chatRows=[];chatOldest=null;syncChat();};
$('#chat-select').onclick=()=>{chatSelecting=!chatSelecting;chatSelected.clear();renderChat();};
$('#chat-to-memory').onclick=async()=>{if(chatSavingMemory||!chatSelected.size)return;chatSavingMemory=true;chatSelection();const owner=chatOwner;try{const result=await api('/api/chat/memory','POST',{ids:[...chatSelected]});if(owner!==chatOwner)return;chatSelected.clear();chatSelecting=false;chatStatus(`已将 ${result.count} 条对话存入 ${result.day} 的回忆`);renderChat();await load();}catch(e){if(owner===chatOwner)chatStatus(e.message);}finally{chatSavingMemory=false;if(owner===chatOwner)chatSelection();}};
$('#chat-close').onclick=()=>$('#chat-dialog').close();
$('#chat-dialog').addEventListener('close',()=>{releaseRecording();for(const audio of $('#chat-messages').querySelectorAll('audio'))audio.pause();});
$('#chat-earlier').onclick=async()=>{const owner=chatOwner;try{const data=await api('/api/chat/messages?before='+chatOldest);if(owner!==chatOwner)return;chatRows=[...data.messages,...chatRows];chatMore=data.more;chatOldest=chatRows[0]?.id||null;renderChat();}catch(e){chatStatus(e.message);}};
const chatBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('附件读取失败'));reader.readAsDataURL(blob);});
async function sendChat(input){if(chatSending)return false;chatSending=true;renderChat();chatStatus('正在发送…');const owner=chatOwner;try{await api('/api/chat/messages','POST',input);if(owner!==chatOwner)return false;chatStatus('已发送');await syncChat();return true;}catch(e){if(owner===chatOwner)chatStatus(e.message);return false;}finally{chatSending=false;if(chatOwner)renderChat();}}
$('#chat-form').onsubmit=async e=>{e.preventDefault();const input=e.target.elements.text;if(await sendChat({kind:'text',text:input.value}))input.value='';};
$('#chat-image-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('图片不能超过5MB');await sendChat({kind:'image',data:await chatBase64(file)});}catch(error){chatStatus(error.message);}finally{e.target.value='';}};
async function microphone(){if(!navigator.mediaDevices?.getUserMedia)throw Error('语音需要 HTTPS 或 localhost，以及支持麦克风的浏览器');try{return await navigator.mediaDevices.getUserMedia({audio:true});}catch{throw Error('无法使用麦克风，请检查权限和设备。');}}
$('#chat-record').onclick=async()=>{
 if(voiceRecorder?.state==='recording'){voiceRecorder.stop();return;}
 if(voicePeer||callCreating)return;const owner=chatOwner;releaseRecording();const generation=recordGeneration;
 try{
  if(!window.MediaRecorder)throw Error('当前浏览器不支持录音');const stream=await microphone();if(owner!==chatOwner||generation!==recordGeneration||!$('#chat-dialog').open){stream.getTracks().forEach(t=>t.stop());return;}voiceStream=stream;
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));voiceRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});const parts=[];let size=0;
  voiceRecorder.ondataavailable=e=>{if(e.data.size){parts.push(e.data);size+=e.data.size;if(size>5*1024*1024&&voiceRecorder?.state==='recording')voiceRecorder.stop();}};
  voiceRecorder.onstop=()=>{clearInterval(voiceTimer);voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;if(owner!==chatOwner)return;voiceBlob=new Blob(parts,{type:voiceRecorder.mimeType});voiceRecorder=null;$('#chat-record').textContent='重新录制';if(voiceBlob.size>5*1024*1024){releaseRecording();chatStatus('录音超过5MB，请重新录制');return;}voiceUrl=URL.createObjectURL(voiceBlob);$('#chat-record-preview').src=voiceUrl;$('#chat-record-preview').hidden=false;$('#chat-record-send').hidden=$('#chat-record-cancel').hidden=false;chatStatus('录音已完成，可试听后发送');};
  voiceRecorder.start(1000);voiceSeconds=0;$('#chat-record').textContent='结束录音 · 0秒';voiceTimer=setInterval(()=>{voiceSeconds++;$('#chat-record').textContent='结束录音 · '+voiceSeconds+'秒';if(voiceSeconds>=120&&voiceRecorder?.state==='recording')voiceRecorder.stop();},1000);chatStatus('正在录音，最长2分钟');
 }catch(e){releaseRecording();chatStatus(e.message);}
};
$('#chat-record-cancel').onclick=releaseRecording;
$('#chat-record-send').onclick=async()=>{if(voiceBlob&&await sendChat({kind:'audio',data:await chatBase64(voiceBlob)}))releaseRecording();};
async function postCall(action,extra={}){return api('/api/chat/call','POST',{action,id:voiceCall?.id,...extra});}
async function createVoicePeer(){
 releaseRecording();const owner=chatOwner,generation=chatGeneration,stream=await microphone();
 try{if(owner!==chatOwner||generation!==chatGeneration)throw Error('账号已退出');callConfig=await api('/api/chat/config');if(owner!==chatOwner||generation!==chatGeneration)throw Error('账号已退出');voicePeer=new RTCPeerConnection(callConfig);callStream=stream;}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}const peer=voicePeer;
 for(const track of stream.getTracks())peer.addTrack(track,stream);
 peer.ontrack=e=>{$('#chat-call-audio').srcObject=e.streams[0]||new MediaStream([e.track]);$('#chat-call-audio').hidden=false;$('#chat-call-audio').play().catch(()=>chatStatus('点击语音播放器开始播放通话声音'));};
 peer.onicecandidate=e=>{if(!e.candidate||peer!==voicePeer)return;const candidate=e.candidate.toJSON();if(!voiceCall||callCreating)callIceQueue.push(candidate);else postCall('ice',{candidate}).catch(error=>chatStatus(error.message));};
 peer.onconnectionstatechange=()=>{renderCall();if(peer.connectionState==='failed'){chatStatus('语音连接失败，请检查网络或服务器 TURN 配置');endCall();}};return peer;
}
async function flushCallIce(){for(const candidate of callIceQueue.splice(0))await postCall('ice',{candidate});}
$('#chat-call-start').onclick=async()=>{
 if(callCreating||voiceCall)return;const generation=chatGeneration;callCreating=true;renderCall();
 try{const peer=await createVoicePeer(),offer=await peer.createOffer();await peer.setLocalDescription(offer);if(generation!==chatGeneration)return;const response=await postCall('offer',{sdp:offer.sdp});if(generation!==chatGeneration)return;voiceCall=response.call;callCreating=false;await flushCallIce();chatStatus('等待对方接听');syncChat();}
 catch(e){if(generation===chatGeneration){releaseCall();voiceCall=null;chatStatus(e.message);}}finally{if(generation===chatGeneration){callCreating=false;renderCall();}}
};
$('#chat-call-accept').onclick=async()=>{
 if(callCreating||!voiceCall)return;const generation=chatGeneration;callCreating=true;renderCall();const call=voiceCall;
 try{const peer=await createVoicePeer();await peer.setRemoteDescription(call.offer);const answer=await peer.createAnswer();await peer.setLocalDescription(answer);if(generation!==chatGeneration)return;const result=await postCall('answer',{sdp:answer.sdp});if(generation!==chatGeneration)return;voiceCall=result.call;callCreating=false;await flushCallIce();await applyCall(voiceCall);syncChat();}
 catch(e){if(generation===chatGeneration){releaseCall();chatStatus(e.message);}}finally{if(generation===chatGeneration){callCreating=false;renderCall();}}
};
async function endCall(){const id=voiceCall?.id;releaseCall();voiceCall=null;renderCall();if(id)try{await api('/api/chat/call','POST',{action:'hangup',id});}catch{}chatStatus('通话已结束');}
$('#chat-call-end').onclick=endCall;
$('#chat-call-mute').onclick=()=>{const track=callStream?.getAudioTracks()[0];if(track){track.enabled=!track.enabled;$('#chat-call-mute').textContent=track.enabled?'静音':'取消静音';}};
window.addEventListener('pagehide',()=>{if(voiceCall)fetch('/api/chat/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'hangup',id:voiceCall.id}),keepalive:true}).catch(()=>{});releaseRecording();releaseCall();});
