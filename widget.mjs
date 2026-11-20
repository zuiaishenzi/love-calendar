import {fail} from './accounts.mjs';
import {nextOccurrence,shanghaiClock,validDay} from './calendar.mjs';

export function widgetService(db,{now=Date.now}={}){
 const through=user=>db.prepare('SELECT through_id FROM chat_reads WHERE user_id=?').get(user.id)?.through_id||0;
 function visibleReminder(user,id){return db.prepare('SELECT * FROM reminders WHERE id=? AND ledger_id=? AND (private_owner IS NULL OR private_owner=?)').get(id,user.ledger_id,user.id);}
 function state(user){
  const peer=db.prepare('SELECT id,name FROM users WHERE ledger_id=? AND id<>?').get(user.ledger_id,user.id)||null;
  const note=db.prepare('SELECT id,text,created FROM widget_notes WHERE ledger_id=? AND recipient=? AND read_at IS NULL ORDER BY created,id LIMIT 1').get(user.ledger_id,user.id);
  const chat=db.prepare('SELECT id,kind,text,created FROM chat_messages WHERE ledger_id=? AND sender<>? AND id>? AND retracted_at IS NULL ORDER BY id LIMIT 1').get(user.ledger_id,user.id,through(user));
  const noteCount=db.prepare('SELECT COUNT(*) AS n FROM widget_notes WHERE ledger_id=? AND recipient=? AND read_at IS NULL').get(user.ledger_id,user.id).n;
  const chatCount=db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE ledger_id=? AND sender<>? AND id>? AND retracted_at IS NULL').get(user.ledger_id,user.id,through(user)).n;
  const pick=note&&(!chat||note.created<=chat.created)?{...note,type:'note',target:'notes'}:chat?{id:chat.id,type:'chat',target:'chat',created:chat.created,text:chat.kind==='text'?chat.text:chat.kind==='image'?'发来一张图片':'发来一条语音'}:null;
  const setting=db.prepare('SELECT * FROM widget_settings WHERE user_id=?').get(user.id);let countdown=null;
  if(setting?.reminder_id){const r=visibleReminder(user,setting.reminder_id),today=shanghaiClock(new Date(now())).day,next=r&&nextOccurrence(r,today);if(next)countdown={id:r.id,title:r.title,day:next,days:Math.round((Date.parse(next)-Date.parse(today))/86400000)};}
  if(setting?.custom_day){const today=shanghaiClock(new Date(now())).day;countdown={title:setting.title,day:setting.custom_day,days:Math.round((Date.parse(setting.custom_day)-Date.parse(today))/86400000),source:'custom'};}
  return {owner:user.id,peer,unreadCount:noteCount+chatCount,item:pick,countdown,settings:{reminderId:setting?.reminder_id||null,customDay:setting?.custom_day||null,title:setting?.title||''},updatedAt:now()};
 }
 function route(req,url,user,input,ensureWritable){
  const p=url.pathname;
  if(p==='/api/widget/state'&&req.method==='GET')return state(user);
  if(p==='/api/widget/notes'&&req.method==='GET'){
   const box=url.searchParams.get('box')||'received',raw=url.searchParams.get('before');if(!['received','sent'].includes(box)||raw!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))))throw fail(400,'留言筛选无效');
   const rows=db.prepare(`SELECT n.id,n.text,n.created,n.read_at,n.sender,n.recipient,u.name AS sender_name,v.name AS recipient_name FROM widget_notes n JOIN users u ON u.id=n.sender JOIN users v ON v.id=n.recipient WHERE n.ledger_id=? AND n.${box==='sent'?'sender':'recipient'}=? AND n.id<? ORDER BY n.id DESC LIMIT 21`).all(user.ledger_id,user.id,raw===null?Number.MAX_SAFE_INTEGER:Number(raw));
   return {items:rows.slice(0,20),more:rows.length>20};
  }
  if(p==='/api/widget/notes'&&req.method==='POST'){
   ensureWritable();if(typeof input.text!=='string'||!input.text.trim()||input.text.trim().length>500)throw fail(400,'请填写1至500字的留言');
   const peer=db.prepare('SELECT id FROM users WHERE ledger_id=? AND id<>?').get(user.ledger_id,user.id);if(!peer)throw fail(409,'等对方加入后，就可以留下这份心意');
   const count=db.prepare('SELECT COUNT(*) AS n FROM widget_notes WHERE sender=? AND created>?').get(user.id,now()-60000).n;if(count>=10)throw fail(429,'留言发送得有些快，请稍后再试');
   const id=Number(db.prepare('INSERT INTO widget_notes(ledger_id,sender,recipient,text,created) VALUES(?,?,?,?,?)').run(user.ledger_id,user.id,peer.id,input.text.trim(),now()).lastInsertRowid);return {id};
  }
  if(p==='/api/widget/unread'&&req.method==='POST'){
   if(input.type!=='note'||!Number.isSafeInteger(input.id)||input.id<=0)throw fail(400,'留言标记无效');
   const result=db.prepare('UPDATE widget_notes SET read_at=NULL WHERE id=? AND ledger_id=? AND recipient=?').run(input.id,user.ledger_id,user.id);
   if(!result.changes)throw fail(404,'留言不存在');
   return state(user);
  }
  if(p==='/api/widget/read'&&req.method==='POST'){
   if(!['note','chat'].includes(input.type)||!Number.isSafeInteger(input.id)||input.id<=0)throw fail(400,'留言标记无效');
   db.transaction(()=>{
    if(input.type==='note'){const row=db.prepare('SELECT id FROM widget_notes WHERE id=? AND ledger_id=? AND recipient=?').get(input.id,user.ledger_id,user.id);if(!row)throw fail(404,'留言不存在');db.prepare('UPDATE widget_notes SET read_at=COALESCE(read_at,?) WHERE id=?').run(now(),input.id);}
    else {const row=db.prepare('SELECT id FROM chat_messages WHERE id=? AND ledger_id=? AND sender<>?').get(input.id,user.ledger_id,user.id);if(!row)throw fail(404,'消息不存在');if(input.id<=through(user))return;const earliest=db.prepare('SELECT id FROM chat_messages WHERE ledger_id=? AND sender<>? AND id>? AND retracted_at IS NULL ORDER BY id LIMIT 1').get(user.ledger_id,user.id,through(user));if(earliest?.id!==input.id)throw fail(409,'消息状态已变化，请刷新卡片');db.prepare('INSERT INTO chat_reads(user_id,through_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET through_id=MAX(through_id,excluded.through_id)').run(user.id,input.id);}
   })();return state(user);
  }
  if(p==='/api/widget/settings'&&req.method==='PUT'){
   ensureWritable();
   if(input.customDay!==undefined){if(!validDay(input.customDay)||typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>60)throw fail(400,'请填写60字以内的名称，并选择有效日期');db.prepare("INSERT INTO widget_settings(user_id,reminder_id,custom_day,title) VALUES(?,NULL,?,?) ON CONFLICT(user_id) DO UPDATE SET reminder_id=NULL,custom_day=excluded.custom_day,title=excluded.title").run(user.id,input.customDay,input.title.trim());}
   else {if(input.reminderId!==null&&(!Number.isSafeInteger(input.reminderId)||!visibleReminder(user,input.reminderId)))throw fail(400,'请选择自己可以查看的纪念日');db.prepare("INSERT INTO widget_settings(user_id,reminder_id,custom_day,title) VALUES(?,?,NULL,'') ON CONFLICT(user_id) DO UPDATE SET reminder_id=excluded.reminder_id,custom_day=NULL,title=''").run(user.id,input.reminderId);}
   return state(user);
  }
  throw fail(404,'卡片功能不存在');
 }
 return {state,route};
}
