// Native interception serves this same-origin resource under the server's CSP.
export const HARMONY_STYLE_PATH: string = '/__ourdays_harmony__/appearance.css';

// Explicit view markers also support older deployed pages and WebView kernels.
export const HARMONY_APPEARANCE: string = `
#client-downloads,#android-update-entry{display:none!important}
#chat-native-record,#chat-native-cancel{touch-action:none!important;-webkit-user-drag:none!important;user-select:none!important;-webkit-touch-callout:none!important}
html.harmony-shell,body.harmony-app{background:#faf8f7;scrollbar-gutter:auto}
html.harmony-shell,body.harmony-app,body.harmony-app *{overscroll-behavior:none!important}
@media(max-width:760px){
 html.harmony-shell[data-harmony-logged-in="true"],html.harmony-shell[data-harmony-logged-in="true"] body.harmony-app{height:var(--ourdays-viewport-height,100dvh)!important;min-height:0!important;overflow:hidden!important}
 body.harmony-app #app:not([hidden]){height:var(--ourdays-viewport-height,100dvh)!important;min-height:0!important;display:flex!important;flex-direction:column;overflow:hidden!important;padding-top:0!important;padding-bottom:0!important}
 body.harmony-app #app:not([hidden]).nav-bottom{padding-bottom:var(--ourdays-nav-height,47px)!important}
 body.harmony-app #app>.app-topbar{flex:none}
 body.harmony-app #app.nav-bottom>.app-topbar{padding-bottom:0}
 body.harmony-app #app.nav-bottom .app-topbar>.view-switch{position:fixed;top:auto;left:0;right:0;bottom:max(0px,calc(100dvh - var(--ourdays-viewport-height,100dvh)))!important;padding:1px 10px calc(1px + env(safe-area-inset-bottom,0px))!important}
 body.harmony-app #app.nav-bottom .app-topbar>.view-switch button{min-height:44px!important;gap:2px!important;padding:1px 0!important}
 body.harmony-app #app.nav-bottom .tab-icon{height:24px!important}
 body.harmony-app #app[data-harmony-view="calendar"]>.intro{flex:none;padding:8px 2px!important}
 body.harmony-app #app[data-harmony-view="calendar"] .workspace{flex:1 1 0!important;min-height:0!important;height:var(--ourdays-calendar-height,auto);grid-template-columns:minmax(0,1fr);align-items:stretch;overflow:hidden}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar{height:var(--ourdays-calendar-height,100%)!important;max-height:100%;min-height:0!important;display:flex;flex-direction:column}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar .grid{height:var(--ourdays-grid-height,auto);flex:1 1 0!important;min-height:0!important;grid-template-rows:repeat(var(--ourdays-calendar-rows,6),minmax(0,1fr))!important;grid-auto-rows:minmax(0,1fr)}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar :is(.day,.blank){min-height:0!important;aspect-ratio:auto!important;padding:4px;gap:2px;overflow:hidden}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar :is(.toolbar,.week,footer,.calendar-note){flex:none}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar-note{margin:0;padding-bottom:5px}
 body.harmony-app #app>.bottom{flex:none;margin:4px 0;font-size:9px}
 body.harmony-app #app>#status{flex:none;margin:0;font-size:12px}
 body.harmony-app #app>#status:empty{display:none}
 body.harmony-app #app:not([data-harmony-view="calendar"])>.intro,body.harmony-app #app:not([data-harmony-view="calendar"])>.bottom{display:none}
 body.harmony-app #app[data-harmony-view="memos"] #memos-dialog.main-view,body.harmony-app #app[data-harmony-view="memoir"] #memoir{flex:1 1 0!important;min-height:0!important;height:0;overflow-x:hidden;overflow-y:auto!important;touch-action:pan-y pinch-zoom;-webkit-overflow-scrolling:touch;overscroll-behavior:none;width:100%;margin-top:0;margin-bottom:0;border-radius:16px;clip-path:inset(0 round 16px)}
 body.harmony-app #app[data-harmony-view="chat"] #chat-dialog.main-view{flex:1 1 0!important;min-height:0!important;height:0;margin-bottom:0}
}
@media(max-width:760px) and (max-height:680px){
 body.harmony-app #app[data-harmony-view="calendar"]>.intro{padding:5px 2px!important}
 body.harmony-app #app[data-harmony-view="calendar"]>.intro p{font-size:11px;line-height:1.4}
 body.harmony-app #app[data-harmony-view="calendar"] #home-quote{font-size:18px!important;line-height:1.35!important}
 body.harmony-app #app[data-harmony-view="calendar"] .toolbar{padding:6px 8px!important;gap:4px}
 body.harmony-app #app[data-harmony-view="calendar"] .toolbar h2{font-size:21px}
 body.harmony-app #app[data-harmony-view="calendar"] .week{padding:6px 0}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar footer{padding:6px 8px}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar :is(.day,.blank){padding:2px 4px;gap:1px}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar .day span{font-size:15px;line-height:18px}
 body.harmony-app #app[data-harmony-view="calendar"] .calendar .day small{font-size:9px;line-height:11px}
}
@media(max-width:760px) and (max-height:600px){
 body.harmony-app #app[data-harmony-view="calendar"]>.intro,body.harmony-app #app[data-harmony-view="calendar"]>.bottom{display:none!important}
}
:root.harmony-scrollbars-ready,:root.harmony-scrollbars-ready body,:root.harmony-scrollbars-ready body *{scrollbar-width:none!important;scrollbar-gutter:auto!important}
:root.harmony-scrollbars-ready::-webkit-scrollbar,:root.harmony-scrollbars-ready body::-webkit-scrollbar,:root.harmony-scrollbars-ready body *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
body.harmony-app .ourdays-scroll-layer{position:fixed;inset:0;width:100%;height:var(--ourdays-viewport-height,100dvh);contain:strict;overflow:hidden;pointer-events:none;z-index:2147483000;margin:0;padding:0;border:0}
body.harmony-app .ourdays-scrollbar{position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;border-radius:8px;background:#f5e3df;box-shadow:inset 0 0 0 1px #e8c9c333;pointer-events:none;overflow:hidden;user-select:none}
body.harmony-app .ourdays-scrollbar>i{display:block;position:absolute;box-sizing:border-box;margin:0;padding:0;border:1px solid #fff6f0;border-radius:8px;background:linear-gradient(180deg,#e7a9b2,#b96787);box-shadow:0 1px 3px #99566a30;pointer-events:auto;touch-action:none;cursor:grab}
body.harmony-app .ourdays-scrollbar>i:active{cursor:grabbing;background:linear-gradient(180deg,#d893a3,#a45273)}
`;

