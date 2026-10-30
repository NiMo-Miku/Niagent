import {verifyPublicCaptcha} from './public-captcha.js';

// F-222 is a host-side pre-authentication UI gate. The official auth endpoints
// accept credentials only; their server does not validate a CAPTCHA proof.
// Consume the SDK proof here, never add an invented auth field or return it to a panel.
export async function authenticateMarketFromHost(api,payload,{signal,verify=verifyPublicCaptcha}={}) {
  const fields=['loginId','password','displayName','mode'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!fields.includes(key)))throw new Error('账号参数无效');
  if(!['login','register'].includes(payload.mode)||typeof payload.loginId!=='string'||!payload.loginId.trim()||typeof payload.password!=='string'||!payload.password)throw new Error('请填写社区账号和密码');
  if(payload.displayName!==undefined&&typeof payload.displayName!=='string')throw new Error('显示名称无效');
  if(payload.mode==='register'&&!payload.displayName?.trim())throw new Error('注册时请填写显示名称');
  const privateValues=[payload.password];
  const publicText=value=>privateValues.filter(value=>typeof value==='string'&&value).sort((a,b)=>b.length-a.length).reduce((text,secret)=>text.split(secret).join('******'),String(value));
  try {
  if(signal?.aborted)throw signal.reason;
  // Resolve the actual market capability before opening the widget.
  await api.request('GET','/api/market/accounts',undefined,undefined,{signal});
  if(signal?.aborted)throw signal.reason;
  const proof=await verify({signal});
  privateValues.push(proof);
  if(signal?.aborted)throw signal.reason;
  if(typeof proof!=='string'||!proof.trim()||proof.length>16384)throw new Error('人机验证未返回有效凭据，请重新验证');
  const body={loginId:payload.loginId.trim(),password:payload.password,mode:payload.mode};
  if(payload.mode==='register')body.displayName=payload.displayName.trim();
  const result=await api.request('POST','/api/market/login',body,undefined,{signal});
  if(signal?.aborted)throw signal.reason;
  if(result?.ok!==true)throw new Error('社区认证响应异常，请重试');
  privateValues.push(result.token);
  const account=Object.fromEntries(['id','loginId','username','displayName','createdAt'].filter(key=>['string','number'].includes(typeof result.account?.[key])).map(key=>[key,typeof result.account[key]==='string'?publicText(result.account[key]):result.account[key]]));
  return {ok:true,account};
  } catch(error) {throw Object.assign(new Error(publicText(error?.message||'社区认证失败，请重试')),{status:error?.status});}
}
