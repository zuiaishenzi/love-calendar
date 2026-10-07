import {createHash,createHmac,randomBytes} from 'node:crypto';
import {fail} from './accounts.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
export function signSpeechRequest(secretId,secretKey,action,payload,timestamp){
 const body=JSON.stringify(payload),date=new Date(timestamp*1000).toISOString().slice(0,10),scope=date+'/asr/tc3_request';
 const canonical='POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:asr.tencentcloudapi.com\n\ncontent-type;host\n'+hash(body);
 const key=hmac(hmac(hmac('TC3'+secretKey,date),'asr'),'tc3_request');
 const signature=createHmac('sha256',key).update('TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+hash(canonical)).digest('hex');
 return {body,headers:{'Content-Type':'application/json; charset=utf-8','X-TC-Action':action,'X-TC-Version':'2019-06-14','X-TC-Timestamp':String(timestamp),Authorization:`TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`}};
}
export function createSpeechRecognizer({env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
 async function call(action,payload){
  const secretId=env.TENCENT_ASR_SECRET_ID?.trim(),secretKey=env.TENCENT_ASR_SECRET_KEY?.trim(),token=env.TENCENT_ASR_TOKEN?.trim();
  if(!secretId||!secretKey)throw fail(503,'服务器尚未配置腾讯云语音识别');
  const request=signSpeechRequest(secretId,secretKey,action,payload,Math.floor(now()/1000));
  request.headers['X-TC-Region']=env.TENCENT_ASR_REGION?.trim()||'ap-shanghai';
  if(token)request.headers['X-TC-Token']=token;
  let response;
  try{const result=await fetcher('https://asr.tencentcloudapi.com',{method:'POST',...request,signal:AbortSignal.timeout(20000)});if(!result.ok)throw Error();response=(await result.json()).Response;}catch{throw fail(502,'腾讯云语音识别暂时无法连接，请稍后重试');}
  if(response?.Error){
   const code=typeof response.Error.Code==='string'&&/^[A-Za-z][A-Za-z0-9.]{0,100}$/.test(response.Error.Code)?response.Error.Code:'UnknownError';
   const reasons=[[/InvalidSecretId|SecretIdNotFound/,'腾讯云 SecretId 无效、不存在或已停用，请检查云 API 密钥'],[/SignatureExpire/,'腾讯云请求签名已过期，请校准服务器时间'],[/SignatureFailure/,'腾讯云签名校验失败，请检查 SecretId 与 SecretKey 是否为同一对有效密钥'],[/TokenFailure/,'腾讯云临时凭证 Token 无效或已过期；长期密钥应清空 Token'],[/Unauthorized/,'腾讯云凭证缺少语音识别权限，请授权 SentenceRecognition、CreateRecTask 和 DescribeTaskStatus'],[/AuthFailure|CheckAuthInfo/,'腾讯云鉴权失败，请检查云 API 密钥及权限'],[/UserNotRegistered|ServiceIsolate|Amount/,'请检查腾讯云语音识别服务开通状态及可用额度']];
   const reason=reasons.find(([pattern])=>pattern.test(code));throw fail(reason?503:502,(reason?.[1]||'腾讯云语音识别失败，请检查音频及服务配置')+'（'+code+'）');
  }
  if(!response)throw fail(502,'腾讯云返回了无效识别结果');return response;
 }
 return {
  async short(data){const result=await call('SentenceRecognition',{EngSerViceType:env.TENCENT_ASR_ENGINE||'16k_zh',SourceType:1,VoiceFormat:'wav',UsrAudioKey:randomBytes(18).toString('hex'),Data:data.toString('base64'),DataLen:data.length});const text=typeof result.Result==='string'?result.Result.trim():'';if(!text)throw fail(422,'未识别到文字，请检查录音中是否有人声');if(text.length>4000)throw fail(422,'识别文字超过4000字，请使用更短的语音');return {status:'done',text};},
  async create(data){const result=await call('CreateRecTask',{EngineModelType:env.TENCENT_ASR_ENGINE||'16k_zh',ChannelNum:1,ResTextFormat:1,SourceType:1,Data:data.toString('base64'),DataLen:data.length});const id=result.Data?.TaskId;if(!Number.isSafeInteger(id)||id<=0)throw fail(502,'腾讯云未返回有效任务');return id;},
  async status(id){const result=await call('DescribeTaskStatus',{TaskId:id});const data=result.Data;if(!data||![0,1,2,3].includes(data.Status))throw fail(502,'腾讯云返回了无效任务状态');if(data.Status===3)throw fail(422,'音频识别失败，请检查录音是否清晰');if(data.Status!==2)return {status:'pending'};const text=(Array.isArray(data.ResultDetail)?data.ResultDetail.map(row=>row.FinalSentence||'').filter(Boolean).join('\n'):'')||data.Result||'';const cleaned=text.replace(/^\[[\d:.\s,-]+\]\s*/gm,'').trim();if(!cleaned)throw fail(422,'未识别到文字，请检查录音中是否有人声');if(cleaned.length>4000)throw fail(422,'识别文字超过4000字，请使用更短的语音');return {status:'done',text:cleaned};}
 };
}
export function speechService(db,recognizer,{now=()=>Date.now()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS chat_transcriptions (message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,PRIMARY KEY(message_id,user_id))');
 const jobs=new Map();
 function save(job,result,check){check();if(job.messageId!==null){if(!db.prepare('SELECT id FROM chat_messages WHERE id=? AND ledger_id=? AND retracted_at IS NULL').get(job.messageId,job.ledger))throw fail(404,'语音消息已撤回');db.prepare('INSERT INTO chat_transcriptions(message_id,user_id,text) VALUES(?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET text=excluded.text').run(job.messageId,job.user,result.text);}job.result=result;return result;}
 return async function route(req,url,user,input,check){
  check();for(const [id,job] of jobs)if(job.expires<=now())jobs.delete(id);
  if(url.pathname==='/api/chat/transcriptions'&&req.method==='POST'){
   if(input.messageId!==undefined){if(!Number.isSafeInteger(input.messageId)||input.messageId<1)throw fail(400,'语音消息无效');if(!db.prepare("SELECT id FROM chat_messages WHERE id=? AND ledger_id=? AND kind='audio' AND retracted_at IS NULL").get(input.messageId,user.ledger_id))throw fail(404,'语音消息不存在');}
   if(typeof input.data!=='string'||input.data.length>5200000||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))throw fail(400,'识别音频格式无效');
   const data=Buffer.from(input.data,'base64');
   if(data.length<46||data.length>3840044||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE'||data.toString('ascii',12,16)!=='fmt '||data.readUInt32LE(16)!==16||data.readUInt16LE(20)!==1||data.readUInt16LE(22)!==1||data.readUInt32LE(24)!==16000||data.readUInt32LE(28)!==32000||data.readUInt16LE(32)!==2||data.readUInt16LE(34)!==16||data.toString('ascii',36,40)!=='data'||data.readUInt32LE(40)!==data.length-44||data.readUInt32LE(4)!==data.length-8||(data.length-44)%2)throw fail(400,'请提供2分钟以内的16kHz单声道 WAV 音频');
   const digest=hash(data),mine=[...jobs.values()].filter(job=>job.user===user.id&&job.ledger===user.ledger_id);
   const duplicate=mine.find(job=>job.digest===digest&&job.messageId===(input.messageId??null));if(duplicate)return {id:duplicate.id,...(duplicate.result||{status:'pending'})};
   if(mine.length>=10||jobs.size>=500)throw fail(429,'语音识别请求过多，请稍后重试');
   const id=randomBytes(18).toString('hex'),job={id,user:user.id,ledger:user.ledger_id,digest,messageId:input.messageId??null,expires:now()+15*60000,task:null,result:null,busy:false,polled:0};jobs.set(id,job);
   try{if(recognizer.short&&(data.length-44)/32000<=60){try{const result=await recognizer.short(data);return {id,...save(job,result,check)};}catch(error){if(!/Unauthorized|UserNotRegistered|ServiceIsolate/.test(error.message))throw error;}}job.task=await recognizer.create(data);check();return {id,status:'pending'};}catch(error){jobs.delete(id);throw error;}
  }
  const match=url.pathname.match(/^\/api\/chat\/transcriptions\/([a-f0-9]{36})$/);
  if(match&&req.method==='GET'){
   const job=jobs.get(match[1]);if(!job||job.user!==user.id||job.ledger!==user.ledger_id)throw fail(404,'识别任务不存在或已过期，请重新识别');
   if(job.messageId!==null&&!db.prepare('SELECT id FROM chat_messages WHERE id=? AND ledger_id=? AND retracted_at IS NULL').get(job.messageId,user.ledger_id)){jobs.delete(job.id);throw fail(404,'语音消息已撤回');}
   if(job.result)return job.result;if(job.busy||job.task===null||now()-job.polled<2000)return {status:'pending'};
   job.busy=true;job.polled=now();try{const result=await recognizer.status(job.task);check();if(result.status==='done')save(job,result,check);return result;}finally{job.busy=false;}
  }
  throw fail(404,'接口不存在');
 };
}
