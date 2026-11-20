const widgetHarmony=Number(/OurDaysHarmony\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10901;
const widgetAndroid=Number(/OurDaysAndroid\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10810;
const widgetNative=widgetHarmony||widgetAndroid;
let widgetBox='received',widgetNotes=[],widgetMore=false,widgetRequest=0,widgetBusy=false,widgetHistoryOwner=null;
function nativeWidget(command,value=''){if(widgetNative)return window.prompt('ourdays-widget:'+command,String(value));}
function widgetSessionChanged(){nativeWidget('session',currentUser?.id||0);if(currentUser)openWidgetLink();}
function stopWidget(){closeWidgetColorPicker();widgetSettingsRequest++;widgetSettingsBusy=false;widgetReminderRows=[];widgetReminderId=null;$('#widget-date-title').value='';$('#widget-custom-day').value='';$('#widget-date-value').textContent='选一个想一起度过的日子';$('#widget-reminder-options').replaceChildren();paintWidgetCountdownPreview(null);widgetRequest++;widgetHistoryOwner=null;widgetNotes=[];closeWidgetDate();$('#widget-notes-list').replaceChildren();$('#widget-note-form').reset();clearWidgetPhoto();nativeWidget('session',0);}
function paintWidgetNotes(){
 const list=$('#widget-notes-list');list.replaceChildren();$('#widget-note-total').textContent=widgetBox==='received'?'留给你的心意，都在这里。':'你写下的牵挂，也被好好收藏。';
 for(const b of document.querySelectorAll('[data-widget-box]'))b.setAttribute('aria-selected',String(b.dataset.widgetBox===widgetBox));
 const query=$('#widget-note-search').value.trim().toLowerCase(),rows=widgetNotes.filter(r=>r.text.toLowerCase().includes(query));let previous='';
 if(!rows.length)list.append(el('p',query?'这一页还没有匹配的留言。':'暂时没有留言，给对方留一句想念吧。','widget-note-empty'));
 for(const row of rows){const date=new Date(row.created).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'}),group=date+' · '+(row.read_at?'已读':'未读');if(group!==previous){list.append(el('h3',group,'widget-note-date'));previous=group;}
  const card=el('article',undefined,'widget-note-card'+(row.read_at?' is-read':'')),mark=el('button',row.read_at?'✓':'','widget-note-check'),body=el('div'),meta=el('small',(widgetBox==='received'?row.sender_name:row.recipient_name)+' · '+new Date(row.created).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}));
  mark.type='button';mark.setAttribute('aria-pressed',String(Boolean(row.read_at)));mark.setAttribute('aria-label',widgetBox==='sent'?(row.read_at?'对方已读':'对方未读'):row.read_at?'恢复这条留言为未读':'标记这条留言已读');mark.disabled=widgetBox==='sent';mark.onclick=async()=>{const owner=currentUser?.id,restore=Boolean(row.read_at),box=widgetBox;mark.disabled=true;try{await api(restore?'/api/widget/unread':'/api/widget/read','POST',{type:'note',id:row.id});if(owner!==currentUser?.id||widgetHistoryOwner!==owner)return;row.read_at=restore?null:Date.now();if(view==='notes'&&widgetBox===box){paintWidgetNotes();$('#widget-note-status').textContent=restore?'已恢复未读，会重新出现在你的桌面待阅留言中。':'已标记为已读。';}nativeWidget('refresh');}catch(e){if(owner===currentUser?.id&&view==='notes'&&widgetBox===box){$('#widget-note-status').textContent=e.message;mark.disabled=false;}}};body.append(el('p',row.text),meta);card.append(mark,body);list.append(card);
 }
 $('#widget-notes-more').hidden=!widgetMore;$('#widget-note-send').disabled=Boolean(currentUser?.lifecycle?.readonly)||widgetBusy;
}
async function loadWidgetNotes(append=false){
 const owner=currentUser?.id,request=++widgetRequest;if(!owner)return;$('#widget-note-status').textContent='';
 try{const data=await api('/api/widget/notes?'+new URLSearchParams({box:widgetBox,...(append&&widgetNotes.length?{before:widgetNotes.at(-1).id}:{})}));if(owner!==currentUser?.id||request!==widgetRequest||view!=='notes')return;widgetHistoryOwner=owner;widgetNotes=append?[...widgetNotes,...data.items]:data.items;widgetMore=data.more;paintWidgetNotes();}catch(e){if(owner===currentUser?.id&&view==='notes')$('#widget-note-status').textContent=e.message;}
}
function openWidgetNotes(){if(!currentUser)return;menuOpen(false);widgetHistoryOwner=currentUser.id;widgetNotes=[];widgetMore=false;$('#widget-note-search').value='';paintWidgetNotes();return switchView('notes');}
$('#widget-notes-open').onclick=openWidgetNotes;$('#widget-notes-close').onclick=()=>switchView('calendar');$('#widget-note-search').oninput=paintWidgetNotes;
for(const b of document.querySelectorAll('[data-widget-box]'))b.onclick=()=>{widgetBox=b.dataset.widgetBox;widgetNotes=[];paintWidgetNotes();loadWidgetNotes();};
$('#widget-notes-more').onclick=()=>loadWidgetNotes(true);
$('#widget-note-form').onsubmit=async event=>{event.preventDefault();if(widgetBusy)return;const owner=currentUser?.id,text=event.target.elements.text.value;widgetBusy=true;paintWidgetNotes();try{await api('/api/widget/notes','POST',{text});if(owner!==currentUser?.id)return;event.target.reset();widgetBox='sent';await loadWidgetNotes();$('#widget-note-status').textContent='已经把这份心意送给对方。';nativeWidget('refresh');}catch(e){if(owner===currentUser?.id)$('#widget-note-status').textContent=e.message;}finally{widgetBusy=false;if(owner===currentUser?.id)paintWidgetNotes();}};
function leaveWidgetNotes(){widgetRequest++;}
async function setWidgetCountdown(id){try{await api('/api/widget/settings','PUT',{reminderId:id});$('#reminders-error').textContent='已设为你的桌面倒计时';nativeWidget('refresh');}catch(e){$('#reminders-error').textContent=e.message;}}
function openWidgetLink(detail=null){
 const url=new URL(location.href),target=detail?.target||url.searchParams.get('widget'),owner=Number(detail?.owner||url.searchParams.get('widgetOwner'));if(!target||!currentUser)return;
 url.searchParams.delete('widget');url.searchParams.delete('widgetOwner');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
 if(owner&&owner!==currentUser.id){openWidgetNotes();return;}if(target==='chat'){document.querySelectorAll('dialog[open]').forEach(d=>d.close());switchView('chat');}else openWidgetNotes();
}
let widgetCountdownMode='custom',widgetReminderRows=[],widgetReminderId=null,widgetDateMonth=localDay().slice(0,7),widgetSettingsRequest=0,widgetSettingsBusy=false;
const widgetPresetNames={rose:'柔雾',dawn:'晨光',hills:'山野',moon:'晚风'};
function closeWidgetDate(){const open=!$('#widget-date-picker').hidden||!$('#widget-reminder-options').hidden;$('#widget-date-picker').hidden=true;$('#widget-date-trigger').setAttribute('aria-expanded','false');$('#widget-reminder-options').hidden=true;$('#widget-reminder-trigger').setAttribute('aria-expanded','false');return open;}
function paintWidgetCountdownMode(){
 const readonly=Boolean(currentUser?.lifecycle?.readonly);closeWidgetDate();for(const b of document.querySelectorAll('[data-widget-countdown]')){b.setAttribute('aria-selected',String(b.dataset.widgetCountdown===widgetCountdownMode));b.disabled=readonly;}
 $('#widget-custom-fields').hidden=widgetCountdownMode!=='custom';$('#widget-reminder-fields').hidden=widgetCountdownMode!=='reminder';$('#widget-no-countdown').hidden=widgetCountdownMode!=='none';$('#widget-date-title').disabled=readonly||widgetCountdownMode!=='custom';$('#widget-date-trigger').disabled=readonly;$('#widget-reminder-trigger').disabled=readonly;$('#widget-date-save').disabled=readonly||widgetSettingsBusy;
}
function paintWidgetCountdownPreview(countdown){$('#widget-preview-title').textContent=countdown?(countdown.days===0?'就是今天 ♡':countdown.days>0?'还有 '+countdown.days+' 天':'已经 '+Math.abs(countdown.days)+' 天'):'把下一个期待，放在这里';$('#widget-preview-date').textContent=countdown?countdown.title+' · '+countdown.day.replaceAll('-','.'):'有未读消息时，会先展示对方的心意。';}
function paintWidgetReminder(){const selected=widgetReminderRows.find(r=>r.id===widgetReminderId);$('#widget-reminder-value').textContent=selected?selected.title+' · '+selected.label:'选择已记录的纪念日';const list=$('#widget-reminder-options');list.replaceChildren();if(!widgetReminderRows.length)list.append(el('p','日历里还没有年度提醒，可以先选择任意日期。','hint'));for(const r of widgetReminderRows){const b=el('button'),name=el('span',r.title),date=el('small',r.label);b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(r.id===widgetReminderId));b.append(name,date);b.onclick=()=>{widgetReminderId=r.id;paintWidgetReminder();closeWidgetDate();};list.append(b);}}
async function loadWidgetSettings(){
 if(!currentUser)return;const owner=currentUser.id,request=++widgetSettingsRequest;$('#widget-settings-status').textContent='正在打开这份小期待…';widgetSettingsBusy=true;paintWidgetCountdownMode();
 try{const [state,reminders]=await Promise.all([api('/api/widget/state'),api('/api/reminders')]);if(owner!==currentUser?.id||view!=='widget'||request!==widgetSettingsRequest)return;widgetReminderRows=reminders;widgetReminderId=state.settings?.reminderId||state.countdown?.id||null;widgetCountdownMode=state.settings?.customDay?'custom':widgetReminderId?'reminder':'custom';$('#widget-date-title').value=state.settings?.title||'';$('#widget-custom-day').value=state.settings?.customDay||'';$('#widget-date-value').textContent=state.settings?.customDay?.replaceAll('-','.')||'选一个想一起度过的日子';widgetDateMonth=($('#widget-custom-day').value||localDay()).slice(0,7);paintWidgetReminder();paintWidgetCountdownPreview(state.countdown);$('#widget-settings-status').textContent='';paintWidgetBackground(nativeWidget('background-current')||'rose');loadWidgetAppearance();}
 catch(e){if(owner===currentUser?.id&&view==='widget')$('#widget-settings-status').textContent=e.message;}
 finally{if(owner===currentUser?.id&&request===widgetSettingsRequest){widgetSettingsBusy=false;paintWidgetCountdownMode();}}
}
function openWidgetSettings(){if(!currentUser)return;menuOpen(false);document.querySelectorAll('dialog[open]').forEach(d=>d.close());return switchView('widget');}
$('#widget-settings-open').hidden=!widgetNative;$('#widget-settings-open').onclick=openWidgetSettings;$('#widget-settings-close').onclick=()=>switchView('calendar');
for(const b of document.querySelectorAll('[data-widget-countdown]'))b.onclick=()=>{widgetCountdownMode=b.dataset.widgetCountdown;paintWidgetCountdownMode();};
function renderWidgetDate(){
 const [year,m]=widgetDateMonth.split('-').map(Number),chosen=$('#widget-custom-day').value,list=$('#widget-date-days'),offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7,days=new Date(Date.UTC(year,m,0)).getUTCDate();$('#widget-date-year').value=String(year);$('#widget-date-month').textContent=m+'月';$('#widget-date-prev').disabled=widgetDateMonth==='2000-01';$('#widget-date-next').disabled=widgetDateMonth==='9999-12';list.replaceChildren();for(let i=0;i<offset;i++)list.append(el('span'));
 for(let n=1;n<=days;n++){const day=widgetDateMonth+'-'+String(n).padStart(2,'0'),b=el('button',String(n));b.type='button';b.setAttribute('aria-label',day);b.setAttribute('aria-pressed',String(chosen===day));b.classList.toggle('today',day===localDay());b.onclick=()=>{$('#widget-custom-day').value=day;$('#widget-date-value').textContent=day.replaceAll('-','.');closeWidgetDate();};list.append(b);}
}
$('#widget-date-trigger').onclick=()=>{const open=$('#widget-date-picker').hidden;closeWidgetDate();if(open){renderWidgetDate();$('#widget-date-picker').hidden=false;$('#widget-date-trigger').setAttribute('aria-expanded','true');}};
for(const [id,delta] of [['#widget-date-prev',-1],['#widget-date-next',1]])$(id).onclick=()=>{const [y,m]=widgetDateMonth.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1)),next=d.toISOString().slice(0,7);if(next<'2000-01'||next>'9999-12')return;widgetDateMonth=next;renderWidgetDate();};
$('#widget-date-year').onchange=event=>{const y=Number(event.target.value);if(Number.isInteger(y)&&y>=2000&&y<=9999)widgetDateMonth=String(y).padStart(4,'0')+widgetDateMonth.slice(4);renderWidgetDate();};$('#widget-date-today').onclick=()=>{widgetDateMonth=localDay().slice(0,7);renderWidgetDate();};
$('#widget-reminder-trigger').onclick=()=>{const open=$('#widget-reminder-options').hidden;closeWidgetDate();if(open){$('#widget-reminder-options').hidden=false;$('#widget-reminder-trigger').setAttribute('aria-expanded','true');}};
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#widget-custom-fields,#widget-reminder-fields'))closeWidgetDate();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeWidgetDate();});
$('#widget-date-form').onsubmit=async event=>{
 event.preventDefault();if(widgetSettingsBusy)return;const owner=currentUser?.id;let input={reminderId:null};if(widgetCountdownMode==='custom'){const day=$('#widget-custom-day').value,title=$('#widget-date-title').value.trim();if(!day||!title){$('#widget-settings-status').textContent='给这份期待起个名字，再选一个日期吧。';return;}input={customDay:day,title};}else if(widgetCountdownMode==='reminder'){if(!widgetReminderId){$('#widget-settings-status').textContent='请选择一个纪念日';return;}input={reminderId:widgetReminderId};}
 widgetSettingsBusy=true;paintWidgetCountdownMode();try{const state=await api('/api/widget/settings','PUT',input);if(owner!==currentUser?.id||view!=='widget')return;paintWidgetCountdownPreview(state.countdown);$('#widget-settings-status').textContent='这份期待，已经放到卡片上了。';nativeWidget('refresh');}catch(e){if(owner===currentUser?.id)$('#widget-settings-status').textContent=e.message;}finally{if(owner===currentUser?.id){widgetSettingsBusy=false;paintWidgetCountdownMode();}}
};
function paintWidgetBackground(preset){const preview=$('#widget-setting-preview');preview.className='widget-setting-preview widget-bg-'+(widgetPresetNames[preset]?preset:'rose');for(const b of document.querySelectorAll('[data-widget-background]'))b.setAttribute('aria-pressed',String(b.dataset.widgetBackground===preset));if(preset!=='custom')clearWidgetPhoto();}
for(const [code,name] of Object.entries(widgetPresetNames)){const b=el('button'),image=el('span',undefined,'widget-background-thumb widget-bg-'+code);b.type='button';b.dataset.widgetBackground=code;b.setAttribute('aria-pressed','false');b.append(image,el('span',name));b.onclick=()=>{if(!widgetHarmony&&Number(/OurDaysAndroid\/(\d+)/.exec(navigator.userAgent)?.[1]||0)<10811){$('#widget-background-status').textContent='内置背景需要更新客户端。';return;}nativeWidget('background',code);paintWidgetBackground(code);$('#widget-background-status').textContent='已换上「'+name+'」，也可以继续挑一张自己的照片。';};$('#widget-background-presets').append(b);}
if(widgetHarmony){$('#widget-pin').textContent='如何添加到桌面';$('.widget-page-footnote').textContent='消息优先展示；鸿蒙系统约30分钟检查，点击卡片刷新可立即同步。';}
$('#widget-pin').onclick=()=>nativeWidget('pin');$('#widget-background').onclick=()=>nativeWidget('settings');
window.addEventListener('widget-open',event=>openWidgetLink(event.detail));if(currentUser)widgetSessionChanged();

