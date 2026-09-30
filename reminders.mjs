import {occursOn,reminderLabel,shanghaiClock} from './calendar.mjs';

export function reminderMessage(r,user,day){return {to:user.email,subject:`朝夕 · 今天，记得「${r.title}」`,text:`${user.name}，早上好。\n\n今天是 ${day}，也是你们记下的「${r.title}」。\n${reminderLabel(r)}，这份小小的牵挂都会如约而至。\n\n如果今天有一点空闲，不妨对彼此说一句想念，分享一顿饭，或一起翻翻过去的照片。不必准备多么盛大的庆祝，记得彼此，就是很温柔的心意。\n\n愿你们在忙碌的日子里，也能留一点时间给相爱。\n\n朝夕\n\n可在日历的个人设置中关闭邮件提醒。`};}

export function createReminderWorker(db,mailer){
 let busy=false;
 async function run(now=new Date()){
  if(busy||!mailer.ready)return;const clock=shanghaiClock(now);if(clock.hour<9)return;busy=true;
  try{
   // A crash after accepting SMTP cannot be distinguished from a delivered message.
   // A leased 'sending' entry is retried after 15 min; normal successful sends are deduplicated.
   const reminders=db.prepare('SELECT reminders.* FROM reminders JOIN ledgers ON ledgers.id=reminders.ledger_id WHERE enabled=1 AND ledgers.delete_at IS NULL').all();
   for(const r of reminders){if(!occursOn(r,clock.day))continue;
    const users=db.prepare('SELECT * FROM users WHERE ledger_id=? AND email IS NOT NULL AND email_enabled=1').all(r.ledger_id);
    for(const user of users){
     const fresh=db.prepare('SELECT enabled,recipient_id FROM reminders JOIN ledgers ON ledgers.id=reminders.ledger_id WHERE reminders.id=? AND ledgers.delete_at IS NULL').get(r.id);if(!fresh?.enabled)break;if(fresh.recipient_id!==null&&fresh.recipient_id!==user.id)continue;
     db.prepare('INSERT OR IGNORE INTO deliveries(reminder_id,user_id,day) VALUES(?,?,?)').run(r.id,user.id,clock.day);
     const claim=db.prepare("UPDATE deliveries SET state='sending',attempts=attempts+1,retry_at=? WHERE reminder_id=? AND user_id=? AND day=? AND state<>'sent' AND attempts<3 AND retry_at<=?").run(now.getTime()+900000,r.id,user.id,clock.day,now.getTime());
     if(!claim.changes)continue;
     try{await mailer.send(reminderMessage(r,user,clock.day));db.prepare("UPDATE deliveries SET state='sent',error=NULL WHERE reminder_id=? AND user_id=? AND day=?").run(r.id,user.id,clock.day);}
     catch{db.prepare("UPDATE deliveries SET state='failed',error='发送失败，请检查QQ邮箱配置或服务连接' WHERE reminder_id=? AND user_id=? AND day=?").run(r.id,user.id,clock.day);}
    }
   }
  }finally{busy=false;}
 }
 function start(){const tick=()=>run().catch(()=>console.error('邮件提醒检查失败'));tick();const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);}
 return {run,start};
}
