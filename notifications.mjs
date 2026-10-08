import {fail} from './accounts.mjs';
import {occursOn,shanghaiClock} from './calendar.mjs';
export function notificationFeed(db,user,query,now=new Date()){
 const {day,hour}=shanghaiClock(now),latest=db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM notification_events WHERE ledger_id=?').get(user.ledger_id).id;
 const owner=query.get('owner'),raw=query.get('after');const initial=owner!==String(user.id)||raw===null;
 if(!initial&&!/^\d{1,16}$/.test(raw))throw fail(400,'通知游标无效');
 const after=initial?latest:Number(raw);if(!Number.isSafeInteger(after)||after>latest) return {owner:user.id,cursor:latest,events:[],reminders:[]};
 const rows=initial?[]:db.prepare('SELECT * FROM notification_events WHERE ledger_id=? AND id>? ORDER BY id LIMIT 100').all(user.ledger_id,after),events=[];
 for(const event of rows){if(event.sender===user.id)continue;const sender=db.prepare('SELECT name FROM users WHERE id=? AND ledger_id=?').get(event.sender,user.ledger_id);if(!sender)continue;
  if(event.kind==='chat'){const message=db.prepare('SELECT kind,text FROM chat_messages WHERE id=? AND ledger_id=? AND retracted_at IS NULL').get(event.object_id,user.ledger_id);if(message)events.push({id:event.id,channel:'social',title:sender.name,body:message.kind==='text'?message.text.slice(0,160):message.kind==='image'?'发来一张图片':'发来一条语音',target:'chat'});}
  else {const memory=db.prepare('SELECT title,day FROM memories WHERE id=? AND ledger_id=?').get(event.object_id,user.ledger_id);if(memory)events.push({id:event.id,channel:'service',title:'新的回忆',body:sender.name+'记录了：'+memory.title.slice(0,120),target:memory.day});}
 }
 const readonly=db.prepare('SELECT delete_at FROM ledgers WHERE id=?').get(user.ledger_id)?.delete_at;
 const reminders=hour>=9&&!readonly?db.prepare('SELECT * FROM reminders WHERE ledger_id=? AND enabled=1 AND (private_owner IS NULL OR private_owner=?) AND (recipient_id IS NULL OR recipient_id=?)').all(user.ledger_id,user.id,user.id).filter(r=>occursOn(r,day)).map(r=>({key:r.id+':'+day,channel:'service',title:'特殊日期提醒',body:r.title.slice(0,160),target:day})):[];
 return {owner:user.id,cursor:rows.at(-1)?.id??after,events,reminders};
}