// Paint actual elements rather than relying on pseudo-element scrollbar support.
export const HARMONY_SCROLLBARS: string = `(()=>{
 if(typeof document.querySelector!=='function')return;
 const entries=new Map(),layers=new Map();let frame=0,needsScan=true,drag=null;
 const own=node=>node?.nodeType===1&&!!node.closest('.ourdays-scrollbar,.ourdays-scroll-layer');
 const schedule=(scan=false)=>{needsScan=needsScan||scan;if(!frame)frame=requestAnimationFrame(update);};
 const viewport=()=>({width:Math.min(innerWidth,window.visualViewport?.width||innerWidth),height:Math.min(innerHeight,window.visualViewport?.height||innerHeight,parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ourdays-viewport-height'))||innerHeight)});
 const scrollable=node=>{
  if(!node.isConnected||own(node)||!node.getClientRects().length)return false;
  if(node===document.scrollingElement)return !/hidden|clip/.test(getComputedStyle(node).overflowY);
  const css=getComputedStyle(node);
  return /auto|scroll|overlay/.test(css.overflowX+' '+css.overflowY);
 };
 const clip=node=>{
  const size=viewport(),root=node===document.scrollingElement;
  const rect=root?{top:0,left:0,right:size.width,bottom:size.height}:node.getBoundingClientRect();
  const bounds={top:Math.max(0,rect.top),left:Math.max(0,rect.left),right:Math.min(size.width,rect.right),bottom:Math.min(size.height,rect.bottom)};
  for(let parent=root?null:node.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
   const css=getComputedStyle(parent),r=parent.getBoundingClientRect();
   if(/hidden|clip|auto|scroll/.test(css.overflowY)){bounds.top=Math.max(bounds.top,r.top);bounds.bottom=Math.min(bounds.bottom,r.bottom);}
   if(/hidden|clip|auto|scroll/.test(css.overflowX)){bounds.left=Math.max(bounds.left,r.left);bounds.right=Math.min(bounds.right,r.right);}
  }
  return bounds;
 };
 const getLayer=host=>{
  let layer=layers.get(host);
  if(!layer){layer=document.createElement('div');layer.className='ourdays-scroll-layer';layer.setAttribute('aria-hidden','true');host.append(layer);layers.set(host,layer);}
  return layer;
 };
 const create=(node,axis)=>{
  const rail=document.createElement('div'),thumb=document.createElement('i');
  rail.className='ourdays-scrollbar';rail.dataset.axis=axis;rail.setAttribute('aria-hidden','true');rail.append(thumb);
  const host=node.closest('dialog[open]')||document.body,layer=getLayer(host);layer.append(rail);
  const bar={rail,thumb,host,layer,travel:0,max:0};
  thumb.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   event.preventDefault();event.stopPropagation();thumb.setPointerCapture(event.pointerId);
   drag={node,axis,bar,id:event.pointerId,start:axis==='y'?event.clientY:event.clientX,offset:axis==='y'?node.scrollTop:Math.abs(node.scrollLeft)};
  });
  thumb.addEventListener('pointermove',event=>{
   if(!drag||drag.bar!==bar||drag.id!==event.pointerId)return;
   event.preventDefault();event.stopPropagation();
   const delta=(axis==='y'?event.clientY:event.clientX)-drag.start;
   const value=Math.max(0,Math.min(bar.max,drag.offset+delta*bar.max/Math.max(1,bar.travel)));
   if(axis==='y')node.scrollTop=value;else node.scrollLeft=getComputedStyle(node).direction==='rtl'?-value:value;
   schedule();
  });
  const finish=()=>{if(drag?.bar===bar)drag=null;};
  thumb.addEventListener('pointerup',finish);thumb.addEventListener('pointercancel',finish);thumb.addEventListener('lostpointercapture',finish);
  return bar;
 };
 const remove=entry=>{for(const axis of ['x','y']){const bar=entry[axis];if(bar){if(drag?.bar===bar)drag=null;bar.rail.remove();}}};
 const paint=(node,entry,axis,bounds)=>{
  const vertical=axis==='y',client=vertical?node.clientHeight:node.clientWidth,total=vertical?node.scrollHeight:node.scrollWidth;
  const css=getComputedStyle(node),overflow=vertical?css.overflowY:css.overflowX,allowed=node===document.scrollingElement?!/hidden|clip/.test(overflow):/auto|scroll|overlay/.test(overflow);
  const max=total-client,span=(vertical?bounds.bottom-bounds.top:bounds.right-bounds.left)-16;
  let bar=entry[axis];
  if(!allowed||max<=2||span<28||bounds.right-bounds.left<20||bounds.bottom-bounds.top<20){if(bar)bar.rail.hidden=true;return;}
  if(!bar)bar=entry[axis]=create(node,axis);
  const host=node.closest('dialog[open]')||document.body;if(bar.host!==host){bar.layer=getLayer(host);bar.layer.append(bar.rail);bar.host=host;}
  bar.rail.hidden=false;
  const length=Math.min(span,Math.max(28,span*client/total)),offset=Math.min(max,Math.max(0,vertical?node.scrollTop:Math.abs(node.scrollLeft)));
  bar.max=max;bar.travel=span-length;
  const origin=bar.layer.getBoundingClientRect();
  const left=(vertical?bounds.right-9:bounds.left+8)-origin.left,top=(vertical?bounds.top+8:bounds.bottom-9)-origin.top;
  bar.rail.style.cssText='left:'+left+'px;top:'+top+'px;width:'+(vertical?5:span)+'px;height:'+(vertical?span:5)+'px;';
  bar.thumb.style.cssText='left:'+(vertical?0:bar.travel*offset/max)+'px;top:'+(vertical?bar.travel*offset/max:0)+'px;width:'+(vertical?5:length)+'px;height:'+(vertical?length:5)+'px;';
 };
 const sizes=typeof ResizeObserver==='function'?new ResizeObserver(()=>schedule(true)):null;
 function update(){
  frame=0;if(!document.body)return;
  if(needsScan){
   needsScan=false;
   const candidates=new Set([document.scrollingElement,...document.body.querySelectorAll('*')].filter(node=>node&&scrollable(node)&&(node.scrollHeight>node.clientHeight+2||node.scrollWidth>node.clientWidth+2)));
   for(const [node,entry] of entries){if(!candidates.has(node)){remove(entry);sizes?.unobserve(node);entries.delete(node);}}
   for(const node of candidates){if(!entries.has(node)){entries.set(node,{});sizes?.observe(node);}}
  }
  for(const [node,entry] of entries){const bounds=clip(node);paint(node,entry,'y',bounds);paint(node,entry,'x',bounds);}
  for(const [host,layer] of layers){if(!layer.children.length){layer.remove();layers.delete(host);}}
 }
 const init=()=>{
  if(!document.body)return;
  document.documentElement.classList.add('harmony-scrollbars-ready');
  sizes?.observe(document.body);
  schedule(true);
 };
 new MutationObserver(records=>{if(records.some(record=>!own(record.target)&&!(record.type==='childList'&&[...record.addedNodes,...record.removedNodes].every(own))))schedule(true);}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','data-harmony-view','data-harmony-logged-in']});
 document.addEventListener('scroll',event=>schedule(!entries.has(event.target===document?document.scrollingElement:event.target)),{capture:true,passive:true});
 document.addEventListener('input',()=>schedule(true),{capture:true,passive:true});
 document.addEventListener('load',()=>schedule(true),{capture:true,passive:true});
 window.addEventListener('resize',()=>schedule(true));
 window.addEventListener('ourdays-viewport',()=>schedule(true));
 window.visualViewport?.addEventListener('resize',()=>schedule(true));
 document.addEventListener('DOMContentLoaded',init,{once:true});
 document.fonts?.ready.then(()=>schedule(true));
 init();
})()`;

