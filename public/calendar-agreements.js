// This switch belongs to the calendar: no fifth main navigation item.
const calendarHubPlatform=/OurDays(?:Android|Harmony)\//.test(navigator.userAgent)?'mobile':/OurDaysWindows\//.test(navigator.userAgent)?'desktop':'web';
let hubWheel={sum:0,time:0},hubLockedUntil=0,hubPull=null,hubSuppressClickUntil=0;
const hubNow=()=>performance.now();
function updateCalendarHub(){
 const mode=calendarHubPlatform;document.body.dataset.calendarHubPlatform=mode;
 $('#calendar-hub-hint').textContent=mode==='mobile'?(view==='agreements'?'清单到底后，上滑返回月历。':'下拉，看看我们想一起做的事。'):mode==='desktop'?(view==='agreements'?'滚动到顶部，再向上滚动返回月历。':'向下滚动，打开我们的约定。'):'把想一起做的事，也放进日历里。';
 if(!['calendar','agreements'].includes(view))$('#calendar-pull-hint').hidden=true;
}
$('#calendar-hub-calendar').onclick=()=>switchView('calendar');
const hubDialogOpen=()=>Boolean(document.querySelector('dialog[open]'));
function hubGestureTarget(target){return target instanceof Element&&!target.closest('input,textarea,select,a,nav,#calendar-hub-switcher,#day-detail,button:not(.day),.agreement-check,.agreement-card-footer');}
function hubScrollRoom(target,delta){
 for(let node=target instanceof Element?target:null;node&&node!==document.body;node=node.parentElement){const css=getComputedStyle(node);if(/auto|scroll/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+2&&(delta>0?node.scrollTop+node.clientHeight<node.scrollHeight-2:node.scrollTop>2))return true;}
 const page=document.scrollingElement;return page.scrollHeight>innerHeight+2&&(delta>0?page.scrollTop+innerHeight<page.scrollHeight-2:page.scrollTop>2);
}
function hubSwitch(next){hubLockedUntil=hubNow()+650;hubWheel={sum:0,time:0};$('#calendar-pull-hint').hidden=true;switchView(next);}
$('#app').addEventListener('wheel',event=>{
 if(calendarHubPlatform!=='desktop'||!['calendar','agreements'].includes(view)||hubDialogOpen()||event.ctrlKey||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!hubGestureTarget(event.target))return;
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1),direction=view==='calendar'?1:-1;
 if(Math.sign(delta)!==direction||hubScrollRoom(event.target,delta)){hubWheel={sum:0,time:0};return;}
 event.preventDefault();if(hubNow()<hubLockedUntil)return;
 if(hubNow()-hubWheel.time>230||Math.sign(hubWheel.sum)!==Math.sign(delta))hubWheel.sum=0;
 hubWheel.sum+=delta;hubWheel.time=hubNow();if(Math.abs(hubWheel.sum)>=110)hubSwitch(view==='calendar'?'agreements':'calendar');
},{passive:false});
function startHubPull(x,y,target){
 if(calendarHubPlatform!=='mobile'||!['calendar','agreements'].includes(view)||hubDialogOpen()||!hubGestureTarget(target)||hubNow()<hubLockedUntil)return;
 const delta=view==='calendar'?-1:1;
 if(hubScrollRoom(target,delta))return;
 hubPull={x,y,view,distance:0};
}
function moveHubPull(x,y,event){
 if(!hubPull)return;if(hubPull.view!==view||hubDialogOpen()){endHubPull(false);return;}
 const dx=x-hubPull.x,dy=y-hubPull.y,distance=hubPull.view==='calendar'?dy:-dy;
 if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){endHubPull(false);return;}
 if(distance<0){endHubPull(false);return;}
 hubPull.distance=distance;if(distance<10)return;event.preventDefault();
 const ready=distance>=90,hint=$('#calendar-pull-hint');hint.hidden=false;hint.classList.toggle('ready',ready);hint.textContent=ready?(view==='calendar'?'松开，打开我们的约定 ♡':'松开，返回月历'):(view==='calendar'?'再往下拉一点，看看我们的约定':'继续上滑，返回月历');
}
function endHubPull(commit){
 const gesture=hubPull;hubPull=null;$('#calendar-pull-hint').hidden=true;
 if(gesture&&gesture.distance>=10)hubSuppressClickUntil=hubNow()+700;
 if(commit&&gesture&&gesture.distance>=90){hubSwitch(gesture.view==='calendar'?'agreements':'calendar');}
}
$('#app').addEventListener('touchstart',event=>{if(event.touches.length!==1){endHubPull(false);return;}const t=event.touches[0];startHubPull(t.clientX,t.clientY,event.target);},{passive:true});
$('#app').addEventListener('touchmove',event=>{if(event.touches.length!==1){endHubPull(false);return;}const t=event.touches[0];moveHubPull(t.clientX,t.clientY,event);},{passive:false});
$('#app').addEventListener('touchend',()=>endHubPull(true));$('#app').addEventListener('touchcancel',()=>endHubPull(false));
$('#app').addEventListener('click',event=>{if(hubNow()<hubSuppressClickUntil){event.preventDefault();event.stopPropagation();}},true);
window.addEventListener('blur',()=>endHubPull(false));document.addEventListener('visibilitychange',()=>{if(document.hidden)endHubPull(false);});
updateCalendarHub();
