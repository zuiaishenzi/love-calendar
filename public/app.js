const $=s=>document.querySelector(s);
function appendChatTime(list,created,previous){
 const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
 if(previous!=null&&Math.abs(created-previous)<5*60000&&day(created)===day(previous))return;
 list.append(el('div',new Date(created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}),'chat-time-divider'));
}
const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
let selected=localDay()<'2000-01-01'?'2000-01-01':localDay(), month=selected.slice(0,7), memories=[], editing=null, kept=[],keptAttachments=[], loadVersion=0;
let activeVoiceAudio=null;
const voiceDurations=new Map();
let voiceDurationQueue=Promise.resolve();
function resolveVoiceDuration(url){
 if(voiceDurations.has(url))return voiceDurations.get(url);
 const pending=voiceDurationQueue.catch(()=>{}).then(async()=>{const response=await fetch(url);if(!response.ok)throw Error('语音读取失败');const bytes=await response.arrayBuffer(),Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('浏览器无法读取语音时长');const context=new Context();try{const decoded=await context.decodeAudioData(bytes);if(!Number.isFinite(decoded.duration)||decoded.duration<=0)throw Error('语音时长无效');return decoded.duration;}finally{await context.close();}});
 voiceDurationQueue=pending;voiceDurations.set(url,pending);pending.catch(()=>voiceDurations.delete(url));return pending;
}
function voiceMessage(url,duration=null){
 const known=Number.isFinite(duration)&&duration>0,box=el('span',undefined,'voice-message'),button=el('button',undefined,'voice-play'),icon=el('span',undefined,'voice-icon'),wave=el('span',undefined,'voice-wave'),time=el('span',known?Math.max(1,Math.ceil(duration))+'″':'…″','voice-duration'),audio=el('audio');
 button.type='button';button.setAttribute('aria-label','播放语音消息');button.setAttribute('aria-pressed','false');icon.setAttribute('aria-hidden','true');wave.setAttribute('aria-hidden','true');for(let i=0;i<7;i++)wave.append(el('i'));button.append(icon,wave,time);audio.src=url;audio.preload='metadata';audio.hidden=true;
 const update=playing=>{button.classList.toggle('playing',playing);button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',playing?'暂停语音消息':'播放语音消息');};
 const readDuration=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)time.textContent=Math.max(1,Math.ceil(audio.duration))+'″';};audio.addEventListener('loadedmetadata',readDuration);audio.addEventListener('durationchange',readDuration);audio.addEventListener('play',()=>update(true));audio.addEventListener('pause',()=>update(false));audio.addEventListener('ended',()=>{update(false);if(activeVoiceAudio===audio)activeVoiceAudio=null;});
 if(!known)resolveVoiceDuration(url).then(seconds=>{time.textContent=Math.max(1,Math.ceil(seconds))+'″';}).catch(()=>{if(time.textContent==='…″'){time.textContent='—″';time.title='无法读取时长，可下载后收听';}});
 button.onclick=async()=>{if(!audio.paused){audio.pause();return;}if(activeVoiceAudio&&activeVoiceAudio!==audio)activeVoiceAudio.pause();activeVoiceAudio=audio;try{await audio.play();}catch{update(false);if(activeVoiceAudio===audio)activeVoiceAudio=null;$('#status').textContent='语音无法播放，请重试或下载后收听';if(typeof chatStatus==='function')chatStatus('语音无法播放，请重试或下载后收听');}};
 box.append(button,audio);return box;
}
function memoryAttachment(item){const card=el('div',undefined,'memory-attachment'),player=el(item.kind==='video'?'video':'audio'),name=el('p',item.name),download=el('a','下载附件');player.src='/api/memory-attachments/'+item.id;player.controls=true;player.preload='metadata';if(item.kind==='video')player.playsInline=true;download.href=player.src+'?download=1';download.download=item.name;card.append(name,player,download);return card;}
function attachmentPreviews(){const list=$('#attachment-preview');list.replaceChildren();for(const item of keptAttachments){const card=memoryAttachment(item),remove=el('button','移除');remove.type='button';remove.onclick=()=>{keptAttachments=keptAttachments.filter(a=>a.id!==item.id);attachmentPreviews();};card.append(remove);list.append(card);}}
async function api(url,method='GET',data) {const r=await fetch(url,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const json=await r.json();if(!r.ok){if(r.status===401 && url!='/api/login') showLogin();throw new Error(json.error);}return json;}
let view='calendar', timelineVersion=0;
function showLogin(){if(typeof stopChat==='function')stopChat();stopRealtime();++loadVersion;++timelineVersion;$('#app').hidden=true;$('#login').hidden=false;document.querySelectorAll('dialog').forEach(d=>d.close());currentUser=null;annualReminders=[];calendarInfo={days:[]};memories=[];$('#stories').replaceChildren();$('#timeline-list').replaceChildren();}
async function enter(user){currentUser=user;if(typeof refreshSettings==='function')refreshSettings();startRealtime();if(typeof startChat==='function')startChat();$('#username').textContent=user.name;$('#login').hidden=true;$('#app').hidden=false;await load();}
async function load(){if(view==='timeline')return loadTimeline();const version=++loadVersion;$('#status').textContent='正在翻开回忆…';try{const [rows,info,reminders]=await Promise.all([api('/api/memories?month='+month),api('/api/calendar?month='+month),api('/api/reminders?month='+month)]);if(version!==loadVersion)return;memories=rows;calendarInfo=info;annualReminders=reminders;$('#holiday-note').textContent=info.holiday_note;render();$('#status').textContent='';}catch(e){if(version===loadVersion)$('#status').textContent=e.message;}}
function switchView(next){view=next;++loadVersion;++timelineVersion;$('.workspace').hidden=view!=='calendar';$('#memoir').hidden=view!=='timeline';$('#calendar-view').setAttribute('aria-pressed',String(view==='calendar'));$('#memoir-view').setAttribute('aria-pressed',String(view==='timeline'));return load();}
async function loadTimeline(){
  const version=++timelineVersion, list=$('#timeline-list');
  list.replaceChildren();$('#timeline-summary').textContent='正在整理你们的回忆…';$('#status').textContent='';$('#timeline-retry').hidden=true;$('#memoir').setAttribute('aria-busy','true');
  try {
    const rows=await api('/api/timeline');
    if(version!==timelineVersion||view!=='timeline')return;
    $('#timeline-summary').textContent=rows.length?`${rows.length} 段回忆 · ${new Set(rows.map(r=>r.day)).size} 个值得记住的日子 · 从最初到现在`:'这里会珍藏你们一起走过的日子。';
    if(!rows.length){const empty=el('div',undefined,'memoir-empty');empty.append(el('h3','你们的故事，从第一条回忆开始'),el('p','在日历上选择一个特别的日子，写下文字或放上照片。'));const add=el('button','＋ 写下第一条回忆','primary');add.onclick=()=>openEditor();empty.append(add);list.append(empty);return;}
    let year='',lastDay='',dayCards;
    for(const r of rows){
      if(r.day.slice(0,4)!==year){year=r.day.slice(0,4);list.append(el('h3',year+' 年','timeline-year'));}
      if(r.day!==lastDay){lastDay=r.day;const item=el('article',undefined,'timeline-item'),date=el('time',r.day.replaceAll('-','.'),'timeline-date');date.dateTime=r.day;dayCards=el('div',undefined,'timeline-day-cards');item.append(date,dayCards);list.append(item);}
      const card=el('div',undefined,'timeline-card');card.append(el('h3',r.title));
      card.append(conversation(r));
      const actions=el('div',undefined,'timeline-actions');
      const jump=el('button','查看这一天 ↗');jump.onclick=async()=>{selected=r.day;month=r.day.slice(0,7);await switchView('calendar');$('#selected-label').scrollIntoView({block:'center'});};
      const edit=el('button','写下我的视角');edit.onclick=()=>openEditor(r);actions.append(edit,jump);card.append(actions);dayCards.append(card);
    }
  }catch(e){if(version===timelineVersion){$('#timeline-summary').textContent='回忆暂时没有加载成功';$('#status').textContent=e.message;$('#timeline-retry').hidden=false;}}
  finally{if(version===timelineVersion)$('#memoir').setAttribute('aria-busy','false');}
}
$('#calendar-view').onclick=()=>switchView('calendar');
$('#memoir-view').onclick=()=>switchView('timeline');
$('#timeline-retry').onclick=()=>loadTimeline();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function render(){const [y,m]=month.split('-').map(Number);$('#year-label').textContent=y+' 年';$('#month-label').textContent=['一','二','三','四','五','六','七','八','九','十','十一','十二'][m-1]+'月';$('#jump-year').value=String(y);$('#jump-month').value=String(m).padStart(2,'0');$('#prev').disabled=month==='2000-01';$('#next').disabled=month==='9999-12';const grid=$('#grid');grid.replaceChildren();const offset=(new Date(y,m-1,1).getDay()+6)%7, count=new Date(y,m,0).getDate();for(let i=0;i<offset;i++)grid.append(el('div',undefined,'blank'));for(let day=1;day<=count;day++){const key=month+'-'+String(day).padStart(2,'0'), rows=memories.filter(r=>r.day===key);const b=el('button',undefined,'day'+(selected===key?' selected':'')+(key===localDay()?' current':''));b.setAttribute('aria-label',key+(rows.length?`，${rows.length}条回忆`:''));b.setAttribute('aria-pressed',String(selected===key));b.append(el('span',String(day)));const detail=calendarInfo.days.find(d=>d.day===key);if(detail){const label=detail.term||detail.festivals[0]||detail.lunar_short;b.append(el('small',label,'lunar-label'+(detail.term||detail.festivals.length?' festival':'')));b.title=['农历'+detail.lunar,detail.term,...detail.festivals].filter(Boolean).join(' · ');if(detail.holiday)b.append(el('em',detail.holiday.work?'班':'休','holiday-badge'+(detail.holiday.work?' work':'')));}if(annualReminders.some(r=>reminderMatches(r,key)))b.append(el('small','提醒','reminder-mark'));if(rows.length){b.classList.add('has-memory');b.append(el('small',rows[0].title,'memory-title'));b.append(el('i','●'));}b.onclick=()=>{selected=key;render();openMobileDay();};grid.append(b);}for(let i=0;i<(7-(offset+count)%7)%7;i++)grid.append(el('div',undefined,'blank'));$('#selected-label').textContent=`${m}月${Number(selected.slice(8))}日`;const stories=$('#stories');stories.replaceChildren();const rows=memories.filter(r=>r.day===selected);if(!rows.length){const empty=el('div',undefined,'empty');empty.append(el('div','♡','heart'),el('h3','故事，等你们来写'),el('p','把今天的小小幸福，留给以后的你们。'));stories.append(empty);}for(const r of rows){const card=el('article',undefined,'story');card.append(el('h3',r.title),conversation(r));const actions=el('div',undefined,'story-actions');actions.append(el('small',r.author_name+' 记录'));const edit=el('button','写下我的视角'),del=el('button','删除');edit.onclick=()=>openEditor(r);del.onclick=()=>openDeleteMemory(r);actions.append(edit,del);card.append(actions);stories.append(card);}renderDayExtras();}
function conversation(r){
 const box=el('div',undefined,'conversation');
 for(const p of r.perspectives||[]){
  if(r.chat_messages?.length&&!p.body&&!p.photos.length&&!p.attachments?.length)continue;
  const mine=p.author===currentUser.id,bubble=el('section',undefined,'perspective'+(mine?' mine':''));
  bubble.append(el('div',p.author_name+(mine?' · 我的视角':' · 对方的视角'),'perspective-name'));
  if(p.body)bubble.append(el('p',p.body,'story-text'));
  if(p.photos.length){const gallery=el('div',undefined,'perspective-photos');for(const id of p.photos){const a=el('button',undefined,'photo-zoom');a.type='button';a.setAttribute('aria-label','放大照片');const img=el('img');img.src='/api/photos/'+id+'?size=thumb';img.dataset.original='/api/photos/'+id;img.decoding='async';a.onclick=()=>openPhoto(img);img.alt=p.author_name+'记录的照片';img.loading='lazy';a.append(img);gallery.append(a);}bubble.append(gallery);}
  for(const item of p.attachments||[])bubble.append(memoryAttachment(item));
  if(!p.body&&!p.photos.length&&!p.attachments?.length)bubble.append(el('p','还没有写下文字或附件。','hint'));
  box.append(bubble);
 }
 if(r.chat_messages?.length){const transcript=el('section',undefined,'memory-chat-transcript');transcript.append(el('h4','收藏的对话'));let previous=null;for(const row of r.chat_messages){appendChatTime(transcript,row.created,previous);previous=row.created;const entry=el('article',undefined,'memory-chat-entry');entry.append(el('small',row.name));if(row.kind==='text')entry.append(el('p',row.text,'story-text'));else if(row.kind==='image'){const img=el('img');img.src='/api/memory-chat-media/'+row.id;img.alt='收藏的聊天图片';img.loading='lazy';const button=el('button',undefined,'photo-zoom');button.type='button';button.setAttribute('aria-label','放大收藏的聊天图片');button.append(img);button.onclick=()=>openPhoto(img);entry.append(button);}else{const audio=el('audio');audio.controls=true;audio.preload='none';audio.src='/api/memory-chat-media/'+row.id;entry.append(audio);}transcript.append(entry);}box.append(transcript);}
 if(!r.chat_messages?.length&&(r.perspectives||[]).length<2)box.append(el('p','同一段回忆，也期待另一种视角。','conversation-invite'));
 if(r.replies?.length){const replies=el('section',undefined,'memory-replies');replies.append(el('h4','后来的回应'));for(const reply of r.replies)replies.append(replyBubble(reply));box.append(replies);}
 const respond=el('button','继续回应'+(r.replies?.length?' · '+r.replies.length:''),'memory-reply-open');respond.type='button';respond.onclick=()=>openMemoryReplies(r);box.append(respond);
 return box;
}
function previews(){const box=$('#photo-preview');box.replaceChildren();kept.forEach(id=>{const wrap=el('div'),img=el('img');img.src='/api/photos/'+id+'?size=thumb';img.dataset.original='/api/photos/'+id;img.decoding='async';img.alt='已保存的照片';const remove=el('button','移除');remove.type='button';remove.onclick=()=>{kept=kept.filter(x=>x!==id);previews();};const zoom=el('button',undefined,'photo-zoom');zoom.type='button';zoom.setAttribute('aria-label','放大已保存的照片');zoom.onclick=()=>openPhoto(img);zoom.append(img);wrap.append(zoom,remove);box.append(wrap);});}
function openEditor(r=null){if(currentUser?.lifecycle?.readonly){$('#status').textContent='账本正在注销中，仅可查看或下载。';return;}editing=r;const own=r?.perspectives?.find(p=>p.author===currentUser.id);kept=own?[...own.photos]:[];keptAttachments=own?[...(own.attachments||[])]:[];const f=$('#memory-form');f.reset();f.elements.day.value=r?.day||selected;f.elements.title.value=r?.title||'';f.elements.body.value=own?.body||'';$('#editor-conversation').replaceChildren();if(r)$('#editor-conversation').append(conversation(r));$('#editor-title').textContent=r?'我们的回忆 · 我的视角':'写下回忆';$('#editor-error').textContent='';previews();attachmentPreviews();$('#editor').showModal();announceEditing();}
$('#close').onclick=()=>$('#editor').close();$('#add-day').onclick=()=>openEditor();
$('#editor').addEventListener('close',()=>{for(const player of $('#editor').querySelectorAll('audio,video'))player.pause();});
function move(delta){const [y,m]=month.split('-').map(Number);const date=new Date(y,m-1+delta,1);if(date.getFullYear()<2000||date.getFullYear()>9999)return;month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;selected=month+'-01';load();}
$('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1);$('#month-jump').onsubmit=e=>{e.preventDefault();const year=$('#jump-year').value.trim(),part=$('#jump-month').value;if(!/^[0-9]{4}$/.test(year)||Number(year)<2000||Number(year)>9999){$('#status').textContent='请输入2000至9999之间的年份';return;}month=year+'-'+part;selected=month+'-01';load();};$('#today').onclick=()=>{selected=localDay()<'2000-01-01'?'2000-01-01':localDay();month=selected.slice(0,7);load();};
$('#login-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;$('#login-error').textContent='';try{await enter(await api('/api/login','POST',{name:f.elements.name.value,password:f.elements.password.value}));f.reset();}catch(error){$('#login-error').textContent=error.message;}finally{b.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('/api/logout','POST',{});showLogin();}catch(e){$('#status').textContent=e.message;}};
$('#memory-form').onsubmit=async e=>{e.preventDefault();const f=e.target;$('#save').disabled=true;$('#editor-error').textContent='';try{const files=[...f.elements.photos.files];if(files.length+kept.length>6)throw new Error('每条回忆最多6张照片');if(files.some(f=>f.size>20*1024*1024))throw new Error('每张照片不能超过20MB');if(files.reduce((s,f)=>s+f.size,0)>120*1024*1024)throw new Error('本次上传照片总大小不能超过120MB');const mediaFiles=[...f.elements.attachments.files];if(mediaFiles.length+keptAttachments.length>6)throw new Error('最多6个视频或语音附件');if(mediaFiles.reduce((sum,file)=>sum+file.size,0)>50*1024*1024)throw new Error('视频和语音总大小不能超过50MB');if(mediaFiles.some(file=>file.size>(/\.(mp4|mov|webm)$/i.test(file.name)&&!file.type.startsWith('audio/')?30:20)*1024*1024))throw new Error('视频不能超过30MB，语音不能超过20MB');const attachments=await Promise.all(mediaFiles.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,data:reader.result.split(',')[1]});reader.onerror=()=>reject(new Error('附件读取失败'));reader.readAsDataURL(file);})));const photos=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({data:reader.result.split(',')[1]});reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);})));await api('/api/memories','POST',{id:editing?.id,day:f.elements.day.value,title:f.elements.title.value,body:f.elements.body.value,photos,keepPhotos:kept,attachments,keepAttachments:keptAttachments.map(item=>item.id)});selected=f.elements.day.value;month=selected.slice(0,7);$('#editor').close();await load();}catch(error){$('#editor-error').textContent=error.message;}finally{$('#save').disabled=false;}};


