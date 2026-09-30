let floatTimer=null,floatNotice=false;
let liveSource=null,liveTimer=null,liveInterval=24000,liveRevision=null,liveDirty=false,livePending=false,liveRefreshTimer=null,liveGeneration=0;
let liveClient='',liveMessages=[],livePeerKey='',livePeer=null,liveBusy=false,liveAgain=false;
function stopRealtime(){clearTimeout(floatTimer);floatNotice=false;$('#presence-float').hidden=true;liveGeneration++;liveSource?.close();liveSource=null;clearTimeout(liveTimer);clearTimeout(liveRefreshTimer);liveDirty=false;livePending=false;liveRevision=null;livePeerKey='';livePeer=null;liveBusy=false;liveAgain=false;for(const id of ['presence-note','editor-presence-note','sync-note','editor-sync-note'])$('#'+id).hidden=true;}
function refreshShared(){
 if($('#editor').open){livePending=true;$('#sync-note').hidden=false;$('#editor-sync-note').hidden=false;return;}
 clearTimeout(liveRefreshTimer);liveRefreshTimer=setTimeout(()=>{if(currentUser)load();},100);
}
function showPeer(peer){
 livePeer=peer;const box=$('#presence-note'),inside=$('#editor-presence-note');inside.hidden=!peer;if(!peer){livePeerKey='';if(!floatNotice)$('#presence-float').hidden=true;return;}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const category=peer.day<today?'past':peer.day>today?'future':'today',key=peer.started+category;
 if(key===livePeerKey)return;livePeerKey=key;
 const choices=liveMessages.filter(m=>m.category===category);
 const text=choices.length?choices[Math.floor(Math.random()*choices.length)].text:'一份温柔正在认真落笔。';
 const action={past:'正在书写回忆',today:'正在记录当下',future:'正在规划未来'}[category];
 box.textContent=text;inside.textContent=peer.name+action+' · '+text;showFloating(peer.name+action,text);
}
function receiveLive(state){
 const changed=liveRevision!==null&&state.revision!==liveRevision;if(changed)refreshShared();
 liveRevision=state.revision;
 if(liveInterval!==state.interval){liveInterval=state.interval;scheduleLive();}
 showPeer(state.peer);if(changed)showSavedNotice();
}
function scheduleLive(){clearTimeout(liveTimer);if(currentUser&&!document.hidden)liveTimer=setTimeout(sendPresence,liveInterval);}
async function sendPresence(){
 if(!currentUser||document.hidden)return;
 if(liveBusy){liveAgain=true;return;}
 const generation=liveGeneration;liveBusy=true;
 const day=liveDirty&&$('#editor').open?$('#memory-form').elements.day.value:null;
 try{const state=await api('/api/presence','POST',{client:liveClient,day:/^\d{4}-\d{2}-\d{2}$/.test(day||'')?day:null});if(generation===liveGeneration)receiveLive(state);}
 catch{}finally{if(generation===liveGeneration){liveBusy=false;if(liveAgain){liveAgain=false;sendPresence();}else scheduleLive();}}
}
function startRealtime(reuseClient=false){
 const previous=liveClient;stopRealtime();liveClient=reuseClient&&previous?previous:Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');const generation=liveGeneration;
 if(!liveMessages.length)fetch('/presence-messages.json?v=1.5.0').then(r=>r.json()).then(rows=>{liveMessages=rows;if(livePeer){livePeerKey='';showPeer(livePeer);}}).catch(()=>{});
 if(document.hidden)return;
 liveSource=new EventSource('/api/events?client='+liveClient);
 let connected=false;
 liveSource.onmessage=event=>{if(generation!==liveGeneration)return;try{const state=JSON.parse(event.data);if(!connected){connected=true;refreshShared();}receiveLive(state);}catch{}};
 liveSource.onopen=()=>{if(connected)refreshShared();};
 scheduleLive();
}
function placeFloating(){const host=$('#editor').open?$('#editor'):$('#app');host.append($('#presence-float'));}
function announceEditing(){placeFloating();liveDirty=true;sendPresence();}
$('#memory-form').addEventListener('input',()=>{const was=liveDirty;liveDirty=true;if(!was)sendPresence();});
$('#memory-form').elements.day.addEventListener('change',()=>{if(liveDirty)sendPresence();});
$('#editor').addEventListener('close',()=>{placeFloating();liveDirty=false;sendPresence();if(livePending){livePending=false;$('#sync-note').hidden=true;$('#editor-sync-note').hidden=true;refreshShared();}});
function releasePresence(){if(!currentUser||!liveClient)return;fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:liveClient,day:null}),keepalive:true}).catch(()=>{});liveSource?.close();liveSource=null;clearTimeout(liveTimer);}
document.addEventListener('visibilitychange',()=>{if(!currentUser)return;if(document.hidden){liveSource?.close();liveSource=null;clearTimeout(liveTimer);}else{const dirty=liveDirty,pending=livePending;startRealtime(true);liveDirty=dirty;livePending=pending;if(dirty)sendPresence();refreshShared();}});
window.addEventListener('pagehide',releasePresence);

function setFloatExpanded(expanded){
 $('#presence-toggle').setAttribute('aria-expanded',String(expanded));
 $('#presence-float').classList.toggle('is-collapsed',!expanded);
 $('#presence-title').hidden=!expanded;$('#presence-note').hidden=false;$('#presence-chevron').textContent=expanded?'⌄':'⌃';
}
function showFloating(title,message){
 placeFloating();
 clearTimeout(floatTimer);floatNotice=false;$('#presence-title').textContent=title;$('#presence-note').textContent=message;
 $('#presence-float').hidden=false;setFloatExpanded(true);
 floatTimer=setTimeout(()=>setFloatExpanded(false),5000);
}
function showSavedNotice(){
 showFloating('新的心意已送达',$('#editor').open?'写完再一起看，你的草稿会好好保留。':'回忆有了新内容，正在为你同步。');floatNotice=true;clearTimeout(floatTimer);
 floatTimer=setTimeout(()=>{floatNotice=false;if(livePeer){livePeerKey='';showPeer(livePeer);setFloatExpanded(false);}else $('#presence-float').hidden=true;},5000);
}
$('#presence-toggle').onclick=()=>{clearTimeout(floatTimer);const expanded=$('#presence-toggle').getAttribute('aria-expanded')!=='true';setFloatExpanded(expanded);if(expanded||floatNotice)floatTimer=setTimeout(()=>{if(floatNotice){floatNotice=false;if(livePeer){livePeerKey='';showPeer(livePeer);setFloatExpanded(false);}else $('#presence-float').hidden=true;}else setFloatExpanded(false);},5000);};
