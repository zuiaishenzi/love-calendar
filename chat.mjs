import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {fail} from './accounts.mjs';
import {sendMedia} from './media.mjs';

export function chatService(db,notify,{now=()=>Date.now()}={}){
 async function route(req,res,url,user,input,check){
  const p=url.pathname,ledger=user.ledger_id;
  if(p==='/api/chat/memory'&&req.method==='POST'){
   check();const ids=input.ids;
   if(!Array.isArray(ids)||ids.length<1||ids.length>50||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw fail(400,'请选择1至50条不同的聊天消息');
   const rows=db.prepare(`SELECT m.*,u.name FROM chat_messages m JOIN users u ON u.id=m.sender WHERE m.ledger_id=? AND m.retracted_at IS NULL AND m.id IN (${ids.map(()=>'?').join(',')}) ORDER BY m.id`).all(ledger,...ids);
   if(rows.length!==ids.length)throw fail(404,'部分消息不存在或不属于当前账本');
   if(rows.reduce((sum,r)=>sum+(r.data?.length||0),0)>25*1024*1024)throw fail(400,'选中附件超过25MB，请减少选择');
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
   const memoryId=db.transaction(()=>{
    const stamp=now(),id=Number(db.prepare('INSERT INTO memories(day,title,body,author,updated,ledger_id) VALUES(?,?,?,?,?,?)').run(day,'今天的对话','',user.id,stamp,ledger).lastInsertRowid);
    db.prepare('INSERT INTO perspectives(memory_id,author,body,updated) VALUES(?,?,?,?)').run(id,user.id,'',stamp);
    rows.forEach((r,position)=>db.prepare('INSERT INTO memory_chat_messages(id,memory_id,position,sender,sender_name,kind,text,data,mime,created,duration) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomBytes(18).toString('hex'),id,position,r.sender,r.name,r.kind,r.text,r.data,r.mime,r.created,r.duration));return id;
   })();notify(user,'memory');return {id:memoryId,day,count:rows.length};
  }
  if(p==='/api/chat/history'&&req.method==='GET'){
   const kind=url.searchParams.get('kind')||'',q=(url.searchParams.get('q')||'').trim(),before=Number(url.searchParams.get('before')||0);
   if(kind&&!['text','image','audio'].includes(kind)||q.length>200||!Number.isSafeInteger(before)||before<0)throw fail(400,'检索条件无效');
   function boundary(key,end){const value=url.searchParams.get(key);if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw fail(400,'日期无效');const stamp=Date.parse(value+'T00:00:00+08:00');if(!Number.isFinite(stamp)||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp)!==value)throw fail(400,'日期无效');return stamp+(end?86400000:0);}
   const from=boundary('from',false),to=boundary('to',true);if(from!==null&&to!==null&&from>=to)throw fail(400,'开始日期不能晚于结束日期');
   const clauses=['m.ledger_id=?','m.retracted_at IS NULL'],args=[ledger];
   if(kind){clauses.push('m.kind=?');args.push(kind);}if(q){clauses.push('instr(lower(m.text),lower(?))>0');args.push(q);}if(from!==null){clauses.push('m.created>=?');args.push(from);}if(to!==null){clauses.push('m.created<?');args.push(to);}if(before){clauses.push('m.id<?');args.push(before);}
   const rows=db.prepare('SELECT m.id,m.sender,m.kind,m.text,m.mime,m.duration,m.created,u.name FROM chat_messages m JOIN users u ON u.id=m.sender WHERE '+clauses.join(' AND ')+' ORDER BY m.id DESC LIMIT 51').all(...args);
   return {messages:rows.slice(0,50),more:rows.length>50};
  }
  if(p==='/api/chat/messages'&&req.method==='GET'){
   const since=Number(url.searchParams.get('since')||0);if(!Number.isSafeInteger(since)||since<0)throw fail(400,'同步信息无效');const revision=now();
   const cursor=Number(url.searchParams.get('before')||0);if(!Number.isSafeInteger(cursor)||cursor<0)throw fail(400,'分页信息无效');
   const rows=db.prepare('SELECT m.id,m.sender,m.kind,m.text,m.mime,m.duration,m.created,m.retracted_at,u.name FROM chat_messages m JOIN users u ON u.id=m.sender WHERE m.ledger_id=? AND (?=0 OR m.id<?) ORDER BY m.id DESC LIMIT 51').all(ledger,cursor,cursor);
   const more=rows.length>50;return {messages:rows.slice(0,50).reverse(),more,revision,retractions:db.prepare('SELECT id,retracted_at FROM chat_messages WHERE ledger_id=? AND retracted_at>=?').all(ledger,since),members:db.prepare('SELECT id,name,avatar,avatar_data IS NOT NULL AS avatar_uploaded,ledger_id,seat FROM users WHERE ledger_id=? ORDER BY seat').all(ledger).map(u=>({id:u.id,name:u.name,avatar:u.avatar||`pair-${(u.ledger_id-1)%5+1}-${u.seat}`,avatar_uploaded:Boolean(u.avatar_uploaded)}))};
  }
  if(p==='/api/chat/messages'&&req.method==='POST'){
   check();const count=db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE ledger_id=?').get(ledger).n;if(count>=10000)throw fail(400,'聊天记录已达10000条上限');
   const recent=db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE sender=? AND created>?').get(user.id,now()-60000).n;if(recent>=30)throw fail(429,'发送过于频繁，请稍后重试');
   const duration=input.duration??null;if(duration!==null&&(!Number.isFinite(duration)||duration<=0||duration>120))throw fail(400,'语音时长无效');
   const kind=input.kind;if(!['text','image','audio'].includes(kind))throw fail(400,'消息类型无效');let text='',data=null,mime=null;
   if(kind==='text'){if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw fail(400,'请输入4000字以内的消息');text=input.text.trim();}
   else{
    if(typeof input.data!=='string'||input.data.length>7000000||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))throw fail(400,'附件格式错误或超过5MB');data=Buffer.from(input.data,'base64');if(!data.length||data.length>5*1024*1024)throw fail(400,'附件须在5MB以内');
    if(kind==='image'){try{const image=sharp(data,{limitInputPixels:20000000}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format))throw Error();data=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();mime='image/webp';}catch{throw fail(400,'请选择有效的 JPG、PNG 或 WebP 图片');}}
    else{const signature=data.subarray(0,4).toString('hex');mime=signature==='1a45dfa3'?'audio/webm':data.toString('ascii',0,4)==='OggS'?'audio/ogg':data.toString('ascii',4,8)==='ftyp'?'audio/mp4':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WAVE'?'audio/wav':null;if(!mime)throw fail(400,'语音格式须为 WebM、Ogg、MP4 或 WAV');}
   }
   check();const id=Number(db.prepare('INSERT INTO chat_messages(ledger_id,sender,kind,text,data,mime,created,duration) VALUES(?,?,?,?,?,?,?,?)').run(ledger,user.id,kind,text,data,mime,now(),kind==='audio'?duration:null).lastInsertRowid);notify(user);return {id};
  }
  const retract=p.match(/^\/api\/chat\/messages\/(\d+)\/retract$/);
  if(retract&&req.method==='POST'){check();const row=db.prepare('SELECT sender FROM chat_messages WHERE id=? AND ledger_id=?').get(Number(retract[1]),ledger);if(!row)throw fail(404,'消息不存在');if(row.sender!==user.id)throw fail(403,'只能撤回自己发送的消息');db.prepare("UPDATE chat_messages SET text='',data=NULL,mime=NULL,retracted_at=COALESCE(retracted_at,?) WHERE id=? AND ledger_id=?").run(now(),Number(retract[1]),ledger);notify(user);return {ok:true};}
  const media=p.match(/^\/api\/chat\/media\/(\d+)$/);
  if(media&&req.method==='GET'){
   const row=db.prepare('SELECT data,mime FROM chat_messages WHERE id=? AND ledger_id=? AND kind!=? AND retracted_at IS NULL').get(Number(media[1]),ledger,'text');if(!row)throw fail(404,'附件不存在');const ext={'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/wav':'wav','image/webp':'webp'}[row.mime]||'bin';sendMedia(req,res,row,url.searchParams.get('download')==='1'?`语音-${media[1]}.${ext}`:null);return null;
  }
  throw fail(404,'接口不存在');
 }
 return {route,close(){}};
}
