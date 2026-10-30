// Independent settings consumer: host owns scheduling, dismissal and navigation.
export function mountUpdateStatus({host,action,subscribe}){
  const doc=host.ownerDocument,box=doc.createElement('section'),summary=doc.createElement('p'),error=doc.createElement('p'),notes=doc.createElement('p'),check=doc.createElement('button'),reveal=doc.createElement('button');
  box.className='settings-update';box.setAttribute('aria-label','版本信息');summary.setAttribute('role','status');error.className='error';notes.style.whiteSpace='pre-wrap';check.type=reveal.type='button';check.textContent='检查版本';reveal.textContent='查看更新与下载';box.append(summary,error,notes,check,reveal);host.append(box);let disposed=false,revision=0,currentState=null;
  function render(state){if(disposed||Number.isFinite(state?.revision)&&Number.isFinite(currentState?.revision)&&state.revision<currentState.revision)return;currentState=state;const r=state?.result;summary.textContent=r?(r.hasUpdate?`发现新版本 ${r.latest} · 当前 ${r.current}`:`当前 ${r.current} · 已是最新版本`):'尚未检查版本';error.textContent=state?.error?`检查失败：${state.error}${r?'；保留上次成功结果':''}`:'';notes.textContent=r?.notes||'';reveal.hidden=!r?.hasUpdate;check.disabled=state?.busy===true;
    renderMarker();
  }
  function renderMarker(){if(disposed)return;const r=currentState?.result;
    const nav=doc.querySelector('#settings-sidebar a[data-target=desktop]');if(nav){nav.dataset.updateAvailable=String(!!r?.hasUpdate);nav.title=r?.hasUpdate?`发现新版本 ${r.latest}`:'';const led=nav.querySelector('.led');led?.classList.toggle('has-update',!!r?.hasUpdate);if(led)led.style.background=r?.hasUpdate?'var(--accent)':'';}
  }
  const observer=new doc.defaultView.MutationObserver(renderMarker);const sidebar=doc.querySelector('#settings-sidebar');if(sidebar)observer.observe(sidebar,{childList:true,subtree:true});
  const off=subscribe((name,state)=>{if(name==='update-status'){++revision;render(state);}});
  const ticket=revision;Promise.resolve().then(()=>action({action:'status'})).then(state=>{if(ticket===revision)render(state);}).catch(reason=>{if(!disposed)error.textContent=reason.message;});
  check.addEventListener('click',async()=>{check.disabled=true;try{const state=await action({action:'check'});render(state);}catch(reason){if(!disposed)error.textContent=reason.message;}finally{if(!disposed)check.disabled=currentState?.busy===true;}});
  reveal.addEventListener('click',()=>{void Promise.resolve(action({action:'reveal'})).catch(reason=>{if(!disposed)error.textContent=reason.message;});});
  return()=>{disposed=true;observer.disconnect();off?.();box.remove();};
}
