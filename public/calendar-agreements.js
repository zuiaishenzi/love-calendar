// Mobile clients keep the pull gesture; browser and Windows use main navigation.
const calendarHubPlatform=/OurDays(?:Android|Harmony)\//.test(navigator.userAgent)?'mobile':/OurDaysWindows\//.test(navigator.userAgent)?'desktop':'web';
let hubLockedUntil=0,hubPull=null,hubSuppressClickUntil=0,hubHintTimer=null;
const hubNow=()=>performance.now();
function hideHubHint(){clearTimeout(hubHintTimer);hubHintTimer=null;$('#calendar-pull-hint').hidden=true;}
function showHubHint(text,ready=false){const hint=$('#calendar-pull-hint');hint.textContent=text;hint.classList.toggle('ready',ready);hint.hidden=false;if(!hubHintTimer)hubHintTimer=setTimeout(hideHubHint,3000);}
function updateCalendarHub(){
 const mode=calendarHubPlatform;document.body.dataset.calendarHubPlatform=mode;
 $('#calendar-hub-switcher').hidden=true;if(mode==='mobile'&&view==='agreements')$('#calendar-view').setAttribute('aria-pressed','true');
 if(!['calendar','agreements'].includes(view))hideHubHint();
}
if(calendarHubPlatform!=='mobile')$('.view-switch').insertBefore($('#agreements-open'),$('#chat-open'));
$('#calendar-hub-calendar').onclick=()=>switchView('calendar');
const hubDialogOpen=()=>Boolean(document.querySelector('dialog[open]'));
function hubGestureTarget(target){return target instanceof Element&&!target.closest('input,textarea,select,a,nav,#calendar-hub-switcher,#day-detail,button:not(.day),.agreement-check,.agreement-card-footer');}
function hubScrollRoom(target,delta){
 for(let node=target instanceof Element?target:null;node&&node!==document.body;node=node.parentElement){const css=getComputedStyle(node);if(/auto|scroll/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+2&&(delta>0?node.scrollTop+node.clientHeight<node.scrollHeight-2:node.scrollTop>2))return true;}
 const page=document.scrollingElement;return page.scrollHeight>innerHeight+2&&(delta>0?page.scrollTop+innerHeight<page.scrollHeight-2:page.scrollTop>2);
}
function hubSwitch(next){hubLockedUntil=hubNow()+650;hideHubHint();switchView(next);}
function startHubPull(x,y,target){
 if(calendarHubPlatform!=='mobile'||!['calendar','agreements'].includes(view)||hubDialogOpen()||!hubGestureTarget(target)||hubNow()<hubLockedUntil)return;
 if(hubScrollRoom(target,-1))return;
 hubPull={x,y,view,distance:0};
}
function moveHubPull(x,y,event){
 if(!hubPull)return;if(hubPull.view!==view||hubDialogOpen()){endHubPull(false);return;}
 const dx=x-hubPull.x,dy=y-hubPull.y,distance=dy;
 if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){endHubPull(false);return;}
 if(distance<0){endHubPull(false);return;}
 hubPull.distance=distance;if(distance<10)return;event.preventDefault();
 const ready=distance>=90;showHubHint(ready?(view==='calendar'?'松开，看看我们想一起做的事 ♡':'松开，返回日历'):(view==='calendar'?'继续下拉，看看我们想一起做的事。':'继续下拉，返回日历。'),ready);
}
function endHubPull(commit){
 const gesture=hubPull;hubPull=null;hideHubHint();
 if(gesture&&gesture.distance>=10)hubSuppressClickUntil=hubNow()+700;
 if(commit&&gesture&&gesture.distance>=90){hubSwitch(gesture.view==='calendar'?'agreements':'calendar');}
}
$('#app').addEventListener('touchstart',event=>{if(event.touches.length!==1){endHubPull(false);return;}const t=event.touches[0];startHubPull(t.clientX,t.clientY,event.target);},{passive:true});
$('#app').addEventListener('touchmove',event=>{if(event.touches.length!==1){endHubPull(false);return;}const t=event.touches[0];moveHubPull(t.clientX,t.clientY,event);},{passive:false});
$('#app').addEventListener('touchend',()=>endHubPull(true));$('#app').addEventListener('touchcancel',()=>endHubPull(false));
$('#app').addEventListener('click',event=>{if(hubNow()<hubSuppressClickUntil){event.preventDefault();event.stopPropagation();}},true);
window.addEventListener('blur',()=>{endHubPull(false);hideHubHint();});document.addEventListener('visibilitychange',()=>{if(document.hidden){endHubPull(false);hideHubHint();}});
updateCalendarHub();
