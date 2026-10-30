import {verifyPublicCaptcha} from './public-captcha.js';

// Official client GET https://www.kondius.cn/qq-agent/skill-market/ (2026-10-12):
// upload uses scene 632wvduj, then POST /api/community/market/publish with
// captchaVerifyParam. Its login/register requests do not carry CAPTCHA proof.
export async function publishMarketFromHost(api,payload,{signal,verify=verifyPublicCaptcha}={}) {
  const fields=['kind','id','displayName','description','accountUsername'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!fields.includes(key)))throw new Error('发布参数无效');
  if(!['plugin','skill'].includes(payload.kind)||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(payload.id||''))throw new Error('请选择发布类型并填写有效的扩展 id');
  if(typeof payload.accountUsername!=='string'||!payload.accountUsername)throw new Error('请先选择一个已登录的账号');
  for(const key of ['displayName','description'])if(payload[key]!==undefined&&typeof payload[key]!=='string')throw new Error('发布参数无效');
  if(signal?.aborted)throw signal.reason;
  const accounts=await api.get('/api/market/accounts');
  if(!accounts?.accounts?.some(account=>account.username===payload.accountUsername))throw new Error('所选社区账号已退出，请刷新账号后重试');
  if(signal?.aborted)throw signal.reason;
  const captchaVerifyParam=await verify({signal});
  if(signal?.aborted)throw signal.reason;
  // Proof is produced and consumed in the root document, never returned by RPC.
  return api.request('POST','/api/market/publish',{...Object.fromEntries(fields.filter(key=>payload[key]!==undefined).map(key=>[key,payload[key]])),captchaVerifyParam},undefined,{signal,timeout:130000});
}
