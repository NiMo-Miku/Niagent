import {ApiClient} from './api-client.js';
import {consoleTokenValue} from './token-management.js';

// Only the root document owns this form and a candidate credential. The shared
// credential changes after a genuine, structurally valid panel response.
export function createPanelRecovery({host,api,auth,onRecovered,doc=document}={}) {
  let card=null,title,explanation,form,field,input,submit,feedback;
  let authentication=false,busy=false,disposed=false,version=0,controller=null;
  let retryTimer=null;
  const mounted=()=>!disposed&&card?.parentNode===host;
  function schedule(){
    clearTimeout(retryTimer);retryTimer=null;
    if(mounted()&&auth.automatic&&!busy&&!doc.hidden)retryTimer=setTimeout(()=>{retryTimer=null;void recover();},1500);
  }
  const resume=()=>{if(mounted()&&auth.automatic&&!doc.hidden&&!busy)void recover();else schedule();};
  doc.addEventListener('visibilitychange',resume);
  doc.defaultView?.addEventListener('online',resume);

  function create() {
    if(card)return;
    card=doc.createElement('section');card.id='panel-recovery';card.className='panel-recovery';
    card.setAttribute('role','region');card.setAttribute('aria-labelledby','panel-recovery-title');
    title=doc.createElement('h2');title.id='panel-recovery-title';
    explanation=doc.createElement('p');
    form=doc.createElement('form');form.className='panel-recovery-form';
    field=doc.createElement('label');field.className='panel-recovery-field';field.textContent='控制台访问令牌';
    input=doc.createElement('input');input.id='panel-recovery-token';input.type='password';input.autocomplete='off';input.spellcheck=false;
    input.setAttribute('autocapitalize','none');input.setAttribute('aria-label','控制台访问令牌');field.append(input);
    submit=doc.createElement('button');submit.type='submit';submit.className='primary';form.append(submit);
    feedback=doc.createElement('p');feedback.id='panel-recovery-status';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    form.addEventListener('submit',event=>{event.preventDefault();void recover();});
    card.append(title,explanation,form,feedback);
  }

  function paint(error) {
    authentication=error?.status===401&&!auth.automatic;
    title.textContent=authentication?'控制台认证已失效，请重新连接':auth.automatic?'正在重新连接控制台':'面板加载失败';
    explanation.textContent=authentication?'使用当前实例的控制台访问令牌恢复连接。':auth.automatic?'服务恢复后将自动重新连接。':'暂时无法读取控制台面板，请重试。';
    submit.textContent=authentication?'重新连接':auth.automatic?'立即重试':'重试加载';
    if(authentication){if(field.parentNode!==form)form.insertBefore(field,submit);}
    else{input.value='';field.remove();}
  }

  function show(error) {
    if(disposed||busy)return;
    create();const mounting=card.parentNode!==host;
    paint(error);feedback.textContent='';
    if(mounting){host.replaceChildren(card);(authentication?input:submit).focus({preventScroll:true});}
    schedule();
  }

  async function recover() {
    if(disposed||busy||card?.parentNode!==host)return;
    clearTimeout(retryTimer);retryTimer=null;
    let candidateToken;
    if(authentication){
      try{candidateToken=consoleTokenValue(input.value);}
      catch(error){feedback.textContent=error.message;input.focus();return;}
    }
    const ticket=++version,checkingCredential=authentication;
    const authVersion=api.authVersion,sharedToken=api.token,sharedAuthToken=auth.token;
    const credentialsCurrent=()=>api.authVersion===authVersion&&api.token===sharedToken&&auth.token===sharedAuthToken;
    const superseded=()=>{paint(null);feedback.textContent='控制台连接已更新，请重试加载。';};
    const current=()=>!disposed&&version===ticket&&card?.parentNode===host;
    busy=true;submit.disabled=input.disabled=true;card.setAttribute('aria-busy','true');
    feedback.textContent=checkingCredential?'正在验证连接…':'正在加载面板…';
    let verified=false;
    try{
      let data;
      if(checkingCredential){
        controller=new AbortController();
        const candidate=new ApiClient({token:candidateToken,base:api.base,timeout:api.timeout});
        data=await candidate.request('GET','/api/panels',undefined,{}, {signal:controller.signal});
      }else data=await api.get('/api/panels');
      if(!current())return;
      if(!credentialsCurrent()){superseded();return;}
      if(!Array.isArray(data?.panels))throw new Error('INVALID_PANEL_RESPONSE');
      if(checkingCredential){auth.adopt(candidateToken);api.setToken(candidateToken);input.value='';}
      verified=true;
      await onRecovered(data);
      if(!disposed&&version===ticket)clear();
    }catch(error){
      if(!current())return;
      if(!verified&&!credentialsCurrent()){superseded();return;}
      if(verified){paint(null);feedback.textContent='连接已验证，面板尚未恢复，请重试加载。';}
      else if(checkingCredential){
        feedback.textContent=error?.status===401?'访问令牌未通过验证，请检查后重新连接。':'连接验证失败，请检查服务后重试。';
      }else if(error?.status===401&&error?.credentialCurrent!==false){
        auth.invalidate?.(error);paint(error);feedback.textContent=auth.automatic?'等待服务恢复…':'请填写当前实例的访问令牌。';
      }else feedback.textContent='面板加载失败，请重试加载。';
    }finally{
      if(version===ticket){busy=false;controller=null;if(card){submit.disabled=input.disabled=false;card.removeAttribute('aria-busy');}schedule();}
    }
  }

  function clear() {
    ++version;clearTimeout(retryTimer);retryTimer=null;controller?.abort();controller=null;busy=false;
    if(input){input.value='';input.disabled=false;submit.disabled=false;card.removeAttribute('aria-busy');feedback.textContent='';card.remove();}
  }
  function dispose(){disposed=true;clear();doc.removeEventListener('visibilitychange',resume);doc.defaultView?.removeEventListener('online',resume);}
  return Object.freeze({show,clear,dispose});
}
