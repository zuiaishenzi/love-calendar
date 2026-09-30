// Dialogs share the browser history: Back dismisses one layer before leaving.
(()=>{
 const key='loveCalendarDialogs',session=String(Date.now())+'-'+Math.random();
 let stack=[],pending=false,serial=0;
 const read=()=>history.state?.[key]?.session===session?history.state[key].tokens:[];
 const state=tokens=>({...history.state,[key]:{session,tokens}});
 history.replaceState(state([]),'');
 function reconcile(){
  if(pending)return;
  stack=stack.filter(entry=>entry.dialog.open);
  const current=read(),desired=stack.map(entry=>entry.token);
  let common=0;while(common<current.length&&current[common]===desired[common])common++;
  if(current.length>common){pending=true;history.go(common-current.length);return;}
  for(let i=common;i<desired.length;i++)history.pushState(state(desired.slice(0,i+1)),'');
 }
 for(const dialog of document.querySelectorAll('dialog')){
  const show=dialog.showModal.bind(dialog),close=dialog.close.bind(dialog);
  dialog.showModal=()=>{
   if(dialog.open)return;
   show();stack.push({dialog,token:++serial});reconcile();
  };
  dialog.close=value=>{close(value);stack=stack.filter(entry=>entry.dialog.open);reconcile();};
  // Escape and native close requests use the same history cleanup as buttons.
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
  dialog.addEventListener('close',()=>{if(!dialog.open)reconcile();});
  dialog._closeFromHistory=close;
 }
 window.addEventListener('popstate',()=>{
  if(pending){pending=false;reconcile();return;}
  const target=read();
  for(const entry of [...stack].reverse())if(!target.includes(entry.token))entry.dialog._closeFromHistory();
  stack=stack.filter(entry=>entry.dialog.open&&target.includes(entry.token));
  // Forward must not resurrect a dismissed editor or an old private dialog.
  history.replaceState(state(stack.map(entry=>entry.token)),'');
 });
})();
