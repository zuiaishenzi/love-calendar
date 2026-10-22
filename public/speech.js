const speechResults=new Map();let speechGeneration=0;
function closeSpeech(){speechGeneration++;speechResults.clear();}
function speechKey(id){return chatOwner+':'+id;}
function speechTranscript(card,row){
 const text=el('p',undefined,'voice-transcript');text.dataset.speechId=String(row.id);text.setAttribute('role','status');
 const result=row.transcript?{status:'done',text:row.transcript}:speechResults.get(speechKey(row.id));text.textContent=result?.text||'';text.dataset.speechHidden=String(Boolean(row.transcript_hidden));text.hidden=!text.textContent||Boolean(row.transcript_hidden);text.classList.toggle('pending',result?.status==='pending');text.classList.toggle('error',result?.status==='error');card.append(text);
}
function paintSpeech(id,result){
 speechResults.set(speechKey(id),result);
 for(const text of document.querySelectorAll('[data-speech-id="'+id+'"]')){text.textContent=result.text;text.hidden=text.dataset.speechHidden==='true';text.classList.toggle('pending',result.status==='pending');text.classList.toggle('error',result.status==='error');}
}
function configureSpeechMenu(row){
 const button=$('#chat-context-transcribe'),result=speechResults.get(speechKey(row.id)),done=Boolean(row.transcript||result?.status==='done'),pending=!done&&result?.status==='pending';
 button.textContent=done?(row.transcript_hidden?'显示语音转文字':'收回语音转文字'):pending?'正在转文字…':'转文字';button.disabled=pending||Boolean(currentUser?.lifecycle?.readonly);button.title=done?'仅更改自己的显示，保留双方共用的识别结果':'优先获取已有结果，没有结果时才发送至腾讯云识别';
}
async function setSpeechVisibility(row,hidden,active){
 const result=await api('/api/chat/transcriptions/message/'+row.id+'/visibility','POST',{hidden});if(!active())return;
 row.transcript_hidden=Number(result.hidden);for(const item of chatRows)if(item.id===row.id)item.transcript_hidden=Number(result.hidden);
 for(const text of document.querySelectorAll('[data-speech-id="'+row.id+'"]')){text.dataset.speechHidden=String(result.hidden);text.hidden=result.hidden||!text.textContent;}
}
function speechWav(samples){
 const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);
 const word=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 word(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,value<0?Math.round(value*32768):Math.round(value*32767),true);}
 return new Blob([bytes],{type:'audio/wav'});
}
async function speechAudio(blob){
 if(blob.size>5*1024*1024)throw Error('语音不能超过5MB');
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio||!window.OfflineAudioContext)throw Error('当前浏览器不支持语音转换，请更新浏览器或系统 WebView');
 const context=new Audio();let decoded;try{decoded=await context.decodeAudioData(await blob.arrayBuffer());}catch{throw Error('无法读取此语音，请检查音频格式或更新浏览器');}finally{await context.close();}
 if(!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>120)throw Error('语音转文字支持2分钟以内的录音');
 const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const rendered=await offline.startRendering();return speechWav(rendered.getChannelData(0));
}
$('#chat-context-transcribe').onclick=async()=>{
 const row=chatContextRow;if(!row||row.kind!=='audio'||row.retracted_at)return;closeChatMenu();
 const owner=chatOwner,generation=speechGeneration,active=()=>owner===chatOwner&&generation===speechGeneration;
 const previous=speechResults.get(speechKey(row.id));if(previous?.status==='pending'&&!row.transcript)return;
 if(row.transcript||previous?.status==='done'){try{await setSpeechVisibility(row,!row.transcript_hidden,active);}catch(error){if(active())chatStatus(error.message);}return;}
 paintSpeech(row.id,{status:'pending',text:'正在转文字…'});
 try{
  let job=await api('/api/chat/transcriptions/message/'+row.id);if(!active())return;
  if(job.status==='missing'){
   const response=await fetch('/api/chat/media/'+row.id,{credentials:'same-origin'});if(!response.ok)throw Error('语音消息不存在或已撤回');
   const data=await chatBase64(await speechAudio(await response.blob()));if(!active())return;
   job=await api('/api/chat/transcriptions','POST',{data,messageId:row.id});
  }
  if(!active())return;if(job.status==='done'){row.transcript=job.text;paintSpeech(row.id,job);if(job.hidden)await setSpeechVisibility(row,false,active);return;}
  const deadline=Date.now()+5*60000;
  for(let i=0;Date.now()<deadline&&active();i++){
   if(i)await new Promise(resolve=>setTimeout(resolve,i<5?2000:4000));if(!active())return;
   const result=await api('/api/chat/transcriptions/'+job.id);if(!active())return;
   if(result.status==='done'){row.transcript=result.text;paintSpeech(row.id,result);return;}
  }
  if(active())throw Error('识别等待时间较长，请再次选择转文字重试');
 }catch(error){if(active())paintSpeech(row.id,{status:'error',text:error.message+'（右键或长按可重试）'});}
};

async function transcribeVoiceDraft(blob){const data=await chatBase64(await speechAudio(blob));const job=await api('/api/chat/transcriptions','POST',{data});if(job.status==='done')return job.text;const deadline=Date.now()+5*60000;while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2000));const result=await api('/api/chat/transcriptions/'+job.id);if(result.status==='done')return result.text;}throw Error('识别超时，请重试');}
