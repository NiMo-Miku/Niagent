// Public scene/SDK from https://kondius.cn/qq-agent/holyshits/ (GET, 2026-10-12).
// V3 instance/callback contract: https://help.aliyun.com/zh/captcha/captcha2-0/user-guide/new-architecture-for-web-and-h5-client-access
export const PUBLIC_CAPTCHA_SDK='https://kondius.cn/qq-agent/captcha-sdk/AliyunCaptcha.js';
let scriptReady=null,sequence=0;
function loadSdk(){
  if(typeof window.initAliyunCaptcha==='function')return Promise.resolve();
  if(scriptReady)return scriptReady;
  window.AliyunCaptchaConfig={region:'cn',prefix:'163stu'};
  scriptReady=new Promise((resolve,reject)=>{
    const script=document.createElement('script'),timer=setTimeout(()=>fail(),15000);
    const fail=()=>{clearTimeout(timer);script.remove();scriptReady=null;reject(new Error('人机验证组件未就绪，请检查网络后重试'));};
    script.src=PUBLIC_CAPTCHA_SDK;script.onload=()=>{clearTimeout(timer);if(typeof window.initAliyunCaptcha==='function')resolve();else fail();};script.onerror=fail;document.head.append(script);
  });
  return scriptReady;
}
export async function verifyPublicCaptcha({signal,timeout=120000}={}){
  if(signal?.aborted)throw signal.reason;
  await new Promise((resolve,reject)=>{
    const abort=()=>{signal?.removeEventListener('abort',abort);reject(signal.reason);};
    signal?.addEventListener('abort',abort,{once:true});
    loadSdk().then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));
  });
  if(signal?.aborted)throw signal.reason;
  return new Promise((resolve,reject)=>{
    const id=`public-captcha-${++sequence}`,container=document.createElement('div'),trigger=document.createElement('button');
    container.id=id;trigger.id=`${id}-trigger`;trigger.type='button';trigger.hidden=true;document.body.append(container,trigger);
    let instance=null,done=false;
    const finish=(error,proof)=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      try{instance?.hide?.();instance?.destroyCaptcha?.();}catch{}
      container.remove();trigger.remove();error?reject(error):resolve(proof);
    };
    const abort=()=>finish(signal.reason??new Error('已取消投稿'));
    const timer=setTimeout(()=>finish(new Error('人机验证超时，请重新验证后提交')),timeout);
    signal?.addEventListener('abort',abort,{once:true});
    try{
      window.initAliyunCaptcha({SceneId:'632wvduj',mode:'popup',element:`#${id}`,button:`#${trigger.id}`,zIndex:2147483000,language:'cn',slideStyle:{width:320,height:40},
        getInstance:value=>{instance=value;if(done){try{instance?.hide?.();instance?.destroyCaptcha?.();}catch{}return;}try{instance.show();}catch{finish(new Error('人机验证组件未就绪，请稍后重试'));}},
        success:proof=>{if(typeof proof!=='string'||!proof||proof.length>16384)finish(new Error('人机验证未返回有效凭据，请重新验证'));else finish(null,proof);},
        fail:()=>finish(new Error('人机验证未通过，请重新验证后提交')),
        onError:()=>finish(new Error('人机验证初始化失败，请检查网络后重试')),
        onClose:reason=>{if(reason==='userDismiss')finish(new Error('已取消人机验证，尚未投稿'));},
      });
    }catch{finish(new Error('人机验证组件异常，请刷新后重试'));}
  });
}
