// Page rails live in the gutter; nested input and dialog scrollers stay local.
(()=>{
 if(!navigator.userAgent.includes('OurDaysAndroid/')||navigator.userAgent.includes('OurDaysHarmony/'))return;
 const entries=new Map();let frame=0,drag=null;
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
 function paint(){
  frame=0;
  let moving=false;
  for(const [node,entry] of entries){
   if(node.getAnimations?.().some(animation=>animation.playState==='running'))moving=true;
   const rect=node.getBoundingClientRect(),max=node.scrollHeight-node.clientHeight;
   if(node.closest('[hidden]')||max<=2||rect.height<45||!node.isConnected){entry.rail.hidden=true;continue;}
   const top=Math.max(0,rect.top)+10,bottom=Math.min(innerHeight,rect.bottom)-10,height=bottom-top;
   if(height<30){entry.rail.hidden=true;continue;}
   const length=Math.max(28,height*node.clientHeight/node.scrollHeight);entry.max=max;entry.travel=Math.max(0,height-length);entry.rail.hidden=false;
   entry.rail.style.cssText='left:'+Math.min(innerWidth-7,rect.right+3)+'px;top:'+top+'px;height:'+height+'px;';
   entry.thumb.style.cssText='height:'+length+'px;top:'+(Math.max(0,Math.min(max,node.scrollTop))*entry.travel/max)+'px;';
  }
  if(moving)schedule();
 }
 const sizes=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 for(const node of new Set([document.scrollingElement,...document.querySelectorAll('[data-page-scroll]')])){
  const rail=document.createElement('div'),thumb=document.createElement('i');rail.className='page-scrollbar';rail.setAttribute('aria-hidden','true');rail.hidden=true;rail.append(thumb);document.body.append(rail);
  const entry={rail,thumb,max:0,travel:0};entries.set(node,entry);sizes?.observe(node);for(const child of node.children)sizes?.observe(child);
  thumb.addEventListener('pointerdown',event=>{event.preventDefault();thumb.setPointerCapture(event.pointerId);drag={node,entry,id:event.pointerId,y:event.clientY,offset:node.scrollTop};});
  thumb.addEventListener('pointermove',event=>{if(drag?.entry!==entry||drag.id!==event.pointerId)return;event.preventDefault();node.scrollTop=Math.max(0,Math.min(entry.max,drag.offset+(event.clientY-drag.y)*entry.max/Math.max(1,entry.travel)));schedule();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])thumb.addEventListener(name,()=>{if(drag?.entry===entry)drag=null;});
 }
 new MutationObserver(schedule).observe(document.querySelector('#app'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','data-main-view']});
 document.addEventListener('scroll',schedule,{capture:true,passive:true});window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);document.addEventListener('load',schedule,{capture:true,passive:true});
 document.documentElement.classList.add('page-scrollbars-ready');schedule();
})();
