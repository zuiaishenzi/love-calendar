export const releasePlatforms=[['latest.json','android'],['windows.json','windows'],['harmony.json','harmony']];
export function releaseDefinition(platform){
 const definitions={android:{manifest:'latest.json',packageId:'xyz.ourdays.mobile',extension:'apk',limit:100},windows:{manifest:'windows.json',packageId:'xyz.ourdays.desktop',extension:'exe',limit:200},harmony:{manifest:'harmony.json',packageId:'xyz.ourdays.harmony',extension:'hap',limit:100}};
 if(!Object.hasOwn(definitions,platform))throw Error('平台无效');return definitions[platform];
}
export function validateRelease(info,platform){
 const definition=releaseDefinition(platform);
 const windows=platform==='windows',hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),size=value=>Number.isSafeInteger(value)&&value>0;
 if(!info||info.packageId!==definition.packageId||!Number.isSafeInteger(info.versionCode)||info.versionCode<1||!/^\d+\.\d+\.\d+$/.test(info.versionName)||typeof info.filename!=='string'||!new RegExp('^[A-Za-z0-9][A-Za-z0-9._-]*\\.'+definition.extension+'$').test(info.filename)||!hash(info.sha256)||!size(info.size)||info.size>definition.limit*1024*1024||typeof info.notes!=='string'||info.notes.length>4000)throw Error('安装包清单无效');
 if(info.parts!==undefined){
  if(!windows||!Array.isArray(info.parts)||!info.parts.length||info.parts.length>3)throw Error('分片清单无效');
  let total=0;for(const [index,part] of info.parts.entries()){
   if(!part||part.filename!==info.filename+'.part'+String(index+1).padStart(3,'0')||!size(part.size)||part.size>90*1024*1024||!hash(part.sha256))throw Error('分片清单无效');total+=part.size;
  }
  if(total!==info.size)throw Error('分片总大小不符');
 }
 return info;
}
