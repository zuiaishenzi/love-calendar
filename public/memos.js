let memoData=null,memoEditing=null,memoBusy=false,memoUser=null,memoLoad=0;
const memoStatus=message=>{ $('#memos-status').textContent=message;$('#memo-editor-status').textContent=message; };
function resetMemoEditor(){memoEditing=null;$('#memo-form').reset();$('#memo-save').textContent='保存备忘';$('#memo-cancel').hidden=true;}
function openMemoEditor(note=null){
 if(!memoData||memoBusy)return;resetMemoEditor();$('#memo-editor-status').textContent='';
 $('#memo-form').elements.day.value=localDay();
 $('#memo-editor-title').textContent=note?'编辑备忘录':'新增备忘录';
 if(note){memoEditing=note.id;const f=$('#memo-form');f.elements.day.value=note.day||'';f.elements.title.value=note.title||'';f.elements.body.value=note.body;f.elements.category_id.value=note.category_id??(note.ai_category?'ai:'+note.ai_category:'');$('#memo-save').textContent='保存修改';}
 $('#memo-cancel').hidden=false;$('#memo-editor-dialog').showModal();$('#memo-form').elements.body.focus();
}
function renderMemos(){
 const readOnly=Boolean(currentUser?.lifecycle?.readonly),select=$('#memo-category'),value=select.value;
 select.replaceChildren(new Option('待整理',''),...(memoData.ai_categories||[]).map(name=>new Option(name,'ai:'+name)),...memoData.categories.map(c=>new Option(c.name+' · 自定义',String(c.id))));select.value=value;
 if(select.selectedIndex<0)select.value='';
 $('#memos-organize').disabled=memoBusy||readOnly||!memoData.ai_ready||!memoData.notes.some(n=>n.category_id===null);
 $('#memos-organize').textContent=memoBusy?'正在整理…':'一键 AI 整理';
 $('#memos-organize').title=memoData.ai_ready?'整理待整理和 AI 分类中的记录':'AI 尚未配置，可以先手动记录';
 $('#memo-add').disabled=memoBusy||readOnly;$('#memo-originals-open').disabled=false;
 for(const field of [...$('#memo-form').elements,...$('#memo-category-form').elements])field.disabled=readOnly||memoBusy;
 const list=$('#memos-list');list.replaceChildren();
 const originals=new Map(memoData.notes.map(note=>[note.id,note])),summarized=new Set(),entries=[];
 for(const item of memoData.summary||[]){const note=originals.get(item.id);if(!note||note.category_id!==null)continue;summarized.add(note.id);entries.push({note,text:item.text,kind:item.category,extracted:true});}
 for(const note of memoData.notes)if(!summarized.has(note.id))entries.push({note,text:note.body,kind:note.ai_category||'待整理',extracted:false});
 function group(name,notes,category=null){
  const card=el('section',undefined,'memo-group'),heading=el('div',undefined,'memo-group-heading');heading.append(el('h3',name),el('small',category?'手动维护 · 不参与 AI':name==='待整理'?'等待整理':'AI 分类 · 原文保留'));
  card.dataset.key=category?'custom:'+category.id:name==='待整理'?'pending':'ai:'+name;
  const handle=el('button','⠿','memo-drag-handle');handle.type='button';handle.setAttribute('aria-label','拖动排序 '+name);handle.title='拖动调整分类顺序，也可使用方向键';handle.disabled=readOnly||memoBusy;heading.prepend(handle);bindMemoDrag(handle,card,list);card.append(heading);
  if(!notes.length)card.append(el('p','还没有记录。','hint'));
  const ul=el('ul');for(const {note,text,extracted} of notes){const li=el('li');li.append(el('p',text,'memo-text'));
   ul.append(li);
  }card.append(ul);list.append(card);
 }
 const automatic=entries.filter(e=>e.note.category_id===null);
 if(!memoData.notes.length&&!memoData.categories.length)list.append(el('p','从一件小事开始，慢慢记住对方。','memo-empty'));
 const pending=automatic.filter(e=>e.kind==='待整理');if(pending.length)group('待整理',pending);
 for(const kind of new Set([...(memoData.ai_categories||[]),...automatic.filter(e=>e.kind!=='待整理').map(e=>e.kind)])){const notes=automatic.filter(e=>e.kind===kind);if(notes.length)group(kind,notes);}
 for(const category of memoData.categories)group(category.name,entries.filter(e=>e.note.category_id===category.id),category);
 const cards=[...list.querySelectorAll('.memo-group')],rank=new Map((memoData.order||[]).map((key,index)=>[key,index]));cards.sort((a,b)=>(rank.get(a.dataset.key)??1000)-(rank.get(b.dataset.key)??1000));for(const card of cards)list.append(card);
 renderMemoOriginals();
}
async function memoMutate(url,method,data,closeEditor=false){
 if(memoBusy)return;memoBusy=true;renderMemos();memoStatus('正在保存…');const owner=memoUser;
 try{const result=await api(url,method,data);if(currentUser?.id!==owner||memoUser!==owner||!$('#memos-dialog').open)return;memoData=result;if(closeEditor)$('#memo-editor-dialog').close();memoStatus('已保存');return true;}
 catch(e){if(currentUser?.id===owner)memoStatus(e.message);}finally{memoBusy=false;if(memoData&&currentUser?.id===owner)renderMemos();}
}
$('#memos-open').onclick=async()=>{
 const request=++memoLoad;memoUser=currentUser?.id;memoData=null;$('#memos-list').replaceChildren();resetMemoEditor();$('#memos-organize').disabled=true;
 $('#memo-add').disabled=true;$('#memo-originals-open').disabled=true;$('#memos-dialog').showModal();memoStatus('正在翻开备忘…');
 try{const user=await api('/api/me');if(request!==memoLoad||currentUser?.id!==memoUser)return;currentUser=user;const data=await api('/api/memos');if(request!==memoLoad||currentUser?.id!==memoUser)return;memoData=data;memoStatus('');renderMemos();}catch(e){if(request===memoLoad)memoStatus(e.message);}
};
$('#memos-close').onclick=()=>$('#memos-dialog').close();
$('#memos-dialog').addEventListener('close',()=>{++memoLoad;$('#memo-originals-dialog').close();$('#memo-originals-list').replaceChildren();$('#memo-editor-dialog').close();memoData=null;memoUser=null;resetMemoEditor();$('#memos-list').replaceChildren();$('#memo-category').replaceChildren();memoStatus('');});
$('#memo-add').onclick=()=>openMemoEditor();
$('#memo-editor-close').onclick=$('#memo-cancel').onclick=()=>$('#memo-editor-dialog').close();
$('#memo-editor-dialog').addEventListener('close',resetMemoEditor);
$('#memo-form').onsubmit=e=>{e.preventDefault();if(!memoData)return;const f=e.target,value=f.elements.category_id.value;memoMutate('/api/memos/notes','POST',{id:memoEditing,day:f.elements.day.value,title:f.elements.title.value,body:f.elements.body.value,category_id:value&&!value.startsWith('ai:')?Number(value):null,ai_category:value.startsWith('ai:')?value.slice(3):null},true);};
$('#memo-category-form').onsubmit=async e=>{e.preventDefault();if(!memoData)return;if(await memoMutate('/api/memos/categories','POST',{name:e.target.elements.name.value}))e.target.reset();};
$('#memos-organize').onclick=async()=>{
 if(memoBusy||!memoData)return;memoBusy=true;renderMemos();memoStatus('正在整理，原始记录会保留…');const owner=memoUser;
 try{const data=await api('/api/memos/organize','POST',{});if(currentUser?.id!==owner||memoUser!==owner||!$('#memos-dialog').open)return;memoData=data;memoStatus('已分门别类整理，原文保存在“原文与管理”中。');}
 catch(e){if(memoUser===owner)memoStatus(e.message);}finally{memoBusy=false;if(memoData&&memoUser===owner)renderMemos();}
};