function openPhoto(image){const viewer=$('#photo-viewer'),large=$('#photo-viewer-image');large.src=image.dataset.original||image.src;large.alt=image.alt;viewer.showModal();}
$('#photo-viewer').onclick=()=>$('#photo-viewer').close();
$('#photo-viewer').addEventListener('close',()=>{$('#photo-viewer-image').removeAttribute('src');});

let deletingMemory=null;
function openDeleteMemory(memory){if(currentUser?.lifecycle?.readonly)return;deletingMemory=memory;$('#delete-memory-name').textContent='「'+memory.title+'」';$('#delete-memory-error').textContent='';$('#delete-memory-dialog').showModal();$('#delete-memory-cancel').focus();}
$('#delete-memory-cancel').onclick=()=>$('#delete-memory-dialog').close();
$('#delete-memory-dialog').addEventListener('close',()=>{deletingMemory=null;});
$('#delete-memory-confirm').onclick=async()=>{
 const memory=deletingMemory;if(!memory)return;
 const button=$('#delete-memory-confirm');button.disabled=true;
 try{await api('/api/memories/'+memory.id,'DELETE',{});$('#delete-memory-dialog').close();await load();}
 catch(e){$('#delete-memory-error').textContent=e.message;}
 finally{button.disabled=false;}
};

