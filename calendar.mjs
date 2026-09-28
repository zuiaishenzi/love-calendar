import calendar from 'lunar-javascript';
const {Solar,Lunar,HolidayUtil}=calendar;
export function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>='2000-01-01'&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
export function lunarDate(day){return Solar.fromYmd(...day.split('-').map(Number)).getLunar();}
export function reminderParts(day,kind){const l=lunarDate(day);return kind==='lunar'?{month:l.getMonth(),day:l.getDay()}:{month:Number(day.slice(5,7)),day:Number(day.slice(8))};}
export function occursOn(reminder,day){if(day<reminder.base_day)return false;const p=reminderParts(day,reminder.kind);return reminder.month===p.month&&reminder.day===p.day;}
export function reminderLabel(r){if(r.kind==='solar')return `每年阳历 ${r.month}月${r.day}日`;const names=['正','二','三','四','五','六','七','八','九','十','冬','腊'];return `每年农历 ${r.month<0?'闰':''}${names[Math.abs(r.month)-1]}月${r.day}日`;}
export function nextOccurrence(r,today){
 const start=today>r.base_day?today:r.base_day;const year=Number(start.slice(0,4));
 for(let y=year-1;y<=Math.min(year+24,9999);y++){
  try{
   const day=r.kind==='solar'?`${y}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`:Lunar.fromYmd(y,r.month,r.day).getSolar().toYmd();
   if(validDay(day)&&day>=start&&occursOn(r,day))return day;
  }catch{/* This year does not contain the specified lunar month/day. */}
 }
 return null;
}
const cache=new Map();
export function monthDetails(month){
 if(cache.has(month))return cache.get(month);
 const [year,m]=month.split('-').map(Number),days=[],count=new Date(year,m,0).getDate();
 const holidayKnown=HolidayUtil.getHolidays(year).length>0;
 for(let d=1;d<=count;d++){
  const solar=Solar.fromYmd(year,m,d),l=solar.getLunar(),holiday=HolidayUtil.getHoliday(year,m,d);
  days.push({day:solar.toYmd(),lunar:`${l.getMonthInChinese()}月${l.getDayInChinese()}`,lunar_short:l.getDay()===1?`${l.getMonthInChinese()}月`:l.getDayInChinese(),term:l.getJieQi(),festivals:[...new Set([...solar.getFestivals(),...l.getFestivals()])],holiday:holiday?{name:holiday.getName(),work:holiday.isWork()}:null});
 }
 const result={days,holiday_known:holidayKnown,holiday_note:holidayKnown?'休 / 班为内置中国大陆放假调休安排，请以当年官方通知为准。':'本年暂无内置放假调休安排，仅展示农历、节气和节日。'};
 if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(month,result);return result;
}
export function shanghaiClock(now=new Date()) {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};}