function renderMemoOriginals(){
 const list=$('#memo-originals-list');list.replaceChildren();if(!memoData)return;
 const readOnly=Boolean(currentUser?.lifecycle?.readonly),days=new Map(),today=localDay();
 const dateTitle=day=>{const [year,month,date]=day.split('-');return `${year}年${Number(month)}月${Number(date)}日`;};
 for(const note of [...memoData.notes].sort((a,b)=>(b.day||today).localeCompare(a.day||today)||b.id-a.id)){const day=note.day||today;if(!days.has(day))days.set(day,[]);days.get(day).push(note);}
 if(memoData.categories.length){const categories=el('details',undefined,'memo-category-management');categories.append(el('summary','管理自定义分类'));for(const category of memoData.categories){const row=el('div',undefined,'memo-actions'),remove=el('button','删除分类');remove.disabled=readOnly||memoBusy;remove.onclick=()=>memoMutate('/api/memos/categories/'+category.id,'DELETE',{});row.append(el('span',category.name),remove);categories.append(row);}list.append(categories);}
 if(!days.size)list.append(el('p','还没有记录，先新增一件小事吧。','memo-empty'));
 for(const [day,notes] of days){const section=el('section',undefined,'memo-diary-day');for(const note of notes){const article=el('article',undefined,'memo-diary-entry');article.append(el('h4',dateTitle(day)),el('p',note.body,'memo-text'));const actions=el('div',undefined,'memo-actions'),edit=el('button','编辑'),remove=el('button','删除');edit.disabled=remove.disabled=readOnly||memoBusy;edit.onclick=()=>openMemoEditor(note);remove.onclick=()=>{if(confirm('删除这条原文及从中提取的全部要点？'))memoMutate('/api/memos/notes/'+note.id,'DELETE',{});};actions.append(edit,remove);article.append(actions);section.append(article);}list.append(section);}
}
$('#memo-originals-open').onclick=()=>{if(!memoData)return;renderMemoOriginals();$('#memo-originals-dialog').showModal();};
$('#memo-originals-close').onclick=()=>$('#memo-originals-dialog').close();

