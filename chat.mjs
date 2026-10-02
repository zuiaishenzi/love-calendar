import {randomUUID,randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {fail} from './accounts.mjs';

export function chatService(db,notify,{now=()=>Date.now()}={}){
 const calls=new Map();
 function active(user){const c=calls.get(user.ledger_id);if(c&&(now()-c.created>45000&&c.status==='ringing'||now()-Math.min(...Object.values(c.seen))>60000)){calls.delete(user.ledger_id);notify(user);return null;}return c||null;}
 function view(user){const c=active(user);if(!c)return null;const peer=c.caller===user.id?c.callee:c.caller;c.seen[user.id]=now();return {id:c.id,caller:c.caller,callee:c.callee,status:c.status,offer:c.caller===user.id?null:c.offer,answer:c.caller===user.id?c.answer:null,ice:c.ice[peer]};}
 function config(){const iceServers=[];if(process.env.CHAT_STUN_URL)iceServers.push({urls:process.env.CHAT_STUN_URL});if(process.env.CHAT_TURN_URL&&process.env.CHAT_TURN_USERNAME&&process.env.CHAT_TURN_PASSWORD)iceServers.push({urls:process.env.CHAT_TURN_URL,username:process.env.CHAT_TURN_USERNAME,credential:process.env.CHAT_TURN_PASSWORD});return {iceServers};}
 async function route(req,res,url,user,input,check){
  const p=url.pathname,ledger=user.ledger_id;
  if(p==='/api/chat/config'&&req.method==='GET')return config();
  if(p==='/api/chat/call'&&req.method==='GET'){if(db.prepare('SELECT delete_at FROM ledgers WHERE id=?').get(ledger)?.delete_at){calls.delete(ledger);return {call:null};}return {call:view(user)};}
  if(p==='/api/chat/call'&&req.method==='POST'){
   // Hangup remains available during deletion retention.
   if(input.action!=='hangup')check();let c=active(user);
   if(input.action==='offer'){
    if(c)throw fail(409,'当前已有通话，请先结束。');const peer=db.prepare('SELECT id FROM users WHERE ledger_id=? AND id!=?').get(ledger,user.id);if(!peer)throw fail(409,'另一人加入账本后才能通话。');
    if(typeof input.sdp!=='string'||!input.sdp.startsWith('v=0')||input.sdp.length>30000)throw fail(400,'通话信息无效');
    c={id:randomUUID(),caller:user.id,callee:peer.id,status:'ringing',offer:{type:'offer',sdp:input.sdp},answer:null,ice:{[user.id]:[],[peer.id]:[]},created:now(),seen:{[user.id]:now(),[peer.id]:now()}};calls.set(ledger,c);
   }else{
    if(!c||c.id!==input.id)throw fail(404,'通话已结束');
    if(input.action==='answer'){if(user.id!==c.callee||c.status!=='ringing')throw fail(409,'无法接听此通话');if(typeof input.sdp!=='string'||!input.sdp.startsWith('v=0')||input.sdp.length>30000)throw fail(400,'通话信息无效');c.answer={type:'answer',sdp:input.sdp};c.status='connected';}
    else if(input.action==='ice'){const x=input.candidate;if(!x||typeof x.candidate!=='string'||x.candidate.length>4000||!(x.sdpMid==null||typeof x.sdpMid==='string'&&x.sdpMid.length<100)||!(x.sdpMLineIndex==null||Number.isSafeInteger(x.sdpMLineIndex)&&x.sdpMLineIndex>=0))throw fail(400,'连接信息无效');if(c.ice[user.id].length>=100)throw fail(429,'连接候选过多');c.ice[user.id].push({candidate:x.candidate,sdpMid:x.sdpMid??null,sdpMLineIndex:x.sdpMLineIndex??null});}
    else if(input.action==='hangup')calls.delete(ledger);else throw fail(400,'通话操作无效');
   }
   notify(user);return {call:view(user)};
  }
  if(p==='/api/chat/memory'&&req.method==='POST'){
   check();const ids=input.ids;
   if(!Array.isArray(ids)||ids.length<1||ids.length>50||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw fail(400,'请选择1至50条不同的聊天消息');
   const rows=db.prepare(`SELECT m.*,u.name FROM chat_messages m JOIN users u ON u.id=m.sender WHERE m.ledger_id=? AND m.id IN (${ids.map(()=>'?').join(',')}) ORDER BY m.id`).all(ledger,...ids);
   if(rows.length!==ids.length)throw fail(404,'部分消息不存在或不属于当前账本');
   if(rows.reduce((sum,r)=>sum+(r.data?.length||0),0)>25*1024*1024)throw fail(400,'选中附件超过25MB，请减少选择');
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
   const memoryId=db.transaction(()=>{
    const stamp=now(),id=Number(db.prepare('INSERT INTO memories(day,title,body,author,updated,ledger_id) VALUES(?,?,?,?,?,?)').run(day,'今天的对话','',user.id,stamp,ledger).lastInsertRowid);
    db.prepare('INSERT INTO perspectives(memory_id,author,body,updated) VALUES(?,?,?,?)').run(id,user.id,'',stamp);
    rows.forEach((r,position)=>db.prepare('INSERT INTO memory_chat_messages(id,memory_id,position,sender,sender_name,kind,text,data,mime,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomBytes(18).toString('hex'),id,position,r.sender,r.name,r.kind,r.text,r.data,r.mime,r.created));return id;
   })();notify(user,'memory');return {id:memoryId,day,count:rows.length};
  }
  if(p==='/api/chat/messages'&&req.method==='GET'){
   const cursor=Number(url.searchParams.get('before')||0);if(!Number.isSafeInteger(cursor)||cursor<0)throw fail(400,'分页信息无效');
   const rows=db.prepare('SELECT m.id,m.sender,m.kind,m.text,m.mime,m.created,u.name FROM chat_messages m JOIN users u ON u.id=m.sender WHERE m.ledger_id=? AND (?=0 OR m.id<?) ORDER BY m.id DESC LIMIT 51').all(ledger,cursor,cursor);
   const more=rows.length>50;return {messages:rows.slice(0,50).reverse(),more,members:db.prepare('SELECT id,name,avatar,avatar_data IS NOT NULL AS avatar_uploaded,ledger_id,seat FROM users WHERE ledger_id=? ORDER BY seat').all(ledger).map(u=>({id:u.id,name:u.name,avatar:u.avatar||`pair-${(u.ledger_id-1)%5+1}-${u.seat}`,avatar_uploaded:Boolean(u.avatar_uploaded)}))};
  }
  if(p==='/api/chat/messages'&&req.method==='POST'){
   check();const count=db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE ledger_id=?').get(ledger).n;if(count>=10000)throw fail(400,'聊天记录已达10000条上限');
   const recent=db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE sender=? AND created>?').get(user.id,now()-60000).n;if(recent>=30)throw fail(429,'发送过于频繁，请稍后重试');
   const kind=input.kind;if(!['text','image','audio'].includes(kind))throw fail(400,'消息类型无效');let text='',data=null,mime=null;
   if(kind==='text'){if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw fail(400,'请输入4000字以内的消息');text=input.text.trim();}
   else{
    if(typeof input.data!=='string'||input.data.length>7000000||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))throw fail(400,'附件格式错误或超过5MB');data=Buffer.from(input.data,'base64');if(!data.length||data.length>5*1024*1024)throw fail(400,'附件须在5MB以内');
    if(kind==='image'){try{const image=sharp(data,{limitInputPixels:20000000}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format))throw Error();data=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();mime='image/webp';}catch{throw fail(400,'请选择有效的 JPG、PNG 或 WebP 图片');}}
    else{const signature=data.subarray(0,4).toString('hex');mime=signature==='1a45dfa3'?'audio/webm':data.toString('ascii',0,4)==='OggS'?'audio/ogg':data.toString('ascii',4,8)==='ftyp'?'audio/mp4':null;if(!mime)throw fail(400,'语音格式须为 WebM、Ogg 或 MP4');}
   }
   check();const id=Number(db.prepare('INSERT INTO chat_messages(ledger_id,sender,kind,text,data,mime,created) VALUES(?,?,?,?,?,?,?)').run(ledger,user.id,kind,text,data,mime,now()).lastInsertRowid);notify(user);return {id};
  }
  const media=p.match(/^\/api\/chat\/media\/(\d+)$/);
  if(media&&req.method==='GET'){
   const row=db.prepare('SELECT data,mime FROM chat_messages WHERE id=? AND ledger_id=? AND kind!=?').get(Number(media[1]),ledger,'text');if(!row)throw fail(404,'附件不存在');const bytes=Buffer.from(row.data);let start=0,end=bytes.length-1,status=200;
   if(req.headers.range){const range=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);if(!range||!range[1]&&!range[2])throw fail(416,'无效的播放范围');if(!range[1])start=Math.max(0,bytes.length-Number(range[2]));else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length){res.setHeader('Content-Range',`bytes */${bytes.length}`);throw fail(416,'播放范围超出附件');}status=206;}
   res.writeHead(status,{'Content-Type':row.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));return null;
  }
  throw fail(404,'接口不存在');
 }
 const timer=setInterval(()=>{for(const ledger of calls.keys()){if(!db.prepare('SELECT id FROM ledgers WHERE id=? AND delete_at IS NULL').get(ledger))calls.delete(ledger);else active({ledger_id:ledger});}},15000);timer.unref();
 return {route,close(){clearInterval(timer);calls.clear();}};
}
