import {randomUUID} from 'node:crypto';
export function createRealtime(authenticate){
 const clients=new Map(),edits=new Map(),versions=new Map(),epoch=randomUUID();
 const version=ledger=>epoch+':'+(versions.get(ledger)||0);
 function state(user){
  const active=[...edits.values()].filter(e=>e.ledger===user.ledger_id&&e.until>Date.now());
  const count=new Set(active.map(e=>e.user)).size;
  const peer=active.find(e=>e.user!==user.id);
  return {revision:version(user.ledger_id),interval:count>=2?12000:count===1?15000:24000,peer:peer?{name:peer.name,day:peer.day,started:peer.started}:null};
 }
 function publish(ledger){for(const [id,c] of clients){if(c.user.ledger_id!==ledger)continue;if(!authenticate(c.req)){c.res.end();clients.delete(id);edits.delete(id);continue;}c.res.write('data: '+JSON.stringify(state(c.user))+'\n\n');}}
 function connect(id,user,req,res){
  const old=clients.get(id);if(old&&old.user.id!==user.id){res.writeHead(403);res.end();return;}if(old)old.res.end();
  const client={user,req,res};clients.set(id,client);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.write('retry: 3000\ndata: '+JSON.stringify(state(user))+'\n\n');
  req.on('close',()=>{if(clients.get(id)!==client)return;clients.delete(id);edits.delete(id);publish(user.ledger_id);});
 }
 function touch(id,user,day){
  const c=clients.get(id);if(c&&c.user.id!==user.id)return false;
  const old=edits.get(id);if(old&&old.user!==user.id)return false;
  if(day)edits.set(id,{user:user.id,ledger:user.ledger_id,name:user.name,day,until:Date.now()+45000,started:old?.day===day?old.started:randomUUID()});else edits.delete(id);
  if(old?.day!==day)publish(user.ledger_id);
  return true;
 }
 function changed(user){versions.set(user.ledger_id,(versions.get(user.ledger_id)||0)+1);publish(user.ledger_id);}
 const timer=setInterval(()=>{
  const affected=new Set();
  for(const [id,e] of edits)if(e.until<=Date.now()){edits.delete(id);affected.add(e.ledger);}
  for(const [id,c] of clients){if(!authenticate(c.req)){c.res.end();clients.delete(id);edits.delete(id);affected.add(c.user.ledger_id);}else c.res.write(': keepalive\n\n');}
  for(const ledger of affected)publish(ledger);
 },15000);timer.unref();
 return {state,connect,touch,changed,close(){clearInterval(timer);for(const c of clients.values())c.res.end();clients.clear();edits.clear();}};
}
