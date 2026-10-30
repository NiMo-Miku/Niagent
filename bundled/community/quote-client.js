// Text fields were verified from the public site. The user-authorized legacy
// source develop/ui/app/10-feedback.js:778-840 also submits media[].dataUrl.
// Send reviewed inline bytes; source URL/file coordinates deliberately stay local.
export const QUOTE_ENDPOINT='https://kondius.cn/qq-agent/api/holyshits';
export const QUOTE_MAX_BODY_BYTES=2*1024*1024;
export const QUOTE_MAX_IMAGE_BYTES=1024*1024;
const invalid=(message,status=400)=>Object.assign(new Error(message),{status,expose:true});
function imagePayload(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['kind','url','file','dataUrl'].includes(key))||value.kind!=='image'||(value.url!==undefined&&value.url!=='')||(value.file!==undefined&&value.file!==''))throw invalid('金句图片只能包含预览中的图片内容，不可包含原始地址或文件路径');
  const dataUrl=value.dataUrl;
  if(typeof dataUrl!=='string'||dataUrl.length>Math.ceil(QUOTE_MAX_IMAGE_BYTES/3)*4+64)throw invalid('图片总量最多1MB，请减少图片后重试',413);
  const match=/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if(!match)throw invalid('金句图片支持PNG、JPEG、GIF和WebP');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>QUOTE_MAX_IMAGE_BYTES||bytes.toString('base64')!==match[2])throw invalid('图片内容无效或超过1MB');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    match[1]==='gif'?/^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii')):
    bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
  if(!valid)throw invalid('图片格式与内容不一致');
  return {image:{kind:'image',url:'',file:'',dataUrl},bytes:bytes.length};
}
export function quoteTextPayload(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('金句参数无效');
  if(Object.keys(value).some(key=>!['nickname','messages','captchaVerifyParam'].includes(key)))throw invalid('金句只能包含预览中的公开字段');
  const nickname=typeof value.nickname==='string'?value.nickname.trim():'';
  if(!nickname||nickname.length>32)throw invalid('收录人昵称必填，最多32字');
  if(!Array.isArray(value.messages)||!value.messages.length||value.messages.length>50)throw invalid('请选择1至50条消息');
  let imageCount=0,imageBytes=0;
  const messages=value.messages.map(message=>{
    if(!message||typeof message!=='object'||Array.isArray(message)||Object.keys(message).some(key=>!['ts','senderName','text','self','media'].includes(key)))throw invalid('消息只能包含预览中的公开字段');
    if(!Array.isArray(message.media)||message.media.length>9)throw invalid('金句最多附带9张图片');
    const media=message.media.map(item=>{const result=imagePayload(item);imageCount++;imageBytes+=result.bytes;return result.image;});
    if(imageCount>9||imageBytes>QUOTE_MAX_IMAGE_BYTES)throw invalid('金句最多9张图片，图片总量最多1MB',413);
    const senderName=typeof message.senderName==='string'?message.senderName.trim():'',text=typeof message.text==='string'?message.text.trim():'';
    if(!senderName||senderName.length>64||(!text&&!media.length)||text.length>2000||typeof message.self!=='boolean'||!Number.isFinite(message.ts)||message.ts<=0)throw invalid('请检查发言人、正文和消息时间');
    return{ts:message.ts,senderName,text,self:message.self,media};
  });
  if(!messages.some(message=>message.self))throw invalid('至少选择一条机器人发言');
  return{nickname,messages};
}
export function createQuoteClient({fetchImpl,signal=()=>null}){
  return{
    quoteStatus:()=>({ok:true,available:true,textOnly:false,imageSupport:true}),
    async publishQuote(value){
      const payload=quoteTextPayload(value),proof=value.captchaVerifyParam;
      if(typeof proof!=='string'||!proof||proof.length>16384)throw invalid('请先完成人机验证');
      const body=JSON.stringify({...payload,captchaVerifyParam:proof});
      if(Buffer.byteLength(body,'utf8')>QUOTE_MAX_BODY_BYTES)throw invalid('提交内容超过2MB，请减少图片或正文后重试',413);
      const response=await fetchImpl(QUOTE_ENDPOINT,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body,redirect:'manual',signal:signal(),maxBytes:64*1024,timeoutMs:15000});
      let result;try{result=await response.json();}catch{throw Object.assign(new Error('金句服务响应异常，请稍后重试'),{status:502,expose:true});}
      if(!response.ok||response.truncated||result?.ok!==true){
        const status=[400,401,403,413,429,503].includes(response.status)?response.status:502;
        const reason=String(result?.error||(response.status===429?'投稿过于频繁，请稍后再试':'金句上传失败，请稍后重试')).replaceAll(proof,'[已隐藏]').slice(0,320);
        throw Object.assign(new Error(reason),{status,expose:true});
      }
      return{ok:true};
    },
  };
}