const widgetAppearanceCapable=Number(/OurDaysHarmony\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10902||(!widgetHarmony&&Number(/OurDaysAndroid\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10903);
const widgetRegionalCapable=Number(/OurDaysHarmony\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10905||(!widgetHarmony&&Number(/OurDaysAndroid\/(\d+)/.exec(navigator.userAgent)?.[1]||0)>=10905);
let widgetPhotoUrl=null,widgetPhotoPixels=null,widgetPhotoGeneration=0,widgetAppearanceTimer=null;
function clearWidgetPhoto(){clearTimeout(widgetAppearanceTimer);widgetAppearanceTimer=null;widgetPhotoGeneration++;if(widgetPhotoUrl)URL.revokeObjectURL(widgetPhotoUrl);widgetPhotoUrl=null;widgetPhotoPixels=null;$('#widget-setting-preview').style.removeProperty('--widget-preview-image');}
function widgetTextColor(pixels,overlay,region='body'){
 const edge=Math.sqrt(pixels.length/4),square=Number.isInteger(edge)&&edge>=4,start=region==='caption'?.75:region==='body'?.25:0,end=region==='title'?.25:region==='body'?.75:1;
 let luminance=0,count=0;for(let i=0;i<pixels.length;i+=4){const row=Math.floor(i/4/edge);if(square&&(row<Math.floor(edge*start)||row>=Math.ceil(edge*end)))continue;let value=0;for(let c=0;c<3;c++){const a=overlay/100+(1-overlay/100)*(1-(pixels[i+3]??255)/255),s=(pixels[i+c]*(1-a)+255*a)/255;value+=(c===0?.2126:c===1?.7152:.0722)*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);}luminance+=value;count++;}
 const light=count?luminance/count:.8,palette=region==='title'?['#63364E','#FFE6F0']:region==='caption'?['#264A40','#DDF6EC']:['#30252C','#FFFFFF'];
 const contrast=color=>{let value=0;for(let c=0;c<3;c++){const s=parseInt(color.slice(1+c*2,3+c*2),16)/255;value+=(c===0?.2126:c===1?.7152:.0722)*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);}return (Math.max(light,value)+.05)/(Math.min(light,value)+.05);};
 const chosen=contrast(palette[0])>=contrast(palette[1])?palette[0]:palette[1];return contrast(chosen)>=4.5?chosen:contrast('#000000')>=contrast('#FFFFFF')?'#000000':'#FFFFFF';
}
function paintWidgetAppearance(){
 const overlay=Number($('#widget-overlay').value),custom=$('[name="widget-text-mode"][value="custom"]').checked;
 $('#widget-overlay-value').textContent=overlay+'%';for(const id of ['widget-text-color','widget-title-color','widget-caption-color'])$('#'+id).disabled=!custom||id!=='widget-text-color'&&!widgetRegionalCapable;
 for(const node of document.querySelectorAll('.widget-region-only'))node.hidden=!widgetRegionalCapable;
 const color=custom?$('#widget-text-color').value:widgetTextColor(widgetPhotoPixels||[240,225,235,255],overlay),preview=$('#widget-setting-preview');
 preview.style.setProperty('--widget-overlay',String(overlay/100));preview.style.setProperty('--widget-text',color);
 preview.style.setProperty('--widget-title',widgetRegionalCapable?(custom?$('#widget-title-color').value:widgetTextColor(widgetPhotoPixels||[240,225,235,255],overlay,'title')):color);
 preview.style.setProperty('--widget-caption',widgetRegionalCapable?(custom?$('#widget-caption-color').value:widgetTextColor(widgetPhotoPixels||[240,225,235,255],overlay,'caption')):color);
 for(const [id,variable] of [['widget-title-color','--widget-title'],['widget-text-color','--widget-text'],['widget-caption-color','--widget-caption']]){const button=$('[data-widget-color="'+id+'"]'),value=preview.style.getPropertyValue(variable);button.disabled=!widgetAppearanceCapable||id!=='widget-text-color'&&!widgetRegionalCapable;button.style.setProperty('--swatch',value);button.dataset.color=value;button.querySelector('span').textContent=value.toUpperCase();}
}
function loadWidgetAppearance(){
 if(widgetAppearanceTimer!==null)return;
 $('#widget-appearance-controls').disabled=!widgetAppearanceCapable;
 if(!widgetAppearanceCapable){$('#widget-appearance-status').textContent='更新客户端后，可以调整照片遮罩与文字颜色。';return;}
 let style;try{style=JSON.parse(nativeWidget('appearance-current')||'null');}catch{return;}if(!style)return;
 $('#widget-overlay').value=String(Math.max(0,Math.min(70,Number(style.overlay)||0)));for(const radio of document.querySelectorAll('[name="widget-text-mode"]'))radio.checked=radio.value===(style.mode==='custom'?'custom':'auto');$('#widget-text-color').value=/^#[\da-f]{6}$/i.test(style.color)?style.color:'#704457';
 for(const [id,key] of [['widget-title-color','titleColor'],['widget-caption-color','captionColor']])$('#'+id).value=/^#[\da-f]{6}$/i.test(style[key])?style[key]:$('#widget-text-color').value;
 clearWidgetPhoto();const generation=widgetPhotoGeneration,owner=currentUser?.id;
 if(style.preview&&style.preview.length<400000){try{const bytes=Uint8Array.from(atob(style.preview),x=>x.charCodeAt(0));widgetPhotoUrl=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));$('#widget-setting-preview').style.setProperty('--widget-preview-image','url("'+widgetPhotoUrl+'")');const image=new Image();image.onload=()=>{if(generation!==widgetPhotoGeneration||owner!==currentUser?.id)return;const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const context=canvas.getContext('2d'),side=Math.min(image.naturalWidth,image.naturalHeight);context.drawImage(image,Math.floor((image.naturalWidth-side)/2),Math.floor((image.naturalHeight-side)/2),side,side,0,0,16,16);widgetPhotoPixels=context.getImageData(0,0,16,16).data;paintWidgetAppearance();};image.src=widgetPhotoUrl;}catch{clearWidgetPhoto();}}
 paintWidgetAppearance();$('#widget-appearance-status').textContent='';
}
function saveWidgetAppearance(){
 clearTimeout(widgetAppearanceTimer);widgetAppearanceTimer=null;if(!currentUser||!widgetAppearanceCapable||$('#widget-appearance-controls').disabled)return;
 const style={overlay:Number($('#widget-overlay').value),mode:$('[name="widget-text-mode"][value="custom"]').checked?'custom':'auto',color:$('#widget-text-color').value};
 if(widgetRegionalCapable){style.titleColor=$('#widget-title-color').value;style.captionColor=$('#widget-caption-color').value;}
 try{const saved=JSON.parse(nativeWidget('appearance',JSON.stringify(style))||'null');$('#widget-appearance-status').textContent=saved&&saved.mode===style.mode&&saved.overlay===style.overlay&&['color',...(widgetRegionalCapable?['titleColor','captionColor']:[])].every(key=>saved[key]?.toLowerCase()===style[key].toLowerCase())?'已应用到桌面卡片。':'未能应用到桌面，请点击按钮重试。';}catch{$('#widget-appearance-status').textContent='未能应用到桌面，请点击按钮重试。';}
}
function queueWidgetAppearance(){paintWidgetAppearance();clearTimeout(widgetAppearanceTimer);const owner=currentUser?.id;$('#widget-appearance-status').textContent='正在应用到桌面…';widgetAppearanceTimer=setTimeout(()=>{widgetAppearanceTimer=null;if(owner===currentUser?.id)saveWidgetAppearance();},250);}
for(const id of ['widget-overlay','widget-text-color','widget-title-color','widget-caption-color'])$('#'+id).oninput=queueWidgetAppearance;
for(const input of [$('#widget-overlay'),$('#widget-text-color'),$('#widget-title-color'),$('#widget-caption-color'),...document.querySelectorAll('[name="widget-text-mode"]')])input.onchange=()=>{paintWidgetAppearance();saveWidgetAppearance();};
$('#widget-appearance-save').onclick=saveWidgetAppearance;
window.addEventListener('widget-style-changed',()=>{if(view==='widget')loadWidgetAppearance();});

