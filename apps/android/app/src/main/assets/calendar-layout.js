(()=>{
 if(window!==window.top||!navigator.userAgent.includes('OurDaysAndroid/')||navigator.userAgent.includes('OurDaysHarmony/'))return;
 if(window.__ourdaysAndroidCalendarRefresh){window.__ourdaysAndroidCalendarRefresh();return;}
 const root=document.documentElement,observed=new WeakSet();let frame=0;
 const set=(name,value)=>{if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value);};
 let stylesheet=document.getElementById('ourdays-android-calendar-style');
 if(!stylesheet){stylesheet=document.createElement('link');stylesheet.id='ourdays-android-calendar-style';stylesheet.rel='stylesheet';stylesheet.href=location.origin+'/__ourdays_android__/calendar-layout.css?build='+window.__ourdaysAndroidCalendarBuild;(document.head||root).append(stylesheet);}
 function measure(){
  frame=0;
  const app=document.querySelector('#app'),workspace=app?.querySelector('.workspace');
  const active=!!(stylesheet.sheet&&matchMedia('(max-width:760px)').matches&&app&&!app.hidden&&workspace&&!workspace.hidden&&app.querySelector('#calendar-view')?.getAttribute('aria-pressed')==='true');
  if(!active){root.removeAttribute('data-android-calendar-fit');return;}
  if(root.getAttribute('data-android-calendar-fit')!=='true')root.setAttribute('data-android-calendar-fit','true');
  const native=window.__ourdaysAndroidCalendarViewport;
  const nativeHeight=native?.width>0?native.height*innerWidth/native.width:innerHeight;
  const height=Math.floor(Math.min(innerHeight,window.visualViewport?.height||innerHeight,nativeHeight));
  set('--android-calendar-viewport',height+'px');
  const nav=app.querySelector('.view-switch'),calendar=workspace.querySelector('.calendar'),grid=calendar?.querySelector('.grid');
  if(!nav||!grid)return;
  set('--android-calendar-nav-height',Math.ceil(nav.getBoundingClientRect().height)+'px');
  if(root.scrollTop)root.scrollTop=0;if(document.body.scrollTop)document.body.scrollTop=0;if(app.scrollTop)app.scrollTop=0;
  const visible=node=>node&&!node.hidden&&getComputedStyle(node).display!=='none';
  const outerHeight=node=>{if(!visible(node))return 0;const css=getComputedStyle(node);return node.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);};
  const bottom=app.classList.contains('nav-bottom')?Math.min(height,nav.getBoundingClientRect().top):height;
  const available=Math.max(0,Math.floor(bottom-workspace.getBoundingClientRect().top-outerHeight(app.querySelector(':scope>.bottom'))-outerHeight(app.querySelector(':scope>#status'))-4));
  set('--android-calendar-height',available+'px');
  set('--android-calendar-rows',String(Math.max(1,Math.ceil(grid.children.length/7))));
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
 const sizes=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 const refresh=()=>{
  for(const node of document.querySelectorAll('#app,.app-topbar,.intro,.view-switch,.calendar>.toolbar,.calendar>.week,.calendar>footer,.calendar-note,#app>.bottom,#app>#status')){
   if(!observed.has(node)){observed.add(node);sizes?.observe(node);}
  }
  // Apply the initial/view state even when an idle WebView defers animation frames.
  if(frame){cancelAnimationFrame(frame);frame=0;}
  measure();
 };
 new MutationObserver(refresh).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-pressed','class']});
 stylesheet.addEventListener('load',refresh);
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
 window.addEventListener('ourdays-android-viewport',schedule);
 document.fonts?.ready.then(schedule);
 window.__ourdaysAndroidCalendarRefresh=refresh;refresh();
})();