function bindMemoDrag(handle,card,list){
 let start=null,changed=false;
 const order=()=>[...list.querySelectorAll('.memo-group')].map(c=>c.dataset.key);
 const save=()=>{const visible=order(),hidden=(memoData.order||[]).filter(key=>!visible.includes(key)&&(['pending',...(memoData.ai_categories||[]).map(name=>'ai:'+name),...memoData.categories.map(c=>'custom:'+c.id)]).includes(key));memoMutate('/api/memos/order','POST',{order:[...visible,...hidden]});};
 handle.addEventListener('pointerdown',event=>{if(handle.disabled||event.button!==0)return;start={id:event.pointerId,x:event.clientX,y:event.clientY};changed=false;handle.setPointerCapture(event.pointerId);event.preventDefault();});
 handle.addEventListener('pointermove',event=>{if(!start||start.id!==event.pointerId)return;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<6&&!card.classList.contains('dragging'))return;card.classList.add('dragging');const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.memo-group');if(!target||target===card||target.parentElement!==list)return;const cards=[...list.children],forward=cards.indexOf(target)>cards.indexOf(card);list.insertBefore(card,forward?target.nextSibling:target);changed=true;});
 const finish=event=>{if(!start||start.id!==event.pointerId)return;start=null;card.classList.remove('dragging');if(changed){changed=false;save();}};
 handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',()=>{start=null;changed=false;card.classList.remove('dragging');if(memoData)renderMemos();});
 handle.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||handle.disabled)return;event.preventDefault();const backwards=['ArrowUp','ArrowLeft'].includes(event.key),target=backwards?card.previousElementSibling:card.nextElementSibling;if(!target?.classList.contains('memo-group'))return;list.insertBefore(card,backwards?target:target.nextSibling);save();});
}
