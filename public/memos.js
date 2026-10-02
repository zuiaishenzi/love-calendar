let memoData=null,memoEditing=null,memoBusy=false,memoUser=null,memoLoad=0;
const memoStatus=message=>$('#memos-status').textContent=message;
function resetMemoEditor(){memoEditing=null;$('#memo-form').reset();$('#memo-save').textContent='保存备忘';$('#memo-cancel').hidden=true;}
function renderMemos(){
 const readOnly=Boolean(currentUser?.lifecycle?.readonly),select=$('#memo-category'),value=select.value;
 select.replaceChildren(new Option('待整理',''),...(memoData.ai_categories||[]).map(name=>new Option(name,'ai:'+name)),...memoData.categories.map(c=>new Option(c.name+' · 自定义',String(c.id))));select.value=value;
 if(select.selectedIndex<0)select.value='';
 $('#memos-organize').disabled=memoBusy||readOnly||!memoData.ai_ready||!memoData.notes.some(n=>n.category_id===null);
 $('#memos-organize').textContent=memoBusy?'正在整理…':'一键 AI 整理';
 $('#memos-organize').title=memoData.ai_ready?'整理待整理和 AI 分类中的记录':'AI 尚未配置，可以先手动记录';
 for(const field of [...$('#memo-form').elements,...$('#memo-category-form').elements])field.disabled=readOnly;
 const list=$('#memos-list');list.replaceChildren();
 const summary=new Map((memoData.summary||[]).map(item=>[item.id,item]));
 function group(name,notes,category=null){
  const card=el('section',undefined,'memo-group'),heading=el('div',undefined,'memo-group-heading');heading.append(el('h3',name),el('small',category?'手动维护 · 不参与 AI':name==='待整理'?'等待整理':'AI 分类 · 原文保留'));
  if(category){const remove=el('button','删除分类','quiet');remove.disabled=readOnly;remove.onclick=()=>memoMutate('/api/memos/categories/'+category.id,'DELETE',{});heading.append(remove);}card.append(heading);
  if(!notes.length)card.append(el('p','还没有记录。','hint'));
  const ul=el('ul');for(const note of notes){const li=el('li'),item=summary.get(note.id);li.append(el('p',item?.text||note.body,'memo-text'));
   if(item){const details=el('details'),label=el('summary','查看原文');details.append(label,el('p',note.body,'memo-text'));li.append(details);}
   const actions=el('div',undefined,'memo-actions'),edit=el('button','编辑'),remove=el('button','删除');edit.disabled=remove.disabled=readOnly;
   edit.onclick=()=>{memoEditing=note.id;const f=$('#memo-form');f.elements.body.value=note.body;f.elements.category_id.value=note.category_id??(note.ai_category?'ai:'+note.ai_category:'');$('#memo-save').textContent='保存修改';$('#memo-cancel').hidden=false;f.elements.body.focus();};
   remove.onclick=()=>{if(confirm('删除这条私密备忘？'))memoMutate('/api/memos/notes/'+note.id,'DELETE',{});};actions.append(edit,remove);li.append(actions);ul.append(li);
  }card.append(ul);list.append(card);
 }
 const automatic=memoData.notes.filter(n=>n.category_id===null);
 if(!memoData.notes.length&&!memoData.categories.length)list.append(el('p','从一件小事开始，慢慢记住对方。','memo-empty'));
 const pending=automatic.filter(n=>!n.ai_category);if(pending.length)group('待整理',pending);
 for(const kind of memoData.ai_categories||[]){const notes=automatic.filter(n=>n.ai_category===kind);if(notes.length)group(kind,notes);}
 for(const category of memoData.categories)group(category.name,memoData.notes.filter(n=>n.category_id===category.id),category);
}
async function memoMutate(url,method,data){
 if(memoBusy)return;memoBusy=true;renderMemos();memoStatus('正在保存…');const owner=memoUser;
 try{const result=await api(url,method,data);if(currentUser?.id!==owner||!$('#memos-dialog').open)return;memoData=result;resetMemoEditor();memoStatus('已保存');}
 catch(e){if(currentUser?.id===owner)memoStatus(e.message);}finally{memoBusy=false;if(memoData&&currentUser?.id===owner)renderMemos();}
}
$('#memos-open').onclick=async()=>{
 const request=++memoLoad;memoUser=currentUser?.id;memoData=null;$('#memos-list').replaceChildren();resetMemoEditor();$('#memos-organize').disabled=true;
 $('#memos-dialog').showModal();memoStatus('正在翻开备忘…');
 try{const user=await api('/api/me');if(request!==memoLoad||currentUser?.id!==memoUser)return;currentUser=user;const data=await api('/api/memos');if(request!==memoLoad||currentUser?.id!==memoUser)return;memoData=data;memoStatus('');renderMemos();}catch(e){if(request===memoLoad)memoStatus(e.message);}
};
$('#memos-close').onclick=()=>$('#memos-dialog').close();
$('#memos-dialog').addEventListener('close',()=>{++memoLoad;memoData=null;memoUser=null;resetMemoEditor();$('#memos-list').replaceChildren();$('#memo-category').replaceChildren();memoStatus('');});
$('#memo-cancel').onclick=resetMemoEditor;
$('#memo-form').onsubmit=e=>{e.preventDefault();if(!memoData)return;const f=e.target,value=f.elements.category_id.value;memoMutate('/api/memos/notes','POST',{id:memoEditing,body:f.elements.body.value,category_id:value&&!value.startsWith('ai:')?Number(value):null,ai_category:value.startsWith('ai:')?value.slice(3):null});};
$('#memo-category-form').onsubmit=async e=>{e.preventDefault();if(!memoData)return;await memoMutate('/api/memos/categories','POST',{name:e.target.elements.name.value});e.target.reset();};
$('#memos-organize').onclick=async()=>{
 if(memoBusy||!memoData)return;memoBusy=true;renderMemos();memoStatus('正在整理，原始记录会保留…');const owner=memoUser;
 try{const data=await api('/api/memos/organize','POST',{});if(currentUser?.id!==owner||memoUser!==owner||!$('#memos-dialog').open)return;memoData=data;memoStatus('已分门别类整理，可展开查看原文。');}
 catch(e){if(memoUser===owner)memoStatus(e.message);}finally{memoBusy=false;if(memoData&&memoUser===owner)renderMemos();}
};
