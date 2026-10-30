// Exact public contract: GET https://kondius.cn/qq-agent/comments/ on 2026-10-12.
// doUpload sends nickname/text/images (data URLs)/captchaVerifyParam to /qq-agent/api/comment.
export const FEEDBACK_ENDPOINT='https://kondius.cn/qq-agent/api/comment';
export const FEEDBACK_MAX_BODY_BYTES=2*1024*1024; // Local HTTP MAX_BODY_BYTES, not the public site's advertised 40MB limit.
const invalid=(message,status=400)=>Object.assign(new Error(message),{status,expose:true});
function validImage(value){
  const match=/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)return false;
  const bytes=Buffer.from(match[2],'base64');
  if(match[1]==='png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(match[1]==='jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(match[1]==='gif')return /^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii'));
  return bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
}
export function feedbackPayload(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['nickname','text','images','captchaVerifyParam'].includes(key)))throw invalid('反馈只能包含预览中的公开内容');
  const nickname=typeof value.nickname==='string'?value.nickname.trim():'',text=typeof value.text==='string'?value.text.trim():'';
  if(!nickname||nickname.length>32)throw invalid('昵称必填，最多32字');
  if(!text||text.length>5000)throw invalid('反馈正文必填，最多5000字');
  if(!Array.isArray(value.images)||value.images.length>9||value.images.some(image=>typeof image!=='string'||!validImage(image)))throw invalid('截图最多9张，支持PNG、JPEG、WebP和GIF图片');
  return{nickname,text,images:[...value.images]};
}
export function createFeedbackClient({fetchImpl,signal=()=>null}){
  return{
    feedbackStatus:()=>({ok:true,available:true}),
    async publishFeedback(value){
      const payload=feedbackPayload(value),proof=value.captchaVerifyParam;
      if(typeof proof!=='string'||!proof||proof.length>16384)throw invalid('请先完成人机验证');
      const body=JSON.stringify({...payload,captchaVerifyParam:proof});
      if(Buffer.byteLength(body,'utf8')>FEEDBACK_MAX_BODY_BYTES)throw invalid('提交内容超过2MB，请减少截图后重试',413);
      const response=await fetchImpl(FEEDBACK_ENDPOINT,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body,redirect:'manual',signal:signal(),maxBytes:64*1024,timeoutMs:15000});
      let result;try{result=await response.json();}catch{throw invalid('反馈服务响应异常，请稍后重试',502);}
      if(!response.ok||response.truncated||result?.ok!==true){
        const status=[400,401,403,413,429,503].includes(response.status)?response.status:502;
        const reason=String(result?.error||(response.status===429?'投稿过于频繁，请稍后再试':'反馈提交失败，请稍后重试')).replaceAll(proof,'[已隐藏]').slice(0,320);
        throw invalid(reason,status);
      }
      return{ok:true};
    },
  };
}
