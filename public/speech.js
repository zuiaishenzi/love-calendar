const speechResults=new Map();let speechGeneration=0;
function closeSpeech(){speechGeneration++;speechResults.clear();}
function speechKey(id){return chatOwner+':'+id;}
function speechTranscript(card,row){
 const text=el('p',undefined,'voice-transcript');text.dataset.speechId=String(row.id);text.setAttribute('role','status');
 const result=speechResults.get(speechKey(row.id));text.textContent=result?.text||row.transcript||'';text.hidden=!text.textContent;text.classList.toggle('pending',result?.status==='pending');text.classList.toggle('error',result?.status==='error');card.append(text);
}
function paintSpeech(id,result){
 speechResults.set(speechKey(id),result);
 for(const text of document.querySelectorAll('[data-speech-id="'+id+'"]')){text.textContent=result.text;text.hidden=false;text.classList.toggle('pending',result.status==='pending');text.classList.toggle('error',result.status==='error');}
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
 const previous=speechResults.get(speechKey(row.id));if(previous?.status==='pending')return;
 if(row.transcript||previous?.status==='done'){paintSpeech(row.id,{status:'done',text:row.transcript||previous.text});return;}
 const owner=chatOwner,generation=speechGeneration,active=()=>owner===chatOwner&&generation===speechGeneration;
 paintSpeech(row.id,{status:'pending',text:'正在转文字…'});
 try{
  const response=await fetch('/api/chat/media/'+row.id,{credentials:'same-origin'});if(!response.ok)throw Error('语音消息不存在或已撤回');
  const data=await chatBase64(await speechAudio(await response.blob()));if(!active())return;
  const job=await api('/api/chat/transcriptions','POST',{data,messageId:row.id});
  if(!active())return;if(job.status==='done'){paintSpeech(row.id,job);return;}
  const deadline=Date.now()+5*60000;
  for(let i=0;Date.now()<deadline&&active();i++){
   if(i)await new Promise(resolve=>setTimeout(resolve,i<5?2000:4000));if(!active())return;
   const result=await api('/api/chat/transcriptions/'+job.id);if(!active())return;
   if(result.status==='done'){paintSpeech(row.id,result);return;}
  }
  if(active())throw Error('识别等待时间较长，请再次选择转文字重试');
 }catch(error){if(active())paintSpeech(row.id,{status:'error',text:error.message+'（右键或长按可重试）'});}
};
