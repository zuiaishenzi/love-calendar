import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from './db.mjs';
import {widgetService} from './widget.mjs';

test('卡片配色在深浅照片与遮罩变化时保持对比度，网页与鸿蒙算法一致',()=>{
 const web=readFileSync('public/widget.js','utf8'),source=web.slice(web.indexOf('function widgetTextColor('),web.indexOf('function paintWidgetAppearance(')),choose=new Script(source+';widgetTextColor;').runInNewContext({});
 const model=stripTypeScriptTypes(readFileSync('apps/harmony/entry/src/main/ets/common/WidgetModel.ets','utf8'),{mode:'transform'}).replaceAll('export ',''),native=new Script(model+';widgetTextColor;').runInNewContext({});
 for(const [pixels,overlay,expected] of [[[0,0,0,255],0,'#FFFFFF'],[[255,255,255,255],0,'#30252C'],[[0,0,0,255],70,'#30252C'],[[20,30,40,0],0,'#30252C']]){assert.equal(choose(pixels,overlay),expected);assert.equal(native(pixels,overlay),expected);}
 const regional=Array.from({length:256},(_,i)=>Math.floor(i/16)<4||Math.floor(i/16)>=12?[255,255,255,255]:[0,0,0,255]).flat();
 for(const [region,expected] of [['title','#63364E'],['body','#FFFFFF'],['caption','#264A40']]){assert.equal(choose(regional,0,region),expected);assert.equal(native(regional,0,region),expected);}
 const light=color=>{const rgb=color.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(let grey=0;grey<=255;grey+=5)for(const region of ['title','body','caption']){const pixels=[grey,grey,grey,255],color=choose(pixels,0,region);assert.equal(color,native(pixels,0,region));const background=light('#'+grey.toString(16).padStart(2,'0').repeat(3)),foreground=light(color);assert.ok((Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05)>=4.5,region+' contrast');}
});
test('应用内调色板的色号和滑块支持全色域、灰阶及往返转换',()=>{
 const web=readFileSync('public/widget.js','utf8'),source=web.slice(web.indexOf('function widgetHexToHsl('),web.indexOf('function paintWidgetColorPicker('));
 const {toHsl,toHex}=new Script(source+';({toHsl:widgetHexToHsl,toHex:widgetHslToHex});').runInNewContext({});
 for(const [h,s,l,color] of [[0,100,50,'#ff0000'],[120,100,50,'#00ff00'],[240,100,50,'#0000ff'],[300,100,50,'#ff00ff'],[60,100,50,'#ffff00'],[180,100,50,'#00ffff'],[359,0,0,'#000000'],[359,0,100,'#ffffff']])assert.equal(toHex(h,s,l),color);
 for(const color of ['#a16986','#154b56','#d99754','#7cbda6','#ffffff','#000000','#888888']){const actual=toHex(...toHsl(color));for(let i=1;i<7;i+=2)assert.ok(Math.abs(parseInt(actual.slice(i,i+2),16)-parseInt(color.slice(i,i+2),16))<=3);}
});
function fixture(){
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-widget-')),db=openDatabase(dir);db.exec("INSERT INTO ledgers(id,code) VALUES(1,'WIDGET01'),(2,'WIDGET02');");
 for(const [id,ledger,seat] of [[1,1,1],[2,1,2],[3,2,1]])db.prepare('INSERT INTO users(id,name,hash,salt,ledger_id,seat) VALUES(?,?,?,?,?,?)').run(id,'widget'+id,'hash','salt',ledger,seat);
 let time=Date.parse('2026-11-18T15:59:59Z');const service=widgetService(db,{now:()=>time}),user=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id),request=(id,method,p,input={},write=()=>{})=>service.route({method},new URL(p,'http://localhost'),user(id),input,write);
 return {db,service,user,request,tick:()=>time++,setTime:t=>time=Date.parse(t),close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('桌面留言仅对方卡片显示，逐条已读、历史保留、跨账号与只读隔离',()=>{
 const f=fixture();try{const {request:r}=f,id=r(1,'POST','/api/widget/notes',{text:'给你留一颗小星星'}).id;
 assert.equal(r(1,'GET','/api/widget/state').item,null);assert.equal(r(2,'GET','/api/widget/state').item.id,id);assert.equal(r(2,'GET','/api/widget/state').item.target,'notes');
 assert.throws(()=>r(3,'POST','/api/widget/read',{type:'note',id}),e=>e.status===404);assert.throws(()=>r(1,'POST','/api/widget/read',{type:'note',id}),e=>e.status===404);
 assert.equal(r(2,'POST','/api/widget/read',{type:'note',id},()=>{throw Error('read must be allowed');}).item,null);assert.equal(r(2,'POST','/api/widget/read',{type:'note',id}).unreadCount,0);
 assert.ok(r(2,'GET','/api/widget/notes').items[0].read_at);assert.equal(r(1,'GET','/api/widget/notes?box=sent').items.length,1);assert.equal(r(3,'GET','/api/widget/notes').items.length,0);
 assert.throws(()=>r(1,'POST','/api/widget/notes',{text:' ' }),e=>e.status===400);assert.throws(()=>r(1,'POST','/api/widget/notes',{text:'x'.repeat(501)}),e=>e.status===400);
 assert.throws(()=>r(1,'POST','/api/widget/notes',{text:'不写入'},()=>{throw Error('readonly');}),/readonly/);
 f.db.prepare('DELETE FROM users WHERE id=2').run();assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM widget_notes').get().n,0);
 }finally{f.close();}
});
test('收件人可将已读桌面留言恢复未读，幂等且不回退聊天已读位置',()=>{
 const f=fixture();try{const r=f.request,id=r(1,'POST','/api/widget/notes',{text:'记得一起去散步'}).id;
 const chat=Number(f.db.prepare("INSERT INTO chat_messages(ledger_id,sender,kind,text,created) VALUES(1,1,'text','已经看过的聊天',?)").run(f.tick()).lastInsertRowid);r(2,'POST','/api/widget/read',{type:'note',id});r(2,'POST','/api/widget/read',{type:'chat',id:chat});assert.equal(r(2,'GET','/api/widget/state').item,null);
 const unread=r(2,'POST','/api/widget/unread',{type:'note',id},()=>{throw Error('readonly still permits read state');});assert.equal(unread.item.id,id);assert.equal(unread.item.target,'notes');assert.equal(unread.unreadCount,1);assert.equal(r(2,'GET','/api/widget/notes').items[0].read_at,null);
 assert.equal(r(2,'POST','/api/widget/unread',{type:'note',id}).unreadCount,1);assert.equal(f.db.prepare('SELECT through_id FROM chat_reads WHERE user_id=2').get().through_id,chat);
 assert.throws(()=>r(1,'POST','/api/widget/unread',{type:'note',id}),e=>e.status===404);assert.throws(()=>r(3,'POST','/api/widget/unread',{type:'note',id}),e=>e.status===404);assert.throws(()=>r(2,'POST','/api/widget/unread',{type:'chat',id:chat}),e=>e.status===400);assert.throws(()=>r(2,'POST','/api/widget/unread',{type:'note',id:0}),e=>e.status===400);
 assert.equal(r(2,'POST','/api/widget/read',{type:'note',id}).item,null);assert.equal(r(2,'POST','/api/widget/read',{type:'note',id}).item,null);assert.equal(r(1,'GET','/api/widget/state').item,null);
 }finally{f.close();}
});

test('卡片聊天摘要、最早未读推进、幂等、撤回及并发已读不能跳过未读',()=>{
 const f=fixture();try{const add=(kind,text='',sender=1)=>Number(f.db.prepare('INSERT INTO chat_messages(ledger_id,sender,kind,text,created) VALUES(1,?,?,?,?)').run(sender,kind,text,f.tick()).lastInsertRowid),a=add('text','早上好'),b=add('image'),c=add('audio');const r=f.request;
 assert.equal(r(2,'GET','/api/widget/state').item.text,'早上好');assert.equal(r(2,'GET','/api/widget/state').item.target,'chat');assert.throws(()=>r(2,'POST','/api/widget/read',{type:'chat',id:b}),e=>e.status===409);
 assert.equal(r(2,'POST','/api/widget/read',{type:'chat',id:a}).item.text,'发来一张图片');r(2,'POST','/api/widget/read',{type:'chat',id:a});assert.equal(r(2,'GET','/api/widget/state').unreadCount,2);
 f.db.prepare('UPDATE chat_messages SET retracted_at=1 WHERE id=?').run(b);assert.equal(r(2,'GET','/api/widget/state').item.text,'发来一条语音');assert.throws(()=>r(3,'POST','/api/widget/read',{type:'chat',id:c}),e=>e.status===404);
 f.db.prepare('UPDATE chat_reads SET through_id=? WHERE user_id=2').run(c);assert.equal(r(2,'POST','/api/widget/read',{type:'chat',id:c}).item,null);
 }finally{f.close();}
});
test('倒计时阳历农历、北京时间跨日、私密权限和删除提醒自动失效',()=>{
 const f=fixture();try{const r=f.request;f.db.exec("INSERT INTO reminders(id,ledger_id,creator,title,base_day,kind,month,day) VALUES(1,1,1,'纪念日','2026-11-19','solar',11,19),(2,1,1,'农历生日','2026-02-17','lunar',1,1),(3,2,3,'别人的日子','2026-11-19','solar',11,19);");
 assert.equal(r(1,'PUT','/api/widget/settings',{reminderId:1}).countdown.days,1);f.setTime('2026-11-18T16:00:01Z');assert.equal(r(1,'GET','/api/widget/state').countdown.days,0);assert.equal(r(2,'GET','/api/widget/state').countdown,null);
 assert.throws(()=>r(1,'PUT','/api/widget/settings',{reminderId:3}),e=>e.status===400);f.db.exec('UPDATE reminders SET private_owner=2 WHERE id=1');assert.equal(r(1,'GET','/api/widget/state').countdown,null);
 assert.ok(r(1,'PUT','/api/widget/settings',{reminderId:2}).countdown.day);f.db.exec('DELETE FROM reminders WHERE id=2');assert.equal(r(1,'GET','/api/widget/state').countdown,null);
 }finally{f.close();}
});
test('留言历史按分页保留且发送速率受限',()=>{
 const f=fixture();try{for(let i=0;i<25;i++)f.db.prepare('INSERT INTO widget_notes(ledger_id,sender,recipient,text,created) VALUES(1,1,2,?,?)').run('留言'+i,f.tick());const first=f.request(2,'GET','/api/widget/notes'),second=f.request(2,'GET','/api/widget/notes?before='+first.items.at(-1).id);assert.equal(first.items.length,20);assert.equal(first.more,true);assert.equal(second.items.length,5);assert.throws(()=>f.request(1,'POST','/api/widget/notes',{text:'稍后再写'}),e=>e.status===429);}finally{f.close();}
});
test('自定义任意日期与标题仅本人可见，可与纪念日互换，过去日期显示已过天数',()=>{
 const f=fixture();try{const r=f.request;let state=r(1,'PUT','/api/widget/settings',{title:'一起去看海',customDay:'2026-11-20'});assert.equal(state.countdown.days,2);assert.equal(state.countdown.source,'custom');assert.equal(state.settings.customDay,'2026-11-20');assert.equal(r(2,'GET','/api/widget/state').countdown,null);
 f.setTime('2026-11-21T02:00:00Z');assert.equal(r(1,'GET','/api/widget/state').countdown.days,-1);assert.throws(()=>r(1,'PUT','/api/widget/settings',{title:'测试',customDay:'2026-02-30'}),e=>e.status===400);assert.throws(()=>r(1,'PUT','/api/widget/settings',{title:' ',customDay:'2026-11-20'}),e=>e.status===400);
 f.db.exec("INSERT INTO reminders(id,ledger_id,creator,title,base_day,kind,month,day) VALUES(1,1,1,'纪念日','2026-11-22','solar',11,22)");state=r(1,'PUT','/api/widget/settings',{reminderId:1});assert.equal(state.countdown.id,1);assert.equal(state.settings.customDay,null);assert.equal(r(1,'PUT','/api/widget/settings',{reminderId:null}).countdown,null);
 }finally{f.close();}
});
