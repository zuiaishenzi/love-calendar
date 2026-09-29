import {randomBytes,randomInt,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {verificationMessage} from './mail.mjs';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const fail=(status,message)=>Object.assign(new Error(message),{status});
const emailOf=x=>{const email=String(x||'').trim().toLowerCase();if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email))throw fail(400,'请输入有效邮箱');return email;};
export function passwordMatches(user,password){return timingSafeEqual(scryptSync(String(password||'').slice(0,1024),user?.salt||'dummy-salt',64),user?Buffer.from(user.hash,'hex'):Buffer.alloc(64));}
export function accountService(db,mailer) {
 function limit(key,count,duration){const now=Date.now();db.prepare('DELETE FROM attempts WHERE until<?').run(now);const a=db.prepare('SELECT * FROM attempts WHERE key=?').get(key);if(a?.count>=count)throw fail(429,'操作过于频繁，请稍后再试');db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+duration);}
 function authenticate(req){const token=req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/)?.[1]||'';return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(token),Date.now());}
 function publicUser(user){const ledger=db.prepare('SELECT code FROM ledgers WHERE id=?').get(user.ledger_id);return {id:user.id,name:user.name,email:user.email,email_enabled:Boolean(user.email_enabled),ledger_code:ledger.code,members:db.prepare('SELECT id,name,email IS NOT NULL AS verified,email_enabled FROM users WHERE ledger_id=? ORDER BY seat').all(user.ledger_id),mail_ready:mailer.ready};}
 function session(res,user){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+604800000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return publicUser(user);}
 function verify(email,purpose,owner,code){const v=db.prepare('SELECT * FROM verification WHERE email=? AND purpose=? AND owner=?').get(email,purpose,owner);if(!v||v.expires<Date.now()||v.tries>=5)throw fail(400,'验证码已失效，请重新获取');db.prepare('UPDATE verification SET tries=tries+1 WHERE email=? AND purpose=? AND owner=?').run(email,purpose,owner);if(!/^\d{6}$/.test(String(code||''))||hash(v.nonce+code)!==v.digest)throw fail(400,'验证码不正确');}
 function consume(email,purpose,owner){db.prepare('DELETE FROM verification WHERE email=? AND purpose=? AND owner=?').run(email,purpose,owner);}
 async function route(req,res,url,input,user){
  const ip=req.socket.remoteAddress;
  if(url.pathname==='/api/config'&&req.method==='GET')return {mail_ready:mailer.ready};
  if(url.pathname==='/api/login'&&req.method==='POST'){
   limit('login:'+ip,10,900000);const u=db.prepare('SELECT * FROM users WHERE name=?').get(String(input.name||''));
   const matches=passwordMatches(u,input.password);if(!u||!matches)throw fail(401,'账号或密码不正确');db.prepare('DELETE FROM attempts WHERE key=?').run('login:'+ip);return session(res,u);
  }
  if(url.pathname==='/api/email/code'&&req.method==='POST'){
   const purpose=input.purpose;if(!['register','bind'].includes(purpose))throw fail(400,'验证用途错误');if(purpose==='bind'&&!user)throw fail(401,'请先登录');
   if(!mailer.ready)throw fail(503,'服务器尚未配置QQ发件邮箱，请联系部署者');
   const email=emailOf(input.email),owner=purpose==='bind'?user.id:0;
   limit('code-ip:'+ip,20,3600000);limit('code-minute:'+email,1,60000);limit('code-hour:'+email,6,3600000);
   if(purpose==='bind'&&!passwordMatches(user,input.password))throw fail(400,'当前密码不正确');
   if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail(409,'这个邮箱已绑定账号');
   const code=String(randomInt(0,1000000)).padStart(6,'0'),nonce=randomBytes(16).toString('hex');
   db.prepare('DELETE FROM verification WHERE expires<?').run(Date.now());
   db.prepare('INSERT OR REPLACE INTO verification(email,purpose,owner,digest,nonce,expires,tries) VALUES(?,?,?,?,?,?,0)').run(email,purpose,owner,hash(nonce+code),nonce,Date.now()+600000);
   try{await mailer.send(verificationMessage(email,code));}catch{db.prepare('DELETE FROM verification WHERE email=? AND purpose=? AND owner=? AND nonce=?').run(email,purpose,owner,nonce);throw fail(502,'验证码发送失败，请检查服务器QQ邮箱配置或稍后重试');}
   return {ok:true,expires_in:600};
  }
  if(url.pathname==='/api/register'&&req.method==='POST'){
   if(user)throw fail(409,'你已经绑定一本日历，不能再次注册');
   limit('register:'+ip,20,3600000);
   const email=emailOf(input.email),name=String(input.name||'').trim(),password=String(input.password||''),code=String(input.ledger_code||'').trim().toUpperCase();
   if(!/^[\p{L}\p{N}_-]{2,30}$/u.test(name))throw fail(400,'账号须为2至30位文字、数字、下划线或短横线');
   if(password.length<8||password.length>128)throw fail(400,'密码需要8至128位');
   if(!/^[A-Z0-9-]{8,64}$/.test(code))throw fail(400,'账本号须为8至64位字母、数字或短横线');
   verify(email,'register',0,input.code);
   const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');
   db.exec('BEGIN IMMEDIATE');
   let id;
   try{
    if(db.prepare('SELECT id FROM users WHERE name=? OR email=?').get(name,email))throw fail(409,'账号或邮箱已注册，不能重复绑定日历');
    let ledger=db.prepare('SELECT * FROM ledgers WHERE code=?').get(code);
    if(!ledger){ledger={id:Number(db.prepare('INSERT INTO ledgers(code) VALUES(?)').run(code).lastInsertRowid)};}
    const members=db.prepare('SELECT seat FROM users WHERE ledger_id=?').all(ledger.id);if(members.length>=2)throw fail(409,'这本日历已有两人，不能再加入');
    const seat=members.some(m=>m.seat===1)?2:1;
    id=Number(db.prepare('INSERT INTO users(name,hash,salt,ledger_id,seat,email) VALUES(?,?,?,?,?,?)').run(name,digest,salt,ledger.id,seat,email).lastInsertRowid);
    consume(email,'register',0);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   return session(res,db.prepare('SELECT * FROM users WHERE id=?').get(id));
  }
  if(url.pathname==='/api/profile'&&req.method==='POST'){
   if(!user)throw fail(401,'请先登录');limit('profile:'+user.id,20,3600000);
   if(typeof input.email_enabled!=='boolean')throw fail(400,'请选择是否接收提醒');
   const email=emailOf(input.email);
   if(email!==user.email){
    if(!passwordMatches(user,input.password))throw fail(400,'当前密码不正确');
    verify(email,'bind',user.id,input.code);
    if(db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email,user.id))throw fail(409,'这个邮箱已绑定其他账号');
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET email=?,email_enabled=? WHERE id=?').run(email,Number(input.email_enabled),user.id);consume(email,'bind',user.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   }else db.prepare('UPDATE users SET email_enabled=? WHERE id=?').run(Number(input.email_enabled),user.id);
   return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
  }
  return undefined;
 }
 return {authenticate,publicUser,route};
}