let replyingMemory=null,replyGeneration=0,replySending=false;
function replyBubble(reply){const bubble=el('section',undefined,'perspective'+(reply.author===currentUser?.id?' mine':''));bubble.append(el('small',reply.author_name+' · '+new Date(reply.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})),el('p',reply.body,'story-text'));return bubble;}
function renderMemoryReplies(rows){const list=$('#memory-reply-list');list.replaceChildren();for(const reply of rows)list.append(replyBubble(reply));if(!rows.length)list.append(el('p','留下一句话，让这段回忆继续。','hint'));const used=rows.filter(r=>r.author===currentUser.id).length;$('#memory-reply-count').textContent='我的回应 '+used+'/5';$('#memory-reply-send').disabled=replySending||used>=5||Boolean(currentUser.lifecycle?.readonly);$('#memory-reply-form').elements.body.disabled=$('#memory-reply-send').disabled;}
async function refreshMemoryReplies(){const memory=replyingMemory,generation=replyGeneration;if(!memory)return;try{const rows=await api('/api/memories/'+memory.id+'/replies');if(generation!==replyGeneration||!currentUser)return;memory.replies=rows;renderMemoryReplies(rows);}catch(error){if(generation===replyGeneration)$('#memory-reply-error').textContent=error.message;}}
function openMemoryReplies(memory){replyingMemory=memory;++replyGeneration;$('#memory-reply-title').textContent=memory.title+' · 继续回应';$('#memory-reply-form').reset();$('#memory-reply-error').textContent='';renderMemoryReplies(memory.replies||[]);$('#memory-reply-dialog').showModal();refreshMemoryReplies();}
$('#memory-reply-close').onclick=()=>$('#memory-reply-dialog').close();
$('#memory-reply-dialog').addEventListener('close',()=>{replyingMemory=null;++replyGeneration;});
$('#memory-reply-form').onsubmit=async event=>{event.preventDefault();const memory=replyingMemory,generation=replyGeneration,form=event.target;if(!memory||replySending)return;replySending=true;$('#memory-reply-send').disabled=true;$('#memory-reply-error').textContent='';try{const rows=await api('/api/memories/'+memory.id+'/replies','POST',{body:form.elements.body.value});if(generation!==replyGeneration||!currentUser)return;memory.replies=rows;form.reset();renderMemoryReplies(rows);await load();}catch(error){if(generation===replyGeneration)$('#memory-reply-error').textContent=error.message;}finally{replySending=false;if(replyingMemory&&currentUser)renderMemoryReplies(replyingMemory.replies||[]);}};
