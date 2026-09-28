import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {openDatabase} from './db.mjs';
import {accountService,hash,fail} from './accounts.mjs';
import {createMailer} from './mail.mjs';
import {validDay,monthDetails,occursOn,reminderParts,reminderLabel,nextOccurrence,shanghaiClock} from './calendar.mjs';
import {createReminderWorker} from './reminders.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const {version:appVersion}=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
async function body(req) {let size=0, chunks=[]; for await(const c of req) {size+=c.length; if(size>24*1024*1024) throw fail(413,'图片总大小过大'); chunks.push(c);} try{return JSON.parse(Buffer.concat(chunks));}catch{throw fail(400,'请求格式错误');}}
export function createApplication({dataDir=process.env.DATA_DIR||path.join(root,'data'),mailer=createMailer()}={}) {
const db=openDatabase(dataDir),accounts=accountService(db,mailer),worker=createReminderWorker(db,mailer);
function attachPerspectives(row){
 row.perspectives=db.prepare('SELECT p.*,u.name AS author_name FROM perspectives p JOIN users u ON u.id=p.author WHERE p.memory_id=? ORDER BY p.updated,p.author').all(row.id);
 for(const p of row.perspectives)p.photos=db.prepare('SELECT id FROM photos WHERE memory_id=? AND author=? ORDER BY rowid').all(row.id,p.author).map(x=>x.id);
 return row;
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try {
    const url=new URL(req.url,'http://localhost');
    if(!['GET','HEAD'].includes(req.method)) {
      const origin=process.env.APP_ORIGIN || `http://${req.headers.host}`;
      if(req.headers.origin!==origin) throw fail(403,'请求来源不正确');
      if(!req.headers['content-type']?.startsWith('application/json')) throw fail(415,'需要 JSON 请求');
    }
    const user=accounts.authenticate(req);
    const accountPaths=['/api/login','/api/register','/api/email/code','/api/profile','/api/config'];
    if(accountPaths.includes(url.pathname)){
      const input=req.method==='POST'?await body(req):{};
      const result=await accounts.route(req,res,url,input,user);
      if(result!==undefined)return send(200,result);
    }
    if(url.pathname.startsWith('/api/')) {
      if(!user) throw fail(401,'请先登录');
      if(url.pathname==='/api/me' && req.method==='GET') return send(200,accounts.publicUser(user));
      if(url.pathname==='/api/calendar' && req.method==='GET'){
        const month=url.searchParams.get('month');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||month<'2000-01')throw fail(400,'月份格式错误');
        return send(200,monthDetails(month));
      }
      if(url.pathname==='/api/reminders'&&req.method==='GET'){
        const today=shanghaiClock().day;const month=url.searchParams.get('month');if(month&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'))throw fail(400,'月份格式错误');
        const rows=db.prepare('SELECT * FROM reminders WHERE ledger_id=? AND (private_owner IS NULL OR private_owner=?) ORDER BY base_day,id').all(user.ledger_id,user.id);
        for(const r of rows){r.label=reminderLabel(r);r.next_day=nextOccurrence(r,today);if(month)r.dates=monthDetails(month).days.filter(d=>occursOn(r,d.day)).map(d=>d.day);r.delivery=db.prepare('SELECT day,state,attempts,error FROM deliveries WHERE reminder_id=? AND user_id=? ORDER BY day DESC LIMIT 1').get(r.id,user.id)||null;}
        return send(200,rows);
      }
      if(url.pathname==='/api/reminders'&&req.method==='POST'){
        const input=await body(req);
        if(!validDay(input.base_day)||!['solar','lunar'].includes(input.kind)||typeof input.title!=='string'||!input.title.trim()||input.title.length>100||typeof input.enabled!=='boolean')throw fail(400,'请填写提醒名称、有效日期及历法');
        if(input.private!==undefined&&typeof input.private!=='boolean')throw fail(400,'提醒隐私设置错误');
        const owner=input.private===true?user.id:null;
        const recipient=owner??input.recipient_id??null;
        if(recipient!==null&&(!Number.isSafeInteger(recipient)||!db.prepare('SELECT id FROM users WHERE id=? AND ledger_id=?').get(recipient,user.ledger_id)))throw fail(400,'请选择本日历的提醒接收人');
        const parts=reminderParts(input.base_day,input.kind);
        if(input.id){const result=db.prepare('UPDATE reminders SET title=?,base_day=?,kind=?,month=?,day=?,enabled=?,recipient_id=?,private_owner=? WHERE id=? AND ledger_id=? AND (private_owner IS NULL OR private_owner=?)').run(input.title.trim(),input.base_day,input.kind,parts.month,parts.day,Number(input.enabled),recipient,owner,input.id,user.ledger_id,user.id);if(!result.changes)throw fail(404,'提醒不存在');}
        else {if(db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE ledger_id=?').get(user.ledger_id).n>=100)throw fail(400,'每本日历最多100条提醒');db.prepare('INSERT INTO reminders(ledger_id,creator,title,base_day,kind,month,day,enabled,recipient_id,private_owner) VALUES(?,?,?,?,?,?,?,?,?,?)').run(user.ledger_id,user.id,input.title.trim(),input.base_day,input.kind,parts.month,parts.day,Number(input.enabled),recipient,owner);}
        return send(200,{ok:true});
      }
      const reminder=url.pathname.match(/^\/api\/reminders\/(\d+)$/);
      if(reminder&&req.method==='DELETE'){const r=db.prepare('DELETE FROM reminders WHERE id=? AND ledger_id=? AND (private_owner IS NULL OR private_owner=?)').run(Number(reminder[1]),user.ledger_id,user.id);if(!r.changes)throw fail(404,'提醒不存在');return send(200,{ok:true});}
      if(url.pathname==='/api/timeline' && req.method==='GET') {
        const rows=db.prepare('SELECT memories.*, users.name AS author_name FROM memories JOIN users ON author=users.id WHERE memories.ledger_id=? ORDER BY day,id').all(user.ledger_id);
        const photos=db.prepare('SELECT photos.id,photos.memory_id FROM photos JOIN memories ON memories.id=photos.memory_id WHERE memories.ledger_id=? ORDER BY photos.rowid').all(user.ledger_id);
        const byMemory=new Map();
        for(const photo of photos) {if(!byMemory.has(photo.memory_id)) byMemory.set(photo.memory_id,[]);byMemory.get(photo.memory_id).push(photo.id);}
        for(const row of rows){row.photos=byMemory.get(row.id)||[];attachPerspectives(row);}
        return send(200,rows);
      }
      if(url.pathname==='/api/logout' && req.method==='POST') {db.prepare('DELETE FROM sessions WHERE token=?').run(hash(req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/)?.[1]||''));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{});}
      if(url.pathname==='/api/memories' && req.method==='GET') {
        const month=url.searchParams.get('month'); if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')) throw fail(400,'月份格式错误');
        const rows=db.prepare('SELECT memories.*, users.name AS author_name FROM memories JOIN users ON author=users.id WHERE memories.ledger_id=? AND day LIKE ? ORDER BY day,id').all(user.ledger_id,month+'-%');
        for(const row of rows){row.photos=db.prepare('SELECT id FROM photos WHERE memory_id=?').all(row.id).map(p=>p.id);attachPerspectives(row);}
        return send(200,rows);
      }
      if(url.pathname==='/api/memories' && req.method==='POST') {
        const input=await body(req);
        if(!validDay(input.day) || typeof input.title!=='string' || !input.title.trim() || input.title.length>100 || typeof input.body!=='string' || input.body.length>20000) throw fail(400,'请填写有效日期、标题（100字以内）和正文（20000字以内）');
        if(!Array.isArray(input.photos)||input.photos.length>6) throw fail(400,'每条回忆最多6张图片');
        const photos=input.photos.map(p=>{
          if(typeof p.data!=='string') throw fail(400,'图片格式错误');
          const data=Buffer.from(p.data,'base64');
          const mime=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':data[0]===255&&data[1]===216&&data[2]===255?'image/jpeg':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'?'image/webp':null;
          if(!mime||data.length>5*1024*1024) throw fail(400,'仅支持不超过5MB的 JPG、PNG、WebP 图片');
          return {data,mime,id:randomBytes(18).toString('hex')};
        });
        db.exec('BEGIN IMMEDIATE');
        try {
          let id=input.id;
          if(id) {if(!db.prepare('SELECT id FROM memories WHERE id=? AND ledger_id=?').get(id,user.ledger_id)) throw fail(404,'回忆不存在');db.prepare('UPDATE memories SET day=?,title=?,body=CASE WHEN author=? THEN ? ELSE body END,updated=? WHERE id=?').run(input.day,input.title.trim(),user.id,input.body,Date.now(),id);}
          else id=Number(db.prepare('INSERT INTO memories(day,title,body,author,updated,ledger_id) VALUES(?,?,?,?,?,?)').run(input.day,input.title.trim(),input.body,user.id,Date.now(),user.ledger_id).lastInsertRowid);
          db.prepare('INSERT INTO perspectives(memory_id,author,body,updated) VALUES(?,?,?,?) ON CONFLICT(memory_id,author) DO UPDATE SET body=excluded.body,updated=excluded.updated').run(id,user.id,input.body,Date.now());
          const kept=Array.isArray(input.keepPhotos)?input.keepPhotos:[];
          for(const p of db.prepare('SELECT id FROM photos WHERE memory_id=? AND author=?').all(id,user.id)) if(!kept.includes(p.id)) db.prepare('DELETE FROM photos WHERE id=?').run(p.id);
          if(db.prepare('SELECT COUNT(*) AS n FROM photos WHERE memory_id=? AND author=?').get(id,user.id).n+photos.length>6) throw fail(400,'每条回忆最多6张图片');
          for(const p of photos) db.prepare('INSERT INTO photos(id,memory_id,mime,data,author) VALUES(?,?,?,?,?)').run(p.id,id,p.mime,p.data,user.id);
          db.exec('COMMIT'); return send(200,{id});
        } catch(e) {db.exec('ROLLBACK');throw e;}
      }
      const photo=url.pathname.match(/^\/api\/photos\/([a-f0-9]{36})$/);
      if(photo && req.method==='GET') {const p=db.prepare('SELECT photos.* FROM photos JOIN memories ON photos.memory_id=memories.id WHERE photos.id=? AND memories.ledger_id=?').get(photo[1],user.ledger_id);if(!p) throw fail(404,'图片不存在');res.writeHead(200,{'Content-Type':p.mime});return res.end(Buffer.from(p.data));}
      const memory=url.pathname.match(/^\/api\/memories\/(\d+)$/);
      if(memory && req.method==='DELETE') {const result=db.prepare('DELETE FROM memories WHERE id=? AND ledger_id=?').run(Number(memory[1]),user.ledger_id);if(!result.changes)throw fail(404,'回忆不存在');return send(200,{});}
      throw fail(404,'接口不存在');
    }
    const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/features.js':['features.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
    const file=files[url.pathname]; if(!file || req.method!=='GET') throw fail(404,'页面不存在');
    const content=readFileSync(path.join(root,'public',file[0]));
    res.writeHead(200,{'Content-Type':file[1]});res.end(file[0]==='index.html'?content.toString('utf8').replaceAll('{{APP_VERSION}}',appVersion):content);
  } catch(e) {if(!e.status) console.error('请求处理失败',e.code||'internal');send(e.status||500,{error:e.status?e.message:'服务暂时不可用，请稍后重试'});}
});
return {server,db,worker};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server,worker}=createApplication();
 server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>{console.log('恋爱万年历 v'+appVersion+' 已启动');worker.start();});
}
