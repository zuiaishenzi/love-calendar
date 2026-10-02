let lifecyclePurpose='',avatarRevision=Date.now();
function drawAvatar(host,user,preset){
 const choice=preset||user.avatar,custom=!preset&&user.avatar_uploaded;
 const signature=custom?'custom-'+user.id+'-'+avatarRevision:choice;
 if(host.dataset.avatar===signature&&host.querySelector('img'))return;
 host.dataset.avatar=signature;host.replaceChildren();const img=el('img');img.alt='';img.decoding='async';
 img.src=custom?`/api/avatars/${user.id}?v=${avatarRevision}`:`/avatars/${choice.slice(0,-2)}.png?v=20261001-2`;
 img.className=custom?'avatar-custom':choice.endsWith('-2')?'avatar-pair second':'avatar-pair';host.append(img);
}
function menuOpen(open){$('#settings-menu').hidden=!open;$('#profile-open').setAttribute('aria-expanded',String(open));}
$('#profile-open').onclick=()=>menuOpen($('#settings-menu').hidden);
document.addEventListener('click',event=>{if(!event.target.closest('.account-dropdown'))menuOpen(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#settings-menu').hidden){menuOpen(false);$('#profile-open').focus();}});
function refreshSettings(){
 if(!currentUser)return;
 drawAvatar($('#header-avatar'),currentUser);drawAvatar($('#personal-avatar'),currentUser);
 const state=currentUser.lifecycle,pending=Boolean(state?.readonly);
 $('#app').classList.toggle('ledger-readonly',pending);
 $('#ledger-notice').hidden=!pending;
 $('#ledger-notice-text').textContent=pending?`这本账本正在注销中，当前仅可查看或下载。将于 ${new Date(state.delete_at).toLocaleString()} 结束30天保留期并删除。若仍想珍藏，请双方在十分钟内完成邮箱验证，取消注销。`:'';
 $('#delete-account-open').disabled=pending||currentUser.members.length!==1;
 $('#delete-ledger-open').disabled=pending||currentUser.members.length!==2;
 $('#security-cancel-ledger').hidden=state?.kind!=='ledger';
 $('#change-email').disabled=pending;
 $('#personal-save-mail').disabled=pending||!currentUser.email;
 $('#avatar-upload').disabled=pending;
 for(const b of document.querySelectorAll('#avatar-options button'))b.disabled=pending;
 if($('#lifecycle-dialog').open)renderLifecycleProgress();
}
async function freshUser(){currentUser=await api('/api/me');refreshSettings();return currentUser;}
$('#personal-open').onclick=async()=>{
 menuOpen(false);try{
  await freshUser();$('#personal-name').textContent=currentUser.name;$('#personal-email').textContent=currentUser.email||'尚未绑定，请到安全设置添加邮箱';
  $('#personal-mail-enabled').checked=currentUser.email_enabled;
  $('#profile-ledger').textContent='账本号 · '+currentUser.ledger_code;
  $('#profile-members').textContent=`已加入 ${currentUser.members.length}/2 人 · `+currentUser.members.map(m=>m.name).join('、');
  $('#personal-error').textContent='';const box=$('#avatar-options');box.replaceChildren();
  const names=['春樱','晴海','秋书','冬暖','星月'];
  for(let pair=1;pair<=5;pair++){
   const group=el('div',undefined,'avatar-group');group.append(el('small',names[pair-1]));
   for(let side=1;side<=2;side++){const preset=`pair-${pair}-${side}`,b=el('button');b.type='button';b.className='avatar-choice';b.dataset.preset=preset;b.setAttribute('aria-label',`${names[pair-1]} · 头像${side}`);b.setAttribute('aria-pressed',String(!currentUser.avatar_uploaded&&currentUser.avatar===preset));const face=el('span',undefined,'avatar');drawAvatar(face,currentUser,preset);b.append(face);b.onclick=()=>saveAvatar({preset});group.append(b);}box.append(group);
  }
  refreshSettings();$('#profile-dialog').showModal();
 }catch(e){$('#status').textContent=e.message;}
};
async function saveAvatar(input){
 const box=$('#avatar-options');box.setAttribute('aria-busy','true');$('#personal-error').textContent='正在保存头像…';
 try{currentUser=await api('/api/avatar','POST',input);avatarRevision=Date.now();refreshSettings();for(const b of box.querySelectorAll('button'))b.setAttribute('aria-pressed',String(!currentUser.avatar_uploaded&&b.dataset.preset===currentUser.avatar));$('#personal-error').textContent='新的模样，已经替你珍藏。';}
 catch(e){$('#personal-error').textContent=e.message;}finally{box.removeAttribute('aria-busy');}
}
$('#avatar-upload').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 if(file.size>5*1024*1024){$('#personal-error').textContent='请选择5MB以内的头像';return;}
 try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});await saveAvatar({data});}catch(e){$('#personal-error').textContent=e.message;}finally{event.target.value='';}
};
$('#personal-save-mail').onclick=async()=>{try{currentUser=await api('/api/profile','POST',{email:currentUser.email,email_enabled:$('#personal-mail-enabled').checked});$('#personal-error').textContent='提醒偏好已保存';}catch(e){$('#personal-error').textContent=e.message;}};
$('#security-open').onclick=async()=>{menuOpen(false);try{await freshUser();$('#security-error').textContent='';$('#security-dialog').showModal();}catch(e){$('#status').textContent=e.message;}};
$('#change-email').onclick=()=>{if(currentUser.lifecycle?.readonly)return;openEmailSettings();};
$('#reset-password').onclick=()=>{if(!currentUser.email){$('#security-error').textContent='请先绑定邮箱';return;}openPasswordReset(true);};
function renderLifecycleProgress(){
 if(!currentUser)return;
 const state=currentUser.lifecycle,request=state?.request;
 const completed=lifecyclePurpose==='ledger-cancel'?!state?.readonly:state?.readonly;
 if(completed){$('#lifecycle-progress').textContent=lifecyclePurpose==='ledger-cancel'?'双方已确认，账本注销已取消，可以继续记录。':'双方已确认，账本已进入30天保留期。';$('#lifecycle-submit').disabled=true;$('#lifecycle-code').disabled=true;return;}
 const matching=request?.purpose===lifecyclePurpose;
 const approved=matching?request.approved:[];
 const seconds=matching?Math.max(0,Math.ceil((request.expires-Date.now())/1000)):0;
 $('#lifecycle-progress').textContent=matching&&seconds?`共同确认窗口剩余 ${Math.floor(seconds/60)}分${seconds%60}秒 · `+currentUser.members.map(m=>m.name+(approved.includes(m.id)?'已确认':'待确认')).join('，'):'获取验证码后开始十分钟确认窗口。超时需重新获取并确认。';
 $('#lifecycle-submit').disabled=approved.includes(currentUser.id)&&seconds>0;
 $('#lifecycle-code').disabled=approved.includes(currentUser.id)&&seconds>0;
}
async function openLifecycle(purpose){
 try{await freshUser();lifecyclePurpose=purpose;$('#lifecycle-form').reset();
  $('#lifecycle-heading').textContent={'account-delete':'暂别这本日历','ledger-delete':'共同确认注销账本','ledger-cancel':'把我们的故事留下'}[purpose];
  $('#lifecycle-description').textContent=purpose==='account-delete'?'仅当账本只有你一人时可注销。确认后退出登录，账本保留30天；期限内用原密码登录，或使用相同用户名和邮箱完成注册验证，可恢复原账本。到期将删除运行数据库中的账号、回忆与照片。历史备份由部署者管理。':purpose==='ledger-delete'?'双方请分别登录自己的账号、获取自己的邮箱验证码，在同一个十分钟窗口内提交确认。全部确认后账本保留30天，仅可查看或下载；到期删除运行数据库中的账本、双方账号、回忆与照片。历史备份由部署者管理。':'这本账本还在等你们。双方请分别获取绑定邮箱的验证码，并在同一个十分钟窗口内确认，之后即可继续一起记录。';
  $('#lifecycle-email').value=currentUser.email||'';$('#lifecycle-error').textContent='';$('#lifecycle-dialog').showModal();renderLifecycleProgress();
 }catch(e){$('#security-error').textContent=e.message;}
}
$('#delete-account-open').onclick=()=>openLifecycle('account-delete');
$('#delete-ledger-open').onclick=()=>openLifecycle('ledger-delete');
$('#security-cancel-ledger').onclick=$('#cancel-ledger-open').onclick=()=>openLifecycle('ledger-cancel');
$('#lifecycle-code').onclick=async()=>{const b=$('#lifecycle-code');b.disabled=true;try{currentUser.lifecycle=await api('/api/lifecycle/code','POST',{purpose:lifecyclePurpose});$('#lifecycle-error').textContent='验证码已发送至你的绑定邮箱，请在共同确认窗口内填写。';refreshSettings();}catch(e){$('#lifecycle-error').textContent=e.message;}finally{b.disabled=false;}};
$('#lifecycle-form').onsubmit=async event=>{event.preventDefault();const b=$('#lifecycle-submit');b.disabled=true;try{
 const state=await api('/api/lifecycle/confirm','POST',{purpose:lifecyclePurpose,code:event.target.elements.code.value});currentUser.lifecycle=state;
 if(state.kind==='account'){showLogin();$('#login-error').textContent='账号已进入30天保留期。若想回来，使用原密码登录即可恢复。';return;}
 const completed=lifecyclePurpose==='ledger-cancel'?!state.readonly:state.readonly;
 if(completed){$('#lifecycle-dialog').close();$('#security-dialog').close();}
 else $('#lifecycle-error').textContent='你的心意已确认，正在等对方。';refreshSettings();
 }catch(e){$('#lifecycle-error').textContent=e.message;}finally{b.disabled=false;renderLifecycleProgress();}};
setInterval(()=>{if(currentUser&&$('#lifecycle-dialog').open)renderLifecycleProgress();},1000);