let widgetColorTarget=null,widgetColorOwner=null;
function widgetHexToHsl(hex){
 const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255),max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min,l=(max+min)/2;
 let h=0,s=0;if(delta){s=delta/(1-Math.abs(2*l-1));h=max===rgb[0]?((rgb[1]-rgb[2])/delta+6)%6:max===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4;}
 return [Math.round(h*60)%360,Math.round(s*100),Math.round(l*100)];
}
function widgetHslToHex(h,s,l){
 h=((h%360)+360)%360/60;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
 const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2,rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
 return '#'+rgb.map(value=>Math.round((value+m)*255).toString(16).padStart(2,'0')).join('');
}
function paintWidgetColorPicker(color,keepSliders=false){
 $('#widget-color-hex').value=color.toUpperCase();$('#widget-color-sample').style.backgroundColor=color;$('#widget-color-error').textContent='';
 const values=keepSliders?['hue','saturation','lightness'].map(key=>Number($('#widget-color-'+key).value)):widgetHexToHsl(color);['hue','saturation','lightness'].forEach((key,i)=>{$('#widget-color-'+key).value=String(values[i]);$('#widget-color-'+key+'-value').textContent=values[i]+(i?'%':'°');});
 for(const button of document.querySelectorAll('[data-widget-swatch]'))button.setAttribute('aria-pressed',String(button.dataset.widgetSwatch.toLowerCase()===color.toLowerCase()));
}
function chooseWidgetColor(color,keepSliders=false){
 if(!/^#[\da-f]{6}$/i.test(color))return;
 if(!widgetColorTarget||!currentUser||widgetColorOwner!==currentUser.id||view!=='widget'){closeWidgetColorPicker();return;}
 if($('[name="widget-text-mode"][value="auto"]').checked){const preview=$('#widget-setting-preview');for(const [id,key] of [['widget-title-color','--widget-title'],['widget-text-color','--widget-text'],['widget-caption-color','--widget-caption']])$('#'+id).value=preview.style.getPropertyValue(key);$('[name="widget-text-mode"][value="auto"]').checked=false;$('[name="widget-text-mode"][value="custom"]').checked=true;}
 $('#'+widgetColorTarget).value=color;paintWidgetColorPicker(color,keepSliders);queueWidgetAppearance();
}
function closeWidgetColorPicker(){if($('#widget-color-dialog').open)$('#widget-color-dialog').close();widgetColorTarget=null;widgetColorOwner=null;}
for(const button of document.querySelectorAll('[data-widget-color]'))button.onclick=()=>{
 if(!currentUser||!widgetAppearanceCapable)return;widgetColorTarget=button.dataset.widgetColor;widgetColorOwner=currentUser.id;
 $('#widget-color-heading').textContent=({ 'widget-title-color':'标题颜色','widget-text-color':'正文颜色','widget-caption-color':'底部颜色' })[widgetColorTarget];paintWidgetColorPicker(button.dataset.color||$('#'+widgetColorTarget).value);$('#widget-color-dialog').showModal();
};
const widgetSwatches=['#FFFFFF','#FFE6F0','#F7D49B','#DDF6EC','#D4ECFF','#E4D9FA','#F38FB0','#D99754','#7CBDA6','#76ABD5','#A58BC5','#B34B76','#63364E','#264A40','#154B56','#30252C','#666666','#000000'];
for(const color of widgetSwatches){const button=el('button');button.type='button';button.dataset.widgetSwatch=color;button.style.setProperty('--swatch',color);button.setAttribute('aria-label','选择颜色 '+color);button.setAttribute('aria-pressed','false');button.onclick=()=>{chooseWidgetColor(color);saveWidgetAppearance();};$('#widget-color-swatches').append(button);}
for(const key of ['hue','saturation','lightness']){const input=$('#widget-color-'+key);input.oninput=()=>chooseWidgetColor(widgetHslToHex(Number($('#widget-color-hue').value),Number($('#widget-color-saturation').value),Number($('#widget-color-lightness').value)),true);input.onchange=saveWidgetAppearance;}
$('#widget-color-hex').oninput=event=>{const value=event.target.value.trim();if(/^#[\da-f]{6}$/i.test(value))chooseWidgetColor(value);else $('#widget-color-error').textContent='请输入六位色号，例如 #A16986。';};
$('#widget-color-done').onclick=()=>{if(widgetAppearanceTimer!==null)saveWidgetAppearance();closeWidgetColorPicker();};
$('#widget-color-dialog').addEventListener('close',()=>{widgetColorTarget=null;widgetColorOwner=null;});
$('#widget-color-dialog').addEventListener('click',event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeWidgetColorPicker();});
