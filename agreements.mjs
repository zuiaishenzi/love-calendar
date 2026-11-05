import {fail} from './accounts.mjs';
import {validDay} from './calendar.mjs';
import {createAgreementLineWriter} from './agreement-lines.mjs';
export function agreementService(db,notify,{writer=createAgreementLineWriter()}={}){
 const jobs=new Map();let closed=false;
 const list=user=>db.prepare('SELECT a.*,u.name AS creator_name,c.name AS completed_name FROM agreements a JOIN users u ON u.id=a.creator LEFT JOIN users c ON c.id=a.completed_by WHERE a.ledger_id=? ORDER BY a.id DESC').all(user.ledger_id).map(row=>({...row,warm_status:jobs.has(row.id)?'pending':row.warm_error?'error':row.warm_line?'done':'empty'}));
 function queue(row,user,check){
  if(closed||writer.mode!=='ai')return;
  const signature=JSON.stringify([row.title,row.note]);if(jobs.get(row.id)?.signature===signature)return;
  const job={signature};jobs.set(row.id,job);db.prepare("UPDATE agreements SET warm_error='' WHERE id=?").run(row.id);
  job.promise=(async()=>{try{
   let conflictLine=null;
   for(let attempt=0;attempt<2;attempt++){
    const recentLines=db.prepare("SELECT warm_line FROM agreements WHERE ledger_id=? AND id!=? AND warm_line!='' ORDER BY id DESC LIMIT 12").all(user.ledger_id,row.id).map(item=>item.warm_line);if(conflictLine&&!recentLines.includes(conflictLine))recentLines.push(conflictLine);
    const result=await writer.generate({title:row.title,note:row.note,recentLines});if(closed)return;check();const latest=db.prepare('SELECT title,note FROM agreements WHERE id=? AND ledger_id=?').get(row.id,user.ledger_id);
    if(jobs.get(row.id)!==job||!latest||JSON.stringify([latest.title,latest.note])!==signature)return;
    if(db.prepare('SELECT id FROM agreements WHERE ledger_id=? AND id!=? AND warm_line=?').get(user.ledger_id,row.id,result.line)){if(attempt===0){conflictLine=result.line;continue;}throw Object.assign(Error('温馨小字与已有约定重复，请稍后重试。'),{status:502});}
    db.prepare("UPDATE agreements SET warm_line=?,warm_source=?,warm_error='' WHERE id=?").run(result.line,result.source,row.id);break;
   }
  }catch(e){if(!closed&&jobs.get(row.id)===job)db.prepare('UPDATE agreements SET warm_error=? WHERE id=?').run(e.status?e.message:'温馨小字暂时无法生成，约定已经保存。',row.id);}
  finally{if(!closed&&jobs.get(row.id)===job){jobs.delete(row.id);notify(user);}}})();
 }
 const route=function(req,url,user,input,check){
  if(url.pathname==='/api/agreements/config'&&req.method==='GET')return {line_mode:writer.mode};
  if(url.pathname==='/api/agreements'&&req.method==='GET')return list(user);
  const retry=url.pathname.match(/^\/api\/agreements\/(\d+)\/warm-line$/);
  if(retry&&req.method==='POST'){check();const row=db.prepare('SELECT * FROM agreements WHERE id=? AND ledger_id=?').get(Number(retry[1]),user.ledger_id);if(!row)throw fail(404,'约定不存在');if(writer.mode!=='ai')throw fail(503,'服务器尚未配置LLM，请先配置备忘录使用的AI服务。');if(!row.warm_line||row.warm_error)queue(row,user,check);return list(user);}
  check();let changedId=null;const match=url.pathname.match(/^\/api\/agreements\/(\d+)(\/completion)?$/);
  if(req.method!=='POST')throw fail(405,'请求方法不支持');
  if(match){const id=Number(match[1]);if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM agreements WHERE id=? AND ledger_id=?').get(id,user.ledger_id))throw fail(404,'约定不存在');}
  if(match?.[2]){
   const day=input.day,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
   if(day!==null&&(!validDay(day)||day>today))throw fail(400,'请选择今天或之前的实际完成日期');
   db.prepare('UPDATE agreements SET completed_day=?,completed_by=?,updated=? WHERE id=? AND ledger_id=?').run(day,day?user.id:null,Date.now(),Number(match[1]),user.ledger_id);
  }else if(url.pathname==='/api/agreements'||match){
   if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100)throw fail(400,'请填写100字以内的约定');
   if(typeof input.note!=='string'||input.note.length>1000)throw fail(400,'备注不能超过1000字');
   const day=input.planned_day||null;if(day!==null&&!validDay(day))throw fail(400,'计划日期无效');
   if(match){const before=db.prepare('SELECT title,note FROM agreements WHERE id=?').get(Number(match[1]));db.prepare('UPDATE agreements SET title=?,note=?,planned_day=?,updated=? WHERE id=? AND ledger_id=?').run(input.title.trim(),input.note.trim(),day,Date.now(),Number(match[1]),user.ledger_id);if(before.title!==input.title.trim()||before.note!==input.note.trim())changedId=Number(match[1]);}
   else{if(list(user).length>=300)throw fail(400,'每本日历最多保存300个约定');const now=Date.now();changedId=Number(db.prepare('INSERT INTO agreements(ledger_id,creator,title,note,planned_day,created,updated) VALUES(?,?,?,?,?,?,?)').run(user.ledger_id,user.id,input.title.trim(),input.note.trim(),day,now,now).lastInsertRowid);}
  }else throw fail(404,'接口不存在');
  if(changedId!==null){db.prepare("UPDATE agreements SET warm_line='',warm_source='',warm_error='' WHERE id=?").run(changedId);queue(db.prepare('SELECT * FROM agreements WHERE id=?').get(changedId),user,check);}
  notify(user);return list(user);
 };
 route.close=()=>{closed=true;jobs.clear();};return route;
}
