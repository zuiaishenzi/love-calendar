const widgetAndroid=Number(/OurDaysAndroid\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10810;
let widgetBox='received',widgetNotes=[],widgetMore=false,widgetRequest=0,widgetBusy=false,widgetHistoryOwner=null;
function nativeWidget(command,value=''){if(widgetAndroid)window.prompt('ourdays-widget:'+command,String(value));}
function widgetSessionChanged(){nativeWidget('session',currentUser?.id||0);if(currentUser)openWidgetLink();}
function stopWidget(){widgetRequest++;widgetHistoryOwner=null;widgetNotes=[];$('#widget-notes-dialog').close();$('#widget-settings-dialog').close();$('#widget-notes-list').replaceChildren();$('#widget-note-form').reset();nativeWidget('session',0);}
function paintWidgetNotes(){
 const list=$('#widget-notes-list');list.replaceChildren();$('#widget-note-total').textContent=widgetBox==='received'?'留给你的心意，都在这里。':'你写下的牵挂，也被好好收藏。';
 for(const b of document.querySelectorAll('[data-widget-box]'))b.setAttribute('aria-selected',String(b.dataset.widgetBox===widgetBox));
 const query=$('#widget-note-search').value.trim().toLowerCase(),rows=widgetNotes.filter(r=>r.text.toLowerCase().includes(query));let previous='';
 if(!rows.length)list.append(el('p',query?'这一页还没有匹配的留言。':'暂时没有留言，给对方留一句想念吧。','widget-note-empty'));
 for(const row of rows){const date=new Date(row.created).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'}),group=date+' · '+(row.read_at?'已读':'未读');if(group!==previous){list.append(el('h3',group,'widget-note-date'));previous=group;}
  const card=el('article',undefined,'widget-note-card'+(row.read_at?' is-read':'')),mark=el('button',row.read_at?'✓':'','widget-note-check'),body=el('div'),meta=el('small',(widgetBox==='received'?row.sender_name:row.recipient_name)+' · '+new Date(row.created).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}));
  mark.type='button';mark.setAttribute('aria-label',row.read_at?'已读':'标记这条留言已读');mark.disabled=Boolean(row.read_at)||widgetBox==='sent';mark.onclick=async()=>{mark.disabled=true;try{await api('/api/widget/read','POST',{type:'note',id:row.id});if(widgetHistoryOwner!==currentUser?.id)return;row.read_at=Date.now();paintWidgetNotes();nativeWidget('refresh');}catch(e){$('#widget-note-status').textContent=e.message;mark.disabled=false;}};body.append(el('p',row.text),meta);card.append(mark,body);list.append(card);
 }
 $('#widget-notes-more').hidden=!widgetMore;$('#widget-note-send').disabled=Boolean(currentUser?.lifecycle?.readonly)||widgetBusy;
}
async function loadWidgetNotes(append=false){
 const owner=currentUser?.id,request=++widgetRequest;if(!owner)return;$('#widget-note-status').textContent='';
 try{const data=await api('/api/widget/notes?'+new URLSearchParams({box:widgetBox,...(append&&widgetNotes.length?{before:widgetNotes.at(-1).id}:{})}));if(owner!==currentUser?.id||request!==widgetRequest||!$('#widget-notes-dialog').open)return;widgetHistoryOwner=owner;widgetNotes=append?[...widgetNotes,...data.items]:data.items;widgetMore=data.more;paintWidgetNotes();}catch(e){if(owner===currentUser?.id)$('#widget-note-status').textContent=e.message;}
}
async function openWidgetNotes(){if(!currentUser)return;menuOpen(false);widgetHistoryOwner=currentUser.id;widgetNotes=[];widgetMore=false;$('#widget-note-search').value='';if(!$('#widget-notes-dialog').open)$('#widget-notes-dialog').showModal();paintWidgetNotes();await loadWidgetNotes();}
$('#widget-notes-open').onclick=openWidgetNotes;$('#widget-notes-close').onclick=()=>$('#widget-notes-dialog').close();$('#widget-note-search').oninput=paintWidgetNotes;
for(const b of document.querySelectorAll('[data-widget-box]'))b.onclick=()=>{widgetBox=b.dataset.widgetBox;widgetNotes=[];paintWidgetNotes();loadWidgetNotes();};
$('#widget-notes-more').onclick=()=>loadWidgetNotes(true);
$('#widget-note-form').onsubmit=async event=>{event.preventDefault();if(widgetBusy)return;const owner=currentUser?.id,text=event.target.elements.text.value;widgetBusy=true;paintWidgetNotes();try{await api('/api/widget/notes','POST',{text});if(owner!==currentUser?.id)return;event.target.reset();widgetBox='sent';await loadWidgetNotes();$('#widget-note-status').textContent='已经把这份心意送给对方。';nativeWidget('refresh');}catch(e){if(owner===currentUser?.id)$('#widget-note-status').textContent=e.message;}finally{widgetBusy=false;if(owner===currentUser?.id)paintWidgetNotes();}};
$('#widget-notes-dialog').addEventListener('close',()=>{widgetRequest++;});
async function openWidgetSettings(){
 if(!currentUser)return;const owner=currentUser.id;$('#widget-settings-status').textContent='';$('#widget-settings-dialog').showModal();
 try{const [state,reminders]=await Promise.all([api('/api/widget/state'),api('/api/reminders')]);if(owner!==currentUser?.id||!$('#widget-settings-dialog').open)return;const select=$('#widget-countdown');select.replaceChildren(new Option('暂不选择纪念日',''));for(const r of reminders)select.add(new Option(r.title+' · '+r.label,String(r.id)));select.value=String(state.countdown?.id||'');select.disabled=Boolean(currentUser.lifecycle?.readonly);}catch(e){$('#widget-settings-status').textContent=e.message;}
}
$('#widget-settings-open').hidden=!widgetAndroid;$('#widget-settings-open').onclick=openWidgetSettings;$('#widget-settings-close').onclick=()=>$('#widget-settings-dialog').close();
$('#widget-countdown').onchange=async event=>{const owner=currentUser?.id;try{await api('/api/widget/settings','PUT',{reminderId:event.target.value?Number(event.target.value):null});if(owner!==currentUser?.id)return;$('#widget-settings-status').textContent='倒计时已更新';nativeWidget('refresh');}catch(e){$('#widget-settings-status').textContent=e.message;}};
$('#widget-pin').onclick=()=>nativeWidget('pin');$('#widget-background').onclick=()=>nativeWidget('settings');
async function setWidgetCountdown(id){try{await api('/api/widget/settings','PUT',{reminderId:id});$('#reminders-error').textContent='已设为你的桌面倒计时';nativeWidget('refresh');}catch(e){$('#reminders-error').textContent=e.message;}}
function openWidgetLink(detail=null){
 const url=new URL(location.href),target=detail?.target||url.searchParams.get('widget'),owner=Number(detail?.owner||url.searchParams.get('widgetOwner'));if(!target||!currentUser)return;
 url.searchParams.delete('widget');url.searchParams.delete('widgetOwner');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
 if(owner&&owner!==currentUser.id){openWidgetNotes();return;}if(target==='chat'){document.querySelectorAll('dialog[open]').forEach(d=>d.close());switchView('chat');}else openWidgetNotes();
}
window.addEventListener('widget-open',event=>openWidgetLink(event.detail));if(currentUser)widgetSessionChanged();
