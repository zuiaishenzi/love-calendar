import {notificationFeed} from './notifications.mjs';
import {appUpdates} from './app-updates.mjs';
import {createRealtime} from './realtime.mjs';
import sharp from 'sharp';
import http from 'node:http';
import { randomBytes,createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {openDatabase} from './db.mjs';
import {accountService,hash,fail} from './accounts.mjs';
import {createMailer} from './mail.mjs';
import {validDay,monthDetails,occursOn,reminderParts,reminderLabel,nextOccurrence,shanghaiClock} from './calendar.mjs';
import {createReminderWorker} from './reminders.mjs';
import {lifecycleService} from './lifecycle.mjs';
import {memoirDocument} from './memoir-export.mjs';
import {Readable} from 'node:stream';
import {memoService,createMemoOrganizer} from './memos.mjs';
import {chatService} from './chat.mjs';
import {createSpeechRecognizer} from './speech.mjs';
import {memoryAttachments,sendMedia} from './media.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const {version:appVersion}=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
async function body(req,max=32*1024*1024) {let size=0, chunks=[]; for await(const c of req) {size+=c.length; if(size>max) throw fail(413,'上传内容总大小过大'); chunks.push(c);} try{return JSON.parse(Buffer.concat(chunks));}catch{throw fail(400,'请求格式错误');}}
export function createApplication({dataDir=process.env.DATA_DIR||path.join(root,'data'),mailer=createMailer(),memoOrganizer=createMemoOrganizer(),speechRecognizer=createSpeechRecognizer()}={}) {
const db=openDatabase(dataDir),lifecycle=lifecycleService(db,mailer),accounts=accountService(db,mailer,lifecycle),worker=createReminderWorker(db,mailer);
lifecycle.purge();
const cleanup=setInterval(()=>{try{lifecycle.purge();}catch{console.error('账本到期清理失败');}},60000);cleanup.unref();
const realtime=createRealtime(accounts.authenticate,lifecycle.status);
const memos=memoService(db,memoOrganizer);
const chat=chatService(db,(user,type)=>{if(type==='memory')realtime.changed(user);else realtime.chat(user);},{speechRecognizer});
const updateApp=appUpdates(process.env.APP_UPDATE_DIR||path.join(dataDir,'app-updates'));
const pendingThumbnails=new Map();
const avatarAssets=new Map();
function memoryReplies(id){return db.prepare('SELECT r.id,r.author,r.body,r.created,u.name AS author_name FROM memory_replies r JOIN users u ON u.id=r.author WHERE r.memory_id=? ORDER BY r.id').all(id);}
function attachPerspectives(row){
 row.replies=memoryReplies(row.id);
 row.chat_messages=db.prepare('SELECT id,sender,sender_name AS name,kind,text,mime,created,duration FROM memory_chat_messages WHERE memory_id=? ORDER BY position').all(row.id);
 row.perspectives=db.prepare('SELECT p.*,u.name AS author_name FROM perspectives p JOIN users u ON u.id=p.author WHERE p.memory_id=? ORDER BY p.rowid').all(row.id);
 for(const p of row.perspectives){p.photos=db.prepare('SELECT id FROM photos WHERE memory_id=? AND author=? ORDER BY rowid').all(row.id,p.author).map(x=>x.id);p.attachments=db.prepare('SELECT id,name,kind,mime,length(data) AS size FROM memory_attachments WHERE memory_id=? AND author=? ORDER BY rowid').all(row.id,p.author);}
 return row;
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/app/update'||url.pathname.startsWith('/api/app/download/'))return updateApp(req,res,url);
    if(!['GET','HEAD'].includes(req.method)) {
      const origin=process.env.APP_ORIGIN || `http://${req.headers.host}`;
      if(req.headers.origin!==origin) throw fail(403,'请求来源不正确');
      if(!req.headers['content-type']?.startsWith('application/json')) throw fail(415,'需要 JSON 请求');
    }
    lifecycle.purge();
    const user=accounts.authenticate(req);
    const ensureWritable=()=>{if(!user||accounts.authenticate(req)?.id!==user.id)throw fail(401,'请重新登录');lifecycle.writable(user.ledger_id);};
    const accountPaths=['/api/login','/api/register','/api/email/code','/api/profile','/api/config','/api/password/reset'];
    if(accountPaths.includes(url.pathname)){
      const input=req.method==='POST'?await body(req):{};
      const result=await accounts.route(req,res,url,input,accounts.authenticate(req));
      if(result!==undefined)return send(200,result);
    }
    if(url.pathname.startsWith('/api/')) {
      if(!user) throw fail(401,'请先登录');
      const chatAttachment=url.pathname.match(/^\/api\/memory-chat-media\/([a-f0-9]{36})$/);
      if(chatAttachment&&req.method==='GET'){
        const row=db.prepare('SELECT c.data,c.mime FROM memory_chat_messages c JOIN memories m ON m.id=c.memory_id WHERE c.id=? AND m.ledger_id=? AND c.kind!=?').get(chatAttachment[1],user.ledger_id,'text');if(!row)throw fail(404,'附件不存在');
        sendMedia(req,res,row);return;
      }
      const replyMatch=url.pathname.match(/^\/api\/memories\/(\d+)\/replies$/);
      if(replyMatch){
        const id=Number(replyMatch[1]);if(!db.prepare('SELECT id FROM memories WHERE id=? AND ledger_id=?').get(id,user.ledger_id))throw fail(404,'回忆不存在');
        if(req.method==='GET')return send(200,memoryReplies(id));
        if(req.method==='POST'){
          const input=await body(req,32*1024);ensureWritable();if(typeof input.body!=='string'||!input.body.trim()||input.body.length>2000)throw fail(400,'请输入2000字以内的回复');
          db.transaction(()=>{if(!db.prepare('SELECT id FROM memories WHERE id=? AND ledger_id=?').get(id,user.ledger_id))throw fail(404,'回忆不存在');if(db.prepare('SELECT count(*) AS n FROM memory_replies WHERE memory_id=? AND author=?').get(id,user.id).n>=5)throw fail(400,'你在这条回忆下已发送5条回复');db.prepare('INSERT INTO memory_replies(memory_id,author,body,created) VALUES(?,?,?,?)').run(id,user.id,input.body.trim(),Date.now());db.prepare('UPDATE memories SET updated=? WHERE id=?').run(Date.now(),id);})();realtime.changed(user);return send(200,memoryReplies(id));
        }
        throw fail(405,'请求方法不支持');
      }
      if(url.pathname.startsWith('/api/chat/')){const result=await chat.route(req,res,url,user,req.method==='POST'?await body(req):{},ensureWritable);if(result!==null)send(200,result);return;}
      const memoImage=url.pathname.match(/^\/api\/memos\/images\/(\d+)$/);
      if(memoImage&&req.method==='GET'){const row=db.prepare('SELECT i.data FROM memo_images i JOIN memo_notes n ON n.id=i.note_id WHERE i.id=? AND n.user_id=?').get(Number(memoImage[1]),user.id);if(!row)throw fail(404,'图片不存在');res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'private, no-store'});return res.end(row.data);}
      if(url.pathname==='/api/memos'||url.pathname.startsWith('/api/memos/'))return send(200,await memos.route(req,url,user,req.method==='POST'?await body(req):{},ensureWritable));
      if(url.pathname==='/api/lifecycle'&&req.method==='GET')return send(200,lifecycle.status(user.ledger_id));
      if(['/api/lifecycle/code','/api/lifecycle/confirm'].includes(url.pathname)&&req.method==='POST'){
        const input=await body(req),active=accounts.authenticate(req);if(!active||active.id!==user.id)throw fail(401,'请重新登录');
        const result=url.pathname.endsWith('/code')?await lifecycle.sendCode(active,input.purpose):lifecycle.confirm(active,input.purpose,input.code);
        realtime.changed(user);return send(200,result);
      }
      if(!['GET','HEAD'].includes(req.method)&&!['/api/logout','/api/presence'].includes(url.pathname))lifecycle.writable(user.ledger_id);
      if(url.pathname==='/api/memoir/export'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':"attachment; filename=our-story.html; filename*=UTF-8''%E5%B2%81%E6%9C%88%E6%8B%BE%E5%BF%86.html"});
        const stream=Readable.from(memoirDocument(db,user.ledger_id));stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(url.pathname==='/api/avatar'&&req.method==='POST'){
        const input=await body(req);ensureWritable();
        if(input.preset){if(!/^pair-[1-5]-[12]$/.test(input.preset))throw fail(400,'请选择系统头像');db.prepare('UPDATE users SET avatar=?,avatar_data=NULL WHERE id=?').run(input.preset,user.id);}
        else{
          if(typeof input.data!=='string'||input.data.length>Math.ceil(20*1024*1024/3)*4)throw fail(400,'头像须为20MB以内的图片');
          let data;try{const raw=Buffer.from(input.data,'base64');if(raw.length>20*1024*1024)throw Error();const photo=sharp(raw,{limitInputPixels:20000000});const meta=await photo.metadata();if(!['jpeg','png','webp'].includes(meta.format))throw Error();data=await photo.rotate().resize(256,256,{fit:'cover'}).webp({quality:85}).toBuffer();}catch{throw fail(400,'请选择20MB以内的 JPG、PNG 或 WebP 图片');}
          ensureWritable();db.prepare('UPDATE users SET avatar_data=? WHERE id=?').run(data,user.id);
        }
        return send(200,accounts.publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)));
      }
      const avatar=url.pathname.match(/^\/api\/avatars\/(\d+)$/);
      if(avatar&&req.method==='GET'){const row=db.prepare('SELECT avatar_data FROM users WHERE id=? AND ledger_id=?').get(Number(avatar[1]),user.ledger_id);if(!row?.avatar_data)throw fail(404,'头像不存在');res.writeHead(200,{'Content-Type':'image/webp'});return res.end(row.avatar_data);}
      if(url.pathname==='/api/events'&&req.method==='GET'){
        const client=url.searchParams.get('client');if(!/^[a-zA-Z0-9-]{16,80}$/.test(client||''))throw fail(400,'连接标识无效');
        realtime.connect(client,user,req,res);return;
      }
      if(url.pathname==='/api/presence'&&req.method==='POST'){
        const input=await body(req);if(lifecycle.status(user.ledger_id)?.readonly)input.day=null;if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.client||'')||(input.day!==null&&!validDay(input.day)))throw fail(400,'编辑状态无效');
        if(!realtime.touch(input.client,user,input.day))throw fail(403,'连接标识不属于当前用户');
        return send(200,realtime.state(user));
      }
      if(url.pathname==='/api/notifications'&&req.method==='GET')return send(200,notificationFeed(db,user,url.searchParams));
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
        const input=await body(req);ensureWritable();
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
        const input=await body(req,240*1024*1024);ensureWritable();
        const attachments=memoryAttachments(input.attachments);
        if(input.keepAttachments!==undefined&&(!Array.isArray(input.keepAttachments)||input.keepAttachments.length>6||input.keepAttachments.some(id=>typeof id!=='string'||! /^[a-f0-9]{36}$/.test(id))))throw fail(400,'保留附件信息无效');
        if(!validDay(input.day) || typeof input.title!=='string' || !input.title.trim() || input.title.length>100 || typeof input.body!=='string' || input.body.length>20000) throw fail(400,'请填写有效日期、标题（100字以内）和正文（20000字以内）');
        if(!Array.isArray(input.photos)||input.photos.length>6) throw fail(400,'每条回忆最多6张图片');
        const photos=input.photos.map(p=>{
          if(typeof p.data!=='string') throw fail(400,'图片格式错误');
          const data=Buffer.from(p.data,'base64');
          const mime=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':data[0]===255&&data[1]===216&&data[2]===255?'image/jpeg':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'?'image/webp':null;
          if(!mime||data.length>20*1024*1024) throw fail(400,'仅支持不超过20MB的 JPG、PNG、WebP 图片');
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
          const own=db.prepare('SELECT id FROM memory_attachments WHERE memory_id=? AND author=?').all(id,user.id);
          for(const item of own)if(input.keepAttachments&&!input.keepAttachments.includes(item.id))db.prepare('DELETE FROM memory_attachments WHERE id=?').run(item.id);
          if(db.prepare('SELECT COUNT(*) AS n FROM memory_attachments WHERE memory_id=? AND author=?').get(id,user.id).n+attachments.length>6)throw fail(400,'每个视角最多6个视频或语音附件');
          for(const item of attachments)db.prepare('INSERT INTO memory_attachments(id,memory_id,author,name,kind,mime,data) VALUES(?,?,?,?,?,?,?)').run(item.id,id,user.id,item.name,item.kind,item.mime,item.data);
          db.exec('COMMIT'); realtime.changed(user);return send(200,{id});
        } catch(e) {db.exec('ROLLBACK');throw e;}
      }
      const attachment=url.pathname.match(/^\/api\/memory-attachments\/([a-f0-9]{36})$/);
      if(attachment&&req.method==='GET'){const row=db.prepare('SELECT a.name,a.mime,a.data FROM memory_attachments a JOIN memories m ON m.id=a.memory_id WHERE a.id=? AND m.ledger_id=?').get(attachment[1],user.ledger_id);if(!row)throw fail(404,'附件不存在');sendMedia(req,res,row,url.searchParams.get('download')==='1'?row.name:null);return;}
      const photo=url.pathname.match(/^\/api\/photos\/([a-f0-9]{36})$/);
      if(photo && req.method==='GET') {
        const id=photo[1],thumb=url.searchParams.get('size')==='thumb';
        const permitted=()=>db.prepare('SELECT photos.id,photos.mime FROM photos JOIN memories ON photos.memory_id=memories.id WHERE photos.id=? AND memories.ledger_id=?').get(id,user.ledger_id);
        const p=permitted();if(!p)throw fail(404,'图片不存在');
        // Revalidate every request after authorization; never allow shared proxy caching.
        const etag=`"${id}-${thumb?'thumb-v1':'original'}"`;
        res.setHeader('Cache-Control','private, no-cache');res.setHeader('ETag',etag);res.setHeader('Vary','Cookie');
        if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
        let result;
        if(thumb){
          result=db.prepare('SELECT data,mime FROM thumbnails WHERE photo_id=?').get(id);
          if(!result){
            if(!pendingThumbnails.has(id)){
              const original=db.prepare('SELECT data FROM photos WHERE id=?').get(id);
              const task=sharp(Buffer.from(original.data),{limitInputPixels:40000000}).rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer().then(data=>{
                if(db.prepare('SELECT id FROM photos WHERE id=?').get(id))db.prepare('INSERT OR IGNORE INTO thumbnails(photo_id,data,mime) VALUES(?,?,?)').run(id,data,'image/webp');
                return {data,mime:'image/webp'};
              }).finally(()=>pendingThumbnails.delete(id));
              pendingThumbnails.set(id,task);
            }
            try{result=await pendingThumbnails.get(id);}catch{throw fail(422,'无法生成此图片的预览');}
            if(!permitted())throw fail(404,'图片不存在');
          }
        }else result={data:db.prepare('SELECT data FROM photos WHERE id=?').get(id).data,mime:p.mime};
        res.writeHead(200,{'Content-Type':result.mime,'Content-Length':result.data.length});return res.end(Buffer.from(result.data));
      }
      const memory=url.pathname.match(/^\/api\/memories\/(\d+)$/);
      if(memory && req.method==='DELETE') {const result=db.prepare('DELETE FROM memories WHERE id=? AND ledger_id=?').run(Number(memory[1]),user.ledger_id);if(!result.changes)throw fail(404,'回忆不存在');realtime.changed(user);return send(200,{});}
      throw fail(404,'接口不存在');
    }
    const files={'/dialog-history.js':['dialog-history.js','text/javascript; charset=utf-8'],'/home-quotes.json':['home-quotes.json','application/json; charset=utf-8'],'/realtime.js':['realtime.js','text/javascript; charset=utf-8'],'/presence-messages.json':['presence-messages.json','application/json; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/photo-preview.js':['photo-preview.js','text/javascript; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/features.js':['features.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
    files['/settings.js']=['settings.js','text/javascript; charset=utf-8'];
    files['/memos.js']=['memos.js','text/javascript; charset=utf-8'];
    files['/chat.js']=['chat.js','text/javascript; charset=utf-8'];
    files['/notifications.js']=['notifications.js','text/javascript; charset=utf-8'];
    files['/speech.js']=['speech.js','text/javascript; charset=utf-8'];
    const presetAsset=url.pathname.match(/^\/avatars\/pair-([1-5])\.png$/);
    if(presetAsset&&req.method==='GET'){
      const id=presetAsset[1];if(!avatarAssets.has(id))avatarAssets.set(id,sharp(path.join(root,'public','avatars',`pair-${id}.png`)).resize(512,256).webp({quality:82}).toBuffer().catch(error=>{avatarAssets.delete(id);throw error;}));
      const data=await avatarAssets.get(id);res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400'});return res.end(data);
    }
    const file=files[url.pathname]; if(!file || req.method!=='GET') throw fail(404,'页面不存在');
    const content=readFileSync(path.join(root,'public',file[0]));
    const page=file[0]==='index.html'?content.toString('utf8').replaceAll('{{APP_VERSION}}',appVersion).replace(/(src|href)="(\/[^"?]+\.(?:js|css))\?v=[^"]*"/g,(match,attribute,url)=>{const asset=files[url];if(!asset)return match;const digest=createHash('sha256').update(readFileSync(path.join(root,'public',asset[0]))).digest('hex').slice(0,16);return `${attribute}="${url}?v=${appVersion}-${digest}"`;}):content;
    res.writeHead(200,{'Content-Type':file[1]});res.end(page);
  } catch(e) {if(!e.status) console.error('请求处理失败',e.code||'internal');send(e.status||500,{error:e.status?e.message:'服务暂时不可用，请稍后重试'});}
});
server.on('close',()=>{clearInterval(cleanup);chat.close();realtime.close();});
return {server,db,worker,realtime,lifecycle};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server,worker}=createApplication();
 server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>{console.log('恋爱万年历 v'+appVersion+' 已启动');worker.start();});
}
