// Profile, registration and reminders share the authenticated session from app.js.
let currentUser=null, reminderEditing=null, annualReminders=[], calendarInfo={days:[]};
const coolingTimers=new Map();
function authMode(register){$('#register-form').hidden=!register;$('#login-form').hidden=register;$('#show-register').setAttribute('aria-pressed',String(register));$('#show-login').setAttribute('aria-pressed',String(!register));}
$('#show-login').onclick=()=>authMode(false);$('#show-register').onclick=()=>authMode(true);
$('#generate-ledger').onclick=()=>{const bytes=crypto.getRandomValues(new Uint8Array(12));$('#register-form').elements.ledger_code.value=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();};
async function sendCode(form,purpose,button,error){
 const email=form.elements.email;if(!email.reportValidity())return;
 button.disabled=true;error.textContent='正在发送…';let sent=false;
 try{await api('/api/email/code','POST',{email:email.value,purpose,password:form.elements.password.value});sent=true;error.textContent='验证码已发送，请检查收件箱或垃圾邮件。';let left=60;button.textContent=`${left}秒后重发`;const timer=setInterval(()=>{left--;button.textContent=left?`${left}秒后重发`:'发送验证码';if(!left){clearInterval(timer);coolingTimers.delete(button);button.disabled=false;}},1000);coolingTimers.set(button,timer);}
 catch(e){error.textContent=e.message;}finally{if(!sent)button.disabled=false;}
}
$('#register-code').onclick=()=>sendCode($('#register-form'),'register',$('#register-code'),$('#register-error'));
$('#profile-code').onclick=()=>sendCode($('#profile-form'),'bind',$('#profile-code'),$('#profile-error'));
$('#register-form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button.primary');button.disabled=true;$('#register-error').textContent='';try{const input=Object.fromEntries(new FormData(form));const user=await api('/api/register','POST',input);form.reset();await enter(user);}catch(e){$('#register-error').textContent=e.message;}finally{button.disabled=false;}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
$('#profile-open').onclick=async()=>{try{currentUser=await api('/api/me');const f=$('#profile-form');f.reset();f.elements.email.value=currentUser.email||'';f.elements.email_enabled.checked=currentUser.email_enabled;$('#profile-ledger').textContent='账本号：'+currentUser.ledger_code;$('#profile-members').textContent=`已加入 ${currentUser.members.length}/2 人：`+currentUser.members.map(m=>m.name+(m.verified?'':'（未绑定邮箱）')).join('、');$('#profile-mail-note').textContent=currentUser.mail_ready?'服务器QQ邮箱已配置。':'服务器尚未配置QQ发件邮箱，暂时不能发送验证码或提醒。';$('#profile-error').textContent='';$('#profile-dialog').showModal();}catch(e){$('#status').textContent=e.message;}};
$('#profile-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button.primary');b.disabled=true;$('#profile-error').textContent='';try{currentUser=await api('/api/profile','POST',{email:f.elements.email.value,password:f.elements.password.value,code:f.elements.code.value,email_enabled:f.elements.email_enabled.checked});f.elements.password.value='';f.elements.code.value='';$('#profile-error').textContent='邮箱设置已保存';}catch(e){$('#profile-error').textContent=e.message;}finally{b.disabled=false;}};
function reminderMatches(r,day){return r.base_day<=day&&r.enabled&&r.dates?.includes(day);}
function renderDayExtras(){
 const detail=calendarInfo.days.find(d=>d.day===selected);$('#selected-lunar').textContent=detail?['农历'+detail.lunar,detail.term,...detail.festivals,detail.holiday?(detail.holiday.work?'调休上班':'假期休息'):''].filter(Boolean).join(' · '):'';
 const box=$('#day-reminders');box.replaceChildren();const rows=annualReminders.filter(r=>reminderMatches(r,selected));
 if(!rows.length)box.append(el('p','这一天还没有开启的年度提醒。','hint'));
 for(const r of rows){const b=el('button',r.title+' · '+(r.kind==='lunar'?'农历':'阳历'),'reminder-chip');b.onclick=()=>openReminder(r);box.append(b);}
}
async function openReminder(r=null){reminderEditing=r;const f=$('#reminder-form');f.reset();f.elements.title.value=r?.title||'';f.elements.base_day.value=r?.base_day||selected;f.elements.kind.value=r?.kind||'solar';f.elements.enabled.checked=r?Boolean(r.enabled):true;$('#reminder-heading').textContent=r?'编辑年度提醒':'每年提醒我们';$('#reminder-error').textContent='';$('#reminder-dialog').showModal();updateReminderHint();}
let hintVersion=0;
async function updateReminderHint(){const version=++hintVersion;const f=$('#reminder-form'),day=f.elements.base_day.value;$('#reminder-date-hint').textContent='';if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'2026-01-01')return;try{const info=await api('/api/calendar?month='+day.slice(0,7));if(version!==hintVersion)return;const d=info.days.find(d=>d.day===day);$('#reminder-date-hint').textContent=f.elements.kind.value==='lunar'?`选择的是农历${d.lunar}，以后按这个农历日期提醒。`:`每年阳历 ${Number(day.slice(5,7))}月${Number(day.slice(8))}日提醒。`;}catch(e){if(version===hintVersion)$('#reminder-date-hint').textContent=e.message;}}
$('#reminder-form').elements.base_day.onchange=updateReminderHint;
document.querySelectorAll('input[name="kind"]').forEach(r=>r.onchange=updateReminderHint);
$('#add-reminder').onclick=()=>openReminder();
$('#reminder-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button.primary');b.disabled=true;try{await api('/api/reminders','POST',{id:reminderEditing?.id,title:f.elements.title.value,base_day:f.elements.base_day.value,kind:f.elements.kind.value,enabled:f.elements.enabled.checked});$('#reminder-dialog').close();await load();if($('#reminders-dialog').open)await renderAllReminders();}catch(e){$('#reminder-error').textContent=e.message;}finally{b.disabled=false;}};
async function renderAllReminders(){const box=$('#reminders-list');box.replaceChildren();$('#reminders-error').textContent='正在加载…';try{const rows=await api('/api/reminders');$('#reminders-error').textContent='';if(!rows.length)box.append(el('p','还没有年度提醒。在日历上选一天，为你们留下一份牵挂。','hint'));for(const r of rows){const card=el('article',undefined,'reminder-card');card.append(el('h3',r.title),el('p',r.label,'hint'),el('p',r.enabled?`下次：${r.next_day||'未来24年内无对应日期'}`:'已暂停','hint'));if(r.delivery)card.append(el('p',`最近一次（你的邮箱）：${r.delivery.day} · ${{sent:'已交给邮件服务',failed:'发送失败',pending:'待发送',sending:'正在发送'}[r.delivery.state]||'待发送'}`,'hint'));const edit=el('button','编辑'),remove=el('button','删除');edit.onclick=()=>openReminder(r);remove.onclick=async()=>{if(!confirm('确定删除这条年度提醒吗？'))return;try{await api('/api/reminders/'+r.id,'DELETE',{});await renderAllReminders();await load();}catch(e){$('#reminders-error').textContent=e.message;}};card.append(edit,remove);box.append(card);}}catch(e){$('#reminders-error').textContent=e.message;}}
$('#all-reminders').onclick=()=>{$('#reminders-dialog').showModal();renderAllReminders();};
api('/api/config').then(config=>{if(!config.mail_ready){$('#mail-setup-note').hidden=false;$('#mail-setup-note').textContent='邮箱注册需部署者先配置服务器QQ邮箱。已有账号可直接登录。';}}).catch(()=>{});
api('/api/me').then(enter).catch(()=>showLogin());
