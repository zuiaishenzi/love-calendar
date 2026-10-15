// Optional browser QA: set OURDAYS_PLAYWRIGHT_MODULE when Playwright is bundled elsewhere.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.OURDAYS_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'apps/android/app/src/main/assets');
const css=fs.readFileSync(path.join(assets,'calendar-layout.css'),'utf8');
const script=fs.readFileSync(path.join(assets,'calendar-layout.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const policy=fs.readFileSync(path.join(root,'server.mjs'),'utf8').match(/res\.setHeader\('Content-Security-Policy',"([^"]+)"\)/)?.[1];
if(!policy)throw Error('Production CSP header not found');
const origin='https://love.11215739.xyz:11961';

(async()=>{
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 let cases=0;
 try{
  for(const [width,height] of [[360,540],[360,640],[393,736],[412,825],[430,932]]){
   for(const bottom of [false,true]){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 OurDaysAndroid/10809'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
     const url=new URL(route.request().url());
     if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':policy},body:html});
     if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(root,'public/style.css'),'utf8')});
     if(url.pathname==='/__ourdays_android__/calendar-layout.css')return route.fulfill({contentType:'text/css',headers:{'Cache-Control':'no-store'},body:css});
     return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(({width,height,bottom})=>{
     window.qaViolations=[];document.addEventListener('securitypolicyviolation',event=>qaViolations.push(event.effectiveDirective));
     document.body.classList.add('android-app');document.querySelector('#app').hidden=false;document.querySelector('#login').hidden=true;
     document.querySelector('#app').classList.toggle('nav-bottom',bottom);
     document.querySelector('#day-dialog-content').append(document.querySelector('#day-detail'));
     document.querySelector('#year-label').textContent='2026年';document.querySelector('#month-label').textContent='十一月';document.querySelector('#jump-year').value='2026';
     document.querySelector('#holiday-note').textContent='休 / 班为内置中国大陆放假调休安排，请以当年官方通知为准。';
     window.__ourdaysAndroidCalendarBuild=10809;window.__ourdaysAndroidCalendarViewport={width:width*3,height:height*3};
    },{width,height,bottom});
    await page.evaluate(script);await page.evaluate(script);
    await page.waitForFunction(()=>document.querySelector('#ourdays-android-calendar-style')?.sheet);
    const measure=()=>page.evaluate(()=>{
     const calendar=document.querySelector('.calendar').getBoundingClientRect(),nav=document.querySelector('.view-switch').getBoundingClientRect();
     return {extent:document.documentElement.scrollHeight,viewport:innerHeight,outerTop:scrollY,appTop:document.querySelector('#app').scrollTop,calendarBottom:calendar.bottom,limit:document.querySelector('#app').classList.contains('nav-bottom')?nav.top:innerHeight,minCell:Math.min(...Array.from(document.querySelectorAll('#grid>.day'),node=>node.getBoundingClientRect().height)),fit:document.documentElement.getAttribute('data-android-calendar-fit'),state:{sheet:!!document.querySelector('#ourdays-android-calendar-style').sheet,mobile:matchMedia('(max-width:760px)').matches,appHidden:document.querySelector('#app').hidden,workspaceHidden:document.querySelector('.workspace').hidden,aria:document.querySelector('#calendar-view').getAttribute('aria-pressed')},links:document.querySelectorAll('#ourdays-android-calendar-style').length,violations:qaViolations};
    });
    const check=result=>{if(result.extent>height+1||result.outerTop!==0||result.appTop!==0||result.calendarBottom>result.limit+1||result.minCell<28||result.fit!=='true'||result.links!==1||result.violations.length)throw Error(JSON.stringify({width,height,bottom,errors,...result}));};
    for(const rows of [4,5,6]){
     await page.evaluate(rows=>document.querySelector('#grid').innerHTML=Array.from({length:rows*7},(_,i)=>'<button class="day"><span>'+(i%31+1)+'</span><small class="lunar-label">初八</small></button>').join(''),rows);
     await page.waitForTimeout(80);check(await measure());cases++;
    }
    // Font metrics, actual navigation height and a smaller native WebView must be measured again.
    await page.evaluate(()=>{
     for(const n of document.querySelectorAll('.toolbar h2,.navigation button,.calendar footer,.intro p'))n.style.fontSize=parseFloat(getComputedStyle(n).fontSize)*1.25+'px';
     window.__ourdaysAndroidCalendarViewport.height-=60;window.dispatchEvent(new Event('ourdays-android-viewport'));
    });
    await page.waitForTimeout(100);check(await measure());
    // Other pages retain normal scrolling; returning to the calendar clears the old outer offset.
    await page.evaluate(()=>{
     document.querySelector('#calendar-view').setAttribute('aria-pressed','false');document.querySelector('.workspace').hidden=true;document.querySelector('#memos-dialog').hidden=false;
     document.querySelector('#memos-list').innerHTML=Array(60).fill('<section class="memo-group"><p>关于我们的小小日常</p></section>').join('');
    });
    await page.waitForTimeout(100);
    if(await page.evaluate(()=>document.documentElement.hasAttribute('data-android-calendar-fit')))throw Error('Calendar lock leaked into memos');
    await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,400);await page.waitForTimeout(100);
    if(await page.evaluate(()=>scrollY)<20)throw Error('Memo scrolling was blocked');
    await page.evaluate(()=>{document.querySelector('#memos-dialog').hidden=true;document.querySelector('.workspace').hidden=false;document.querySelector('#calendar-view').setAttribute('aria-pressed','true');});
    await page.waitForTimeout(100);check(await measure());
    await page.evaluate(()=>{document.querySelector('#app').hidden=true;document.querySelector('#login').hidden=false;});await page.waitForTimeout(80);
    if(await page.locator('#app').isVisible()||await page.evaluate(()=>document.documentElement.hasAttribute('data-android-calendar-fit')))throw Error('Login visibility or scrolling was changed');
    if(errors.length)throw Error(errors.join(';'));
    console.log(JSON.stringify({size:[width,height],navigation:bottom?'bottom':'top',monthRows:[4,5,6],passed:true}));
    await page.close();
   }
  }
  console.log('PASS: '+cases+' calendar layouts under production CSP; font/native viewport changes; memos scrolling and login preserved');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
