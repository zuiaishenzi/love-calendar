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
