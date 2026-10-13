let clientDownloadsGeneration=0;
const hideClientDownloads=/OurDays(?:Android|Windows)\//.test(navigator.userAgent);
$('#client-downloads').hidden=hideClientDownloads;
function formatClientSize(bytes){
 if(!Number.isSafeInteger(bytes)||bytes<=0)throw Error('安装包大小无效');
 if(bytes<1024)return bytes+' B';
 if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
 return (bytes/1024/1024).toFixed(1)+' MB';
}
async function refreshClientDownloads(){
 const generation=++clientDownloadsGeneration,list=$('#client-download-list');list.replaceChildren();
 const rows=[['android','Android 安卓版','.apk'],['windows','Windows 电脑版','.exe']];
 await Promise.all(rows.map(async([platform,name,extension])=>{
  const row=el('div',undefined,'client-download-row'),title=el('strong',name),status=el('small','正在检查…'),action=el('a','下载安装包');
  action.hidden=true;row.append(title,status,action);list.append(row);
  try{
   const info=await api('/api/app/update?platform='+platform);if(generation!==clientDownloadsGeneration)return;
   if(!info.available){status.textContent='暂未发布';return;}
   const url=new URL(info.downloadUrl,location.href);
   if(url.origin!==location.origin||!url.pathname.startsWith('/api/app/download/')||!url.pathname.endsWith(extension)||url.search||url.hash)throw Error('下载地址无效');
   const size=formatClientSize(info.size);status.textContent='v'+info.versionName+' · 安装包大小：'+size;action.href=url.pathname;action.download=info.filename;action.hidden=false;
  }catch{if(generation===clientDownloadsGeneration)status.textContent='暂时无法获取，请重新打开设置';}
 }));
}
$('#system-open').onclick=()=>{menuOpen(false);$('#system-dialog').showModal();if(!hideClientDownloads)refreshClientDownloads();};
