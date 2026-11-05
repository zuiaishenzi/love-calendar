let agreementPlanMonth=localDay().slice(0,7);
function closeAgreementPlanDate(focus=false){$('#agreement-plan-picker').hidden=true;$('#agreement-plan-trigger').setAttribute('aria-expanded','false');if(focus)$('#agreement-plan-trigger').focus();}
function resetAgreementPlanDate(){const day=$('#agreement-form').elements.planned_day.value;agreementPlanMonth=(day||localDay()).slice(0,7);$('#agreement-plan-text').textContent=day?day.replace('-','年').replace('-','月')+'日':'选一个想一起度过的日子';$('#agreement-plan-trigger').classList.toggle('has-date',Boolean(day));closeAgreementPlanDate();}
function selectAgreementPlanDate(day){$('#agreement-form').elements.planned_day.value=day;resetAgreementPlanDate();$('#agreement-plan-trigger').focus();}
function renderAgreementPlanMonth(focusDay=null){
 const [year,month]=agreementPlanMonth.split('-').map(Number),value=$('#agreement-form').elements.planned_day.value,today=localDay(),days=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,list=$('#agreement-plan-days');
 $('#agreement-plan-month').textContent=year+'年 '+month+'月';$('#agreement-plan-prev').disabled=agreementPlanMonth==='2000-01';$('#agreement-plan-next').disabled=agreementPlanMonth==='9999-12';list.replaceChildren();
 for(let i=0;i<offset;i++)list.append(el('span'));
 for(let n=1;n<=days;n++){const day=agreementPlanMonth+'-'+String(n).padStart(2,'0'),button=el('button',String(n),day===value?'selected':day===today?'today':'');button.type='button';button.dataset.day=day;button.setAttribute('aria-label',day);button.setAttribute('aria-pressed',String(day===value));button.onclick=()=>selectAgreementPlanDate(day);list.append(button);}
 if(focusDay)list.querySelector('[data-day="'+focusDay+'"]')?.focus();
}
$('#agreement-plan-trigger').onclick=()=>{if(!$('#agreement-plan-picker').hidden){closeAgreementPlanDate();return;}renderAgreementPlanMonth();$('#agreement-plan-picker').hidden=false;$('#agreement-plan-trigger').setAttribute('aria-expanded','true');$('#agreement-plan-picker').scrollIntoView({block:'nearest'});};
for(const [id,delta] of [['#agreement-plan-prev',-1],['#agreement-plan-next',1]])$(id).onclick=()=>{const [year,month]=agreementPlanMonth.split('-').map(Number),date=new Date(Date.UTC(year,month-1+delta,1));agreementPlanMonth=date.toISOString().slice(0,7);renderAgreementPlanMonth();};
$('#agreement-plan-clear').onclick=()=>selectAgreementPlanDate('');$('#agreement-plan-today').onclick=()=>selectAgreementPlanDate(localDay());
$('#agreement-editor').addEventListener('keydown',event=>{
 if($('#agreement-plan-picker').hidden)return;
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeAgreementPlanDate(true);return;}
 const day=event.target.dataset?.day,delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!day||delta===undefined)return;
 event.preventDefault();const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+delta);const next=date.toISOString().slice(0,10);if(next<'2000-01-01'||next>'9999-12-31')return;agreementPlanMonth=next.slice(0,7);renderAgreementPlanMonth(next);
});
document.addEventListener('click',event=>{if(!event.target.closest('.agreement-plan-field'))closeAgreementPlanDate();});$('#agreement-editor').addEventListener('close',()=>closeAgreementPlanDate());
