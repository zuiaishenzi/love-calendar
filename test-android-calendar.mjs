import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const source=readFileSync('apps/android/app/src/main/assets/calendar-layout.js','utf8');
function fixture({agent='OurDaysAndroid/10809',sheet=true,bottom=true}={}){
 const attributes=new Map(),variables=new Map(),events={},styles={},state={calendar:true,hidden:false,rows:6};
 const root={scrollTop:80,getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),style:{getPropertyValue:key=>variables.get(key),setProperty:(key,value)=>variables.set(key,value)}};
 const link={sheet:sheet?{}:null,addEventListener:(name,fn)=>styles[name]=fn};
 const grid={get children(){return Array(state.rows*7).fill({});}};
 const calendar={querySelector:()=>grid};
 const workspace={get hidden(){return state.hidden;},getBoundingClientRect:()=>({top:140}),querySelector:()=>calendar};
 const nav={getBoundingClientRect:()=>({height:65,top:475})};
 const nodes={'.workspace':workspace,'#calendar-view':{getAttribute:()=>String(state.calendar)},'.view-switch':nav,':scope>.bottom':{hidden:false,getBoundingClientRect:()=>({height:20})}};
 const app={hidden:false,scrollTop:30,classList:{contains:()=>bottom},querySelector:name=>nodes[name]};
 const window={top:null,visualViewport:{height:540,addEventListener:()=>{}},__ourdaysAndroidCalendarViewport:{width:1080,height:1620},addEventListener:(name,fn)=>events[name]=fn};window.top=window;
 let changed;
 const context={window,navigator:{userAgent:agent},location:{origin:'https://love.11215739.xyz:11961'},document:{documentElement:root,body:{scrollTop:20},getElementById:()=>link,querySelector:()=>app,querySelectorAll:()=>[]},matchMedia:()=>({matches:true}),innerWidth:360,innerHeight:640,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},MutationObserver:class{constructor(fn){changed=fn;}observe(){}},getComputedStyle:()=>({display:'block',marginTop:'0',marginBottom:'0'})};
 new Script(source).runInNewContext(context);
 return {root,link,variables,attributes,styles,state,window,app,context,refresh:()=>changed()};
}

test('Android日历初次加载不依赖动画帧，按实际视口与导航容纳四五六行',()=>{
 for(const bottom of [true,false]){
  const f=fixture({bottom});
  assert.equal(f.attributes.get('data-android-calendar-fit'),'true');
  assert.equal(f.variables.get('--android-calendar-viewport'),'540px');
  assert.equal(f.variables.get('--android-calendar-height'),bottom?'311px':'376px');
  assert.equal(f.root.scrollTop,0);assert.equal(f.app.scrollTop,0);
  for(const rows of [4,5,6]){f.state.rows=rows;f.refresh();assert.equal(f.variables.get('--android-calendar-rows'),String(rows));}
  const refresh=f.window.__ourdaysAndroidCalendarRefresh;
  new Script(source).runInNewContext(f.context);assert.equal(f.window.__ourdaysAndroidCalendarRefresh,refresh);
 }
});

test('Android日历等待同源样式实际加载；其他页面与退出登录恢复原滚动',()=>{
 const f=fixture({sheet:false});assert.equal(f.attributes.has('data-android-calendar-fit'),false);
 f.link.sheet={};f.styles.load();assert.equal(f.attributes.get('data-android-calendar-fit'),'true');
 f.state.calendar=false;f.state.hidden=true;f.refresh();assert.equal(f.attributes.has('data-android-calendar-fit'),false);
 f.state.calendar=true;f.state.hidden=false;f.refresh();assert.equal(f.attributes.get('data-android-calendar-fit'),'true');
 f.app.hidden=true;f.refresh();assert.equal(f.attributes.has('data-android-calendar-fit'),false);
});

test('Android原生日历适配不作用于浏览器或鸿蒙兼容标记',()=>{
 for(const agent of ['Mozilla/5.0','OurDaysHarmony/10813 OurDaysAndroid/10808']){
  const f=fixture({agent});assert.equal(f.window.__ourdaysAndroidCalendarRefresh,undefined);assert.equal(f.attributes.size,0);
 }
});

test('切月加载只显示浮层，旧请求完成不隐藏新请求提示或覆盖月份',async()=>{
 const app=readFileSync('public/app.js','utf8'),code=app.slice(app.indexOf('function animateCalendarMonth('),app.indexOf('function scheduleHolidayRefresh(')),nodes=new Map(),pending=[],renders=[];
 const context={view:'calendar',month:'2026-11',loadVersion:0,holidayRefreshTimer:null,calendarMonthAnimation:null,currentUser:{id:1},clearTimeout(){},matchMedia:()=>({matches:true}),$:selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:true,textContent:''});return nodes.get(selector);},api:url=>new Promise(resolve=>pending.push({url,resolve})),render:()=>renders.push(context.month),scheduleHolidayRefresh(){}};
 context.waitForCalendarGesture=async()=>{};
 const load=new Script(code+';load').runInNewContext(context),first=load();assert.equal(nodes.get('#calendar-load-hint').hidden,false);assert.equal(nodes.get('#status').textContent,'');
 context.month='2026-12';const second=load();const resolve=entry=>entry.resolve(entry.url.startsWith('/api/calendar')?{days:[]}:[]);
 pending.slice(0,4).forEach(resolve);await first;assert.equal(nodes.get('#calendar-load-hint').hidden,false);assert.deepEqual(renders,[]);
 pending.slice(4).forEach(resolve);await second;assert.equal(nodes.get('#calendar-load-hint').hidden,true);assert.deepEqual(renders,['2026-12']);
});

