const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function* memoirDocument(db,ledger){
 yield '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; media-src data:; style-src \'unsafe-inline\'"><title>岁月拾忆 · 我们的故事</title><style>body{max-width:860px;margin:48px auto;padding:0 24px;background:#faf7f5;color:#49383c;font:16px/1.9 system-ui}header{text-align:center;padding:40px 0}h1,h2{font-family:serif;font-weight:500}time{color:#a46f81}article{border-left:2px solid #dfbcc8;padding:0 0 40px 28px}section{background:#fff;border-radius:16px;padding:22px;margin:16px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;max-height:600px;border-radius:12px}footer{color:#947b84;text-align:center}@media print{body{background:white}section{break-inside:avoid}img{max-height:350px}}</style><header><small>朝夕 · OUR DAYS</small><h1>岁月拾忆</h1><p>把一起走过的时光，轻轻收藏。</p></header><main>';
 for(const memory of db.prepare('SELECT id,day,title FROM memories WHERE ledger_id=? ORDER BY day,id').all(ledger)){
  yield `<article><time>${escape(memory.day)}</time><h2>${escape(memory.title)}</h2>`;
  for(const perspective of db.prepare('SELECT p.author,p.body,u.name FROM perspectives p JOIN users u ON u.id=p.author WHERE p.memory_id=? ORDER BY p.rowid').all(memory.id)){
   if(!perspective.body&&!db.prepare('SELECT id FROM photos WHERE memory_id=? AND author=?').get(memory.id,perspective.author)&&db.prepare('SELECT id FROM memory_chat_messages WHERE memory_id=?').get(memory.id))continue;
   yield `<section><h3>${escape(perspective.name)}的视角</h3><p>${escape(perspective.body)}</p>`;
   for(const photo of db.prepare('SELECT id FROM photos WHERE memory_id=? AND author=? ORDER BY rowid').all(memory.id,perspective.author)){
    const p=db.prepare('SELECT mime,data FROM photos WHERE id=?').get(photo.id);
    if(p&&['image/jpeg','image/png','image/webp'].includes(p.mime))yield `<img alt="回忆照片" src="data:${p.mime};base64,${Buffer.from(p.data).toString('base64')}">`;
   }
   yield '</section>';
  }
  const chats=db.prepare('SELECT * FROM memory_chat_messages WHERE memory_id=? ORDER BY position').all(memory.id);
  if(chats.length){yield '<section><h3>收藏的对话</h3>';for(const c of chats){yield `<div><h4>${escape(c.sender_name)} · ${escape(new Date(c.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</h4>`;if(c.kind==='text')yield `<p>${escape(c.text)}</p>`;else if(c.kind==='image'&&c.mime==='image/webp')yield `<img alt="收藏的聊天图片" src="data:image/webp;base64,${Buffer.from(c.data).toString('base64')}">`;else if(c.kind==='audio'&&['audio/webm','audio/ogg','audio/mp4'].includes(c.mime))yield `<audio controls src="data:${c.mime};base64,${Buffer.from(c.data).toString('base64')}"></audio>`;yield '</div>';}yield '</section>';}
  yield '</article>';
 }
 yield '</main><footer>两个人 · 一本日历 · 很多很多以后<br>此文件包含私密回忆与照片，请妥善保存。可通过浏览器打印另存为 PDF。</footer></html>';
}
