import {verifyPublicCaptcha} from './public-captcha.js';
const active=signal=>{if(signal?.aborted)throw signal.reason||new Error('金句提交已取消');};
export async function publishQuoteFromHost(api,payload,{signal,verifyCaptcha=verifyPublicCaptcha}={}){
  active(signal);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.messages)||Object.keys(payload).some(key=>!['nickname','messages'].includes(key)))throw new Error('金句只能包含预览中的公开内容');
  const ready=await api.request('GET','/api/community/quotes/status',undefined,undefined,{signal});
  active(signal);
  if(ready?.available!==true)throw new Error(ready?.reason||'金句发布服务未就绪，请稍后重试');
  if(payload.messages?.some(message=>message.media?.length)&&ready.imageSupport!==true)throw new Error('当前金句提供者不支持图片，请切换提供者或移除图片');
  const captchaVerifyParam=await verifyCaptcha({signal});
  active(signal);
  if(typeof captchaVerifyParam!=='string'||!captchaVerifyParam||captchaVerifyParam.length>16384)throw new Error('人机验证未返回有效凭据，请重试');
  return api.request('POST','/api/community/quotes',{nickname:payload.nickname,messages:payload.messages,captchaVerifyParam},undefined,{signal});
}