test('后台日历刷新等待手势结束，新请求取代旧请求时立即退出等待',async()=>{
 const app=readFileSync('public/app.js','utf8'),code=app.slice(app.indexOf('async function waitForCalendarGesture('),app.indexOf('function animateCalendarMonth(')),ticks=[],context={view:'calendar',loadVersion:1,hubPull:{},updateCalendarHub(){},$:()=>({style:{}}),setTimeout:fn=>ticks.push(fn)};
 const wait=new Script(code+';waitForCalendarGesture').runInNewContext(context);let done=false;const first=wait(1).then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);context.hubPull=null;ticks.shift()();await first;assert.equal(done,true);
 context.hubPull={};const stale=wait(1);context.loadVersion=2;ticks.shift()();await stale;assert.equal(ticks.length,0);
});

test('日历横向拖动按动画帧跟手，取消回弹，不触发切月',()=>{
 const app=readFileSync('public/app.js','utf8'),handlers={},frames=new Map(),surface={style:{},getAnimations:()=>[],animate:()=>({finished:Promise.resolve()})},grid={clientWidth:360,querySelector:()=>surface,addEventListener:(name,fn)=>handlers[name]=fn,setPointerCapture(){}},moves=[];let id=0;
 const bind=new Script(app.slice(app.indexOf('function calendarSwipe(grid){'),app.indexOf("calendarSwipe($('.calendar'))"))+';calendarSwipe').runInNewContext({view:'calendar',month:'2026-11',document:{querySelector:()=>null},move:delta=>moves.push(delta),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key)});bind(grid);
 const event=(x,y)=>({pointerType:'touch',pointerId:1,button:0,clientX:x,clientY:y});handlers.pointerdown(event(240,100));handlers.pointermove(event(200,102));handlers.pointermove(event(140,102));assert.equal(frames.size,1);frames.values().next().value();frames.clear();assert.match(surface.style.transform,/-28/);handlers.pointercancel(event(140,102));assert.equal(surface.style.transform,'');assert.equal(surface.style.willChange,'');assert.deepEqual(moves,[]);
});

test('手机日历和约定均在顶部下拉切换，松手与取消立即隐藏提示',()=>{
 const source=readFileSync('public/calendar-agreements.js','utf8'),nodes=new Map(),events={},timers=new Map(),switches=[];let time=0;
 class Target{closest(){return null;}}
 const target=new Target(),scroll={scrollHeight:600,scrollTop:0},context={view:'calendar',navigator:{userAgent:'OurDaysAndroid/10809'},Element:Target,innerHeight:800,getComputedStyle:()=>({overflowY:'visible'}),performance:{now:()=>time},setTimeout:fn=>{timers.set(timers.size+1,fn);return timers.size;},clearTimeout:id=>timers.delete(id),document:{body:{dataset:{}},scrollingElement:scroll,querySelector:()=>null,addEventListener(){}},window:{addEventListener(){}},$:selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:true,textContent:'',classList:{toggle(){}},addEventListener:(name,fn)=>events[name]=fn});return nodes.get(selector);},switchView:next=>{switches.push(next);context.view=next;}};
 new Script(source).runInNewContext(context);
 const start=()=>events.touchstart({touches:[{clientX:100,clientY:100}],target}),drag=y=>events.touchmove({touches:[{clientX:100,clientY:y}],preventDefault(){}}),hint=()=>nodes.get('#calendar-pull-hint');
 start();drag(140);assert.equal(hint().hidden,false);events.touchend();assert.equal(hint().hidden,true);assert.deepEqual(switches,[]);
 start();drag(220);events.touchend();assert.equal(hint().hidden,true);assert.deepEqual(switches,['agreements']);time+=1000;
 start();drag(30);events.touchend();assert.deepEqual(switches,['agreements']);
 start();drag(220);events.touchend();assert.equal(hint().hidden,true);assert.deepEqual(switches,['agreements','calendar']);time+=1000;
 scroll.scrollHeight=1000;scroll.scrollTop=100;start();drag(220);events.touchend();assert.deepEqual(switches,['agreements','calendar']);
 scroll.scrollTop=0;start();drag(140);events.touchcancel();assert.equal(hint().hidden,true);assert.deepEqual(switches,['agreements','calendar']);
});
