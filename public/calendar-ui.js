const calendarWheel=$('#calendar-month-wheel'),calendarCard=$('#calendar-month-card'),calendarTrigger=$('#calendar-month-trigger'),calendarRow=36;let calendarWheelTimer=null,calendarWheelSyncUntil=0,calendarWheelLock=0,calendarDraft=1,calendarPickerOpen=false,calendarLayoutFrame=null,calendarHintTimer=null,calendarFormDraft=null;
calendarWheel.append(el('div',undefined,'calendar-month-space'));
for(let n=1;n<=12;n++){const button=el('button',n+'月','calendar-month-option');button.type='button';button.id='calendar-option-'+n;button.dataset.month=String(n);button.setAttribute('role','option');button.tabIndex=-1;button.onclick=()=>setMonthDraft(n,true);calendarWheel.append(button);}
calendarWheel.append(el('div',undefined,'calendar-month-space'));
function syncMonthPicker(){if(calendarFormDraft?.base===month){$('#jump-year').value=calendarFormDraft.year;$('#jump-month').value=calendarFormDraft.month;}else calendarFormDraft=null;if(!calendarPickerOpen)$('#calendar-month-value').textContent=Number($('#jump-month').value||month.slice(5))+'月';}
function setMonthDraft(value,scroll=false){
 calendarDraft=Math.max(1,Math.min(12,value));for(const button of calendarWheel.querySelectorAll('button')){const active=Number(button.dataset.month)===calendarDraft;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));}calendarWheel.setAttribute('aria-activedescendant','calendar-option-'+calendarDraft);
 if(scroll){calendarWheelSyncUntil=performance.now()+280;calendarWheel.scrollTo({top:(calendarDraft-1)*calendarRow,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
}
function placeMonthPicker(){const anchor=calendarTrigger.getBoundingClientRect(),width=178,height=calendarCard.getBoundingClientRect().height||210,left=Math.max(12,Math.min(innerWidth-width-12,anchor.x+anchor.width/2-width/2)),top=anchor.bottom+8+height<=innerHeight-12?anchor.bottom+8:Math.max(12,anchor.top-height-8);document.documentElement.style.setProperty('--calendar-picker-left',left+'px');document.documentElement.style.setProperty('--calendar-picker-top',top+'px');}
function openMonthPicker(){
 calendarDraft=Number($('#jump-month').value||month.slice(5));calendarCard.hidden=false;calendarPickerOpen=true;calendarTrigger.setAttribute('aria-expanded','true');if(calendarCard.showPopover)calendarCard.showPopover();setMonthDraft(calendarDraft);calendarWheelSyncUntil=performance.now()+120;calendarWheel.scrollTo({top:(calendarDraft-1)*calendarRow,behavior:'instant'});placeMonthPicker();calendarWheel.focus({preventScroll:true});
}
function closeMonthPicker(focus=false){clearTimeout(calendarWheelTimer);calendarPickerOpen=false;calendarTrigger.setAttribute('aria-expanded','false');if(calendarCard.hidePopover&&calendarCard.matches(':popover-open'))calendarCard.hidePopover();calendarCard.hidden=true;if(focus)calendarTrigger.focus({preventScroll:true});}
function rememberMonthForm(){calendarFormDraft={base:month,year:$('#jump-year').value,month:$('#jump-month').value};}
$('#month-jump').addEventListener('input',rememberMonthForm);
$('#month-jump').addEventListener('submit',()=>{calendarFormDraft=null;closeMonthPicker();});
calendarTrigger.onclick=()=>calendarPickerOpen?closeMonthPicker():openMonthPicker();
$('#calendar-month-cancel').onclick=()=>closeMonthPicker(true);
$('#calendar-month-confirm').onclick=()=>{if(performance.now()>=calendarWheelSyncUntil)setMonthDraft(Math.round(calendarWheel.scrollTop/calendarRow)+1);$('#jump-month').value=String(calendarDraft).padStart(2,'0');$('#calendar-month-value').textContent=calendarDraft+'月';rememberMonthForm();closeMonthPicker(true);};
calendarCard.addEventListener('toggle',event=>{if(event.newState==='closed'){calendarPickerOpen=false;calendarTrigger.setAttribute('aria-expanded','false');calendarCard.hidden=true;}});
calendarWheel.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();if(Math.abs(event.deltaY)<4||performance.now()<calendarWheelLock)return;calendarWheelLock=performance.now()+160;setMonthDraft(calendarDraft+(event.deltaY>0?1:-1),true);},{passive:false});
calendarWheel.addEventListener('scroll',()=>{if(!calendarPickerOpen||performance.now()<calendarWheelSyncUntil)return;clearTimeout(calendarWheelTimer);calendarWheelTimer=setTimeout(()=>{if(calendarPickerOpen&&performance.now()>=calendarWheelSyncUntil)setMonthDraft(Math.round(calendarWheel.scrollTop/calendarRow)+1);},120);},{passive:true});
calendarWheel.addEventListener('touchstart',()=>{calendarWheelSyncUntil=0;},{passive:true});
calendarWheel.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#calendar-month-confirm').click();return;}const value={ArrowUp:calendarDraft-1,ArrowDown:calendarDraft+1,Home:1,End:12}[event.key];if(value===undefined)return;event.preventDefault();setMonthDraft(value,true);});
document.addEventListener('pointerdown',event=>{if(calendarPickerOpen&&!calendarCard.contains(event.target)&&!calendarTrigger.contains(event.target))closeMonthPicker();});
document.addEventListener('keydown',event=>{if(calendarPickerOpen&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeMonthPicker(true);}},true);
window.addEventListener('resize',()=>{if(calendarPickerOpen)placeMonthPicker();});
function hideCalendarHint(){clearTimeout(calendarHintTimer);calendarHintTimer=null;$('#calendar-month-hint').hidden=true;}
function showCalendarMemoryHint(memory){
 if(innerWidth>760||view!=='calendar'||!currentUser||$('#app').hidden)return;
 hideCalendarHint();$('#calendar-month-hint-text').textContent=memory.day.slice(5).replace('-','.')+' · '+memory.title;
 const hint=$('#calendar-month-hint');hint.hidden=false;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)hint.animate?.([{opacity:0},{opacity:1}],{duration:140,easing:'ease-out'});calendarHintTimer=setTimeout(()=>hideCalendarHint(),3000);
}
function renderCalendarDetails(){syncMonthPicker();queueCalendarLayout();}
function measureCalendarLayout(){
 calendarLayoutFrame=null;if(innerWidth>760||view!=='calendar'||$('#app').hidden)return;
 const root=document.documentElement,workspace=$('.workspace'),calendar=$('.calendar'),rows=Math.max(1,Math.ceil($('#grid').children.length/7)),fixed=calendar.querySelector('.toolbar').offsetHeight+calendar.querySelector('.week').offsetHeight+calendar.querySelector('footer').offsetHeight+2,available=workspace.clientHeight,cell=Math.max(38,Math.min(72,Math.floor((available-fixed)/rows)));
 const scroll=available<fixed+rows*38?'true':'false';if(root.dataset.calendarScroll!==scroll)root.dataset.calendarScroll=scroll;
 const bottom=$('#app').classList.contains('nav-bottom')?Math.max(24,innerHeight-$('.view-switch').getBoundingClientRect().top+12):24;
 for(const [name,value] of [['--calendar-rows',String(rows)],['--calendar-grid-cell',cell+'px'],['--calendar-date-size',(cell>=60?21:cell>=47?19:16)+'px'],['--calendar-date-line',(cell>=60?25:cell>=47?23:18)+'px'],['--calendar-note-size',(cell>=47?9:8)+'px'],['--calendar-note-line',(cell>=47?12:10)+'px'],['--calendar-cell-gap',(cell>=47?3:1)+'px'],['--calendar-cell-pad',(cell>=47?3:1)+'px'],['--calendar-marker-padding',(cell>=47?12:9)+'px'],['--calendar-hint-bottom',bottom+'px']])if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value);
}
function queueCalendarLayout(){if(calendarLayoutFrame===null)calendarLayoutFrame=requestAnimationFrame(measureCalendarLayout);}
new MutationObserver(queueCalendarLayout).observe($('#app'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-pressed']});
const calendarResize=new ResizeObserver(queueCalendarLayout);for(const node of [$('.workspace'),$('.toolbar'),$('.intro'),$('.view-switch')])calendarResize.observe(node);
window.addEventListener('resize',queueCalendarLayout);document.fonts.ready.then(queueCalendarLayout);
syncMonthPicker();queueCalendarLayout();if(currentUser)renderCalendarDetails();