// Measure the rendered content, not an assumed phone or navigation-bar size.
export const HARMONY_LAYOUT: string = `(()=>{
 if(typeof document.querySelector!=='function')return;
 let frame=0;
 const observed=new WeakSet();
 const set=(node,name,value)=>{if(node.style.getPropertyValue(name)!==value)node.style.setProperty(name,value);};
 const measure=()=>{
  frame=0;
  const root=document.documentElement,app=document.querySelector('#app');if(!app)return;
  const attribute=(node,name,value)=>{if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
  attribute(root,'data-harmony-logged-in',String(!app.hidden));
  const view=app.querySelector('#calendar-view')?.getAttribute('aria-pressed')==='true'?'calendar':
   app.querySelector('#memos-dialog')?.hidden===false?'memos':app.querySelector('#memoir')?.hidden===false?'memoir':'chat';
  attribute(app,'data-harmony-view',view);
  if(window.innerWidth<=760&&!app.hidden){
   // Discard an outer scroll offset left by the legacy page before adaptation.
   if(root.scrollTop)root.scrollTop=0;
   if(document.body?.scrollTop)document.body.scrollTop=0;
   if(app.scrollTop)app.scrollTop=0;
  }
  const viewport=window.visualViewport;
  const native=window.__ourdaysViewport;
  const nativeHeight=native?.width>0?native.height*window.innerWidth/native.width:window.innerHeight;
  const height=Math.floor(Math.min(window.innerHeight,viewport?.height||window.innerHeight,nativeHeight));
  set(root,'--ourdays-viewport-height',height+'px');
  const nav=app.querySelector('.view-switch');
  if(nav)set(root,'--ourdays-nav-height',Math.ceil(nav.getBoundingClientRect().height)+'px');
  if(window.innerWidth>760||app.hidden||view!=='calendar')return;
  const workspace=app.querySelector('.workspace'),calendar=workspace?.querySelector('.calendar'),grid=calendar?.querySelector('.grid');
  if(!grid||!nav)return;
  const visible=node=>node&&!node.hidden&&getComputedStyle(node).display!=='none';
  const outerHeight=node=>{if(!visible(node))return 0;const css=getComputedStyle(node);return node.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);};
  const footer=app.querySelector(':scope>.bottom'),status=app.querySelector(':scope>#status');
  const bottom=app.classList.contains('nav-bottom')?Math.min(height,nav.getBoundingClientRect().top):height;
  const available=Math.max(0,Math.floor(bottom-workspace.getBoundingClientRect().top-outerHeight(footer)-outerHeight(status)-4));
  set(root,'--ourdays-calendar-height',available+'px');
  const css=getComputedStyle(calendar);
  const fixed=Array.from(calendar.children).filter(node=>node!==grid).reduce((total,node)=>total+outerHeight(node),0)+
    (parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0)+(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0);
  set(root,'--ourdays-grid-height',Math.max(0,Math.floor(available-fixed))+'px');
  set(root,'--ourdays-calendar-rows',String(Math.max(1,Math.ceil(grid.children.length/7))));
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
 const sizes=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 const refresh=()=>{
  for(const node of document.querySelectorAll('#app,.app-topbar,.intro,.view-switch,.calendar>.toolbar,.calendar>.week,.calendar>footer,.calendar-note,#app>.bottom,#app>#status')){
   if(!observed.has(node)){observed.add(node);sizes?.observe(node);}
  }
  schedule();
 };
 new MutationObserver(refresh).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-pressed','class']});
 window.addEventListener('resize',schedule);
 window.addEventListener('ourdays-viewport',schedule);
 window.visualViewport?.addEventListener('resize',schedule);
 document.addEventListener('DOMContentLoaded',refresh,{once:true});
 document.fonts?.ready.then(schedule);
 refresh();
})()`;

