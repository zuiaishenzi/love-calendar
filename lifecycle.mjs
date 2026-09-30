import {randomBytes,randomInt} from 'node:crypto';
import {fail,hash} from './accounts.mjs';

export const RETENTION=30*24*60*60*1000;
export function lifecycleService(db,mailer,{now=()=>Date.now()}={}){
 const ledger=id=>db.prepare('SELECT * FROM ledgers WHERE id=?').get(id);
 const members=id=>db.prepare('SELECT id,email FROM users WHERE ledger_id=? ORDER BY seat').all(id);
 function status(id){
  const l=ledger(id);if(!l)return null;
  const request=db.prepare('SELECT * FROM ledger_confirmations WHERE ledger_id=? AND expires>?').get(id,now());
  return {kind:l.delete_kind||null,delete_at:l.delete_at||null,readonly:Boolean(l.delete_at),request:request?{purpose:request.purpose,expires:request.expires,approved:db.prepare('SELECT user_id FROM ledger_votes WHERE request_id=? AND approved=1').all(request.id).map(v=>v.user_id)}:null};
 }
 function writable(id){if(ledger(id)?.delete_at)throw fail(423,'该账本正在注销中，目前仅可查看或下载。取消注销后可继续记录。');}
 function cancelSolo(id){const l=ledger(id);if(l?.delete_kind==='account'&&l.delete_at>now()){db.prepare('UPDATE ledgers SET delete_at=NULL,delete_kind=NULL WHERE id=?').run(id);db.prepare('DELETE FROM ledger_confirmations WHERE ledger_id=?').run(id);}}
 function purge(){
  db.prepare('DELETE FROM ledger_confirmations WHERE expires<=?').run(now());
  const rows=db.prepare('SELECT id FROM ledgers WHERE delete_at<=?').all(now());
  if(!rows.length)return 0;
  db.transaction(()=>{
   for(const {id} of rows){
    for(const person of members(id))for(const key of ['profile:'+person.id,'lifecycle-code:'+person.id,'code-minute:'+person.email,'code-hour:'+person.email])db.prepare('DELETE FROM attempts WHERE key=?').run(key);
    db.prepare('DELETE FROM ledger_confirmations WHERE ledger_id=?').run(id);
    db.prepare('DELETE FROM verification WHERE owner IN (SELECT id FROM users WHERE ledger_id=?) OR email IN (SELECT email FROM users WHERE ledger_id=?)').run(id,id);
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ledger_id=?)').run(id);
    db.prepare('DELETE FROM deliveries WHERE user_id IN (SELECT id FROM users WHERE ledger_id=?)').run(id);
    db.prepare('DELETE FROM reminders WHERE ledger_id=?').run(id);
    db.prepare('DELETE FROM memories WHERE ledger_id=?').run(id);
    db.prepare('DELETE FROM users WHERE ledger_id=?').run(id);
    db.prepare('DELETE FROM ledgers WHERE id=?').run(id);
   }
  })();
  db.pragma('wal_checkpoint(TRUNCATE)');return rows.length;
 }
 function validate(user,purpose){
  if(!['account-delete','ledger-delete','ledger-cancel'].includes(purpose))throw fail(400,'确认用途不正确');
  const l=ledger(user.ledger_id),people=members(user.ledger_id);
  if(!l||l.delete_at&&l.delete_at<=now())throw fail(410,'账本保留期已结束');
  if(purpose==='account-delete'&&people.length!==1)throw fail(409,'只有账本中仅有你一人时，才可以注销账号');
  if(purpose!=='account-delete'&&people.length!==2)throw fail(409,'此操作需要账本中的双方共同确认；单人账本请使用注销账号');
  if(purpose==='ledger-cancel'){if(l.delete_kind!=='ledger'||!l.delete_at)throw fail(409,'账本没有待取消的注销申请');}
  else if(l.delete_at)throw fail(409,'账本已经进入注销保留期');
  if(people.some(p=>!p.email))throw fail(400,'请先确保所有成员已绑定邮箱');
  return people;
 }
 function limit(user){const key='lifecycle-code:'+user.id,t=now(),old=db.prepare('SELECT * FROM attempts WHERE key=?').get(key);if(old&&old.until>t)throw fail(429,'请一分钟后再获取验证码');db.prepare('INSERT OR REPLACE INTO attempts VALUES(?,1,?)').run(key,t+60000);}
 async function sendCode(user,purpose){
  validate(user,purpose);if(!mailer.ready)throw fail(503,'邮件服务暂不可用');limit(user);
  db.prepare('DELETE FROM ledger_confirmations WHERE expires<=?').run(now());
  let request=db.prepare('SELECT * FROM ledger_confirmations WHERE ledger_id=?').get(user.ledger_id);
  if(request&&request.purpose!==purpose)throw fail(409,'另一项确认正在进行，请等待十分钟后重试');
  if(!request){request={id:randomBytes(16).toString('hex'),expires:now()+600000};db.prepare('INSERT INTO ledger_confirmations VALUES(?,?,?,?)').run(request.id,user.ledger_id,purpose,request.expires);}
  if(db.prepare('SELECT approved FROM ledger_votes WHERE request_id=? AND user_id=?').get(request.id,user.id)?.approved)throw fail(409,'你已确认，请等待对方在有效期内确认');
  const nonce=randomBytes(16).toString('hex'),code=String(randomInt(1000000)).padStart(6,'0');
  db.prepare('INSERT OR REPLACE INTO ledger_votes(request_id,user_id,email,nonce,digest) VALUES(?,?,?,?,?)').run(request.id,user.id,user.email,nonce,hash(nonce+code));
  const text=(purpose==='ledger-cancel'?'账本取消注销验证码：':'注销确认验证码：')+code;
  try{await mailer.send({to:user.email,subject:text,text});}catch{db.prepare('DELETE FROM ledger_votes WHERE request_id=? AND user_id=? AND nonce=?').run(request.id,user.id,nonce);throw fail(502,'邮件发送失败，请稍后重试');}
  return status(user.ledger_id);
 }
 function confirm(user,purpose,code){
  const people=validate(user,purpose),request=db.prepare('SELECT * FROM ledger_confirmations WHERE ledger_id=? AND purpose=? AND expires>?').get(user.ledger_id,purpose,now());
  if(!request)throw fail(400,'十分钟确认时间已结束，请双方重新获取验证码');
  const vote=db.prepare('SELECT * FROM ledger_votes WHERE request_id=? AND user_id=?').get(request.id,user.id);
  if(!vote||vote.email!==user.email||vote.tries>=5)throw fail(400,'验证码已失效，请重新获取');
  if(vote.approved)throw fail(409,'你已确认，请等待对方');
  db.prepare('UPDATE ledger_votes SET tries=tries+1 WHERE request_id=? AND user_id=?').run(request.id,user.id);
  if(!/^\d{6}$/.test(String(code))||hash(vote.nonce+code)!==vote.digest)throw fail(400,'验证码不正确');
  db.transaction(()=>{
   db.prepare('UPDATE ledger_votes SET approved=1 WHERE request_id=? AND user_id=?').run(request.id,user.id);
   const votes=db.prepare('SELECT user_id,email FROM ledger_votes WHERE request_id=? AND approved=1').all(request.id);
   if(people.every(p=>votes.some(v=>v.user_id===p.id&&v.email===p.email))){
    if(purpose==='ledger-cancel')db.prepare('UPDATE ledgers SET delete_at=NULL,delete_kind=NULL WHERE id=?').run(user.ledger_id);
    else db.prepare('UPDATE ledgers SET delete_at=?,delete_kind=? WHERE id=?').run(now()+RETENTION,purpose==='account-delete'?'account':'ledger',user.ledger_id);
    db.prepare('DELETE FROM ledger_confirmations WHERE id=?').run(request.id);
    if(purpose==='account-delete')db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
   }
  })();return status(user.ledger_id);
 }
 return {status,writable,cancelSolo,purge,sendCode,confirm};
}