// Execute before the server's scripts, including older Android-only pages.
// This compatibility marker describes the shared UI/voice protocol, not the OS.
export const HARMONY_BOOTSTRAP: string = `(()=>{
  if(location.origin!=='https://love.11215739.xyz:11961'||window!==window.top)return;
  if(window.__ourdaysHarmonyBootstrap==='10813'){window.__ourdaysHarmonyRefresh?.();return;}
  let agent=navigator.userAgent;
  if(!agent.includes('OurDaysHarmony/'))agent+=' OurDaysHarmony/10813';
  if(!agent.includes('OurDaysAndroid/'))agent+=' OurDaysAndroid/10808';
  try{Object.defineProperty(navigator,'userAgent',{value:agent,configurable:true});}catch{}
  const hide=()=>{
    document.documentElement?.classList?.add('harmony-shell');
    document.body?.classList.add('harmony-app');
    if(document.getElementById('ourdays-harmony-style'))return;
    const style=document.createElement('link');style.id='ourdays-harmony-style';style.rel='stylesheet';
    style.href=location.origin+${JSON.stringify(HARMONY_STYLE_PATH)}+'?build=10813';
    if(document.documentElement)document.documentElement.append(style);
  };
  const selector='#chat-native-record,#chat-native-cancel',commands=new WeakMap();
  const protect=()=>{
    for(const node of document.querySelectorAll(selector)){
      const path=node.getAttribute('href');
      if(path!==null){
        if(['/app/record-voice','/app/finish-voice','/app/cancel-voice'].includes(path))commands.set(node,path);else commands.delete(node);
        node.removeAttribute('href');
      }
      node.draggable=false;
    }
  };
  document.addEventListener('dragstart',event=>{if(event.target.closest?.(selector)){event.preventDefault();event.stopPropagation();}},true);
  // Old pages navigate an anchor on click; retain their command only when the
  // page's hold-to-record handler has not prevented the click itself.
  document.addEventListener('click',event=>{
    const node=event.target.closest?.(selector);if(!node)return;
    const command=commands.get(node);if(!command)return;
    queueMicrotask(()=>{if(!event.defaultPrevented)window.location.href=command;});
  },true);
  new MutationObserver(protect).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
  hide();protect();document.addEventListener('DOMContentLoaded',()=>{hide();protect();},{once:true});
  ${HARMONY_LAYOUT};
  ${HARMONY_SCROLLBARS};
  window.__ourdaysHarmonyRefresh=()=>{hide();protect();window.dispatchEvent(new Event('ourdays-viewport'));};
  window.__ourdaysHarmonyBootstrap='10813';
})()`;
