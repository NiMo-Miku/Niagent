// Default settings lifecycle adapter; replacement UIs can keep their own contract.
export function createSettingsSaveLifecycle({form,invalid,sendState,saveRequest,request,extraGuard=()=>'',paused=()=>'',onError=()=>{},window:win=window}={}){
  let revision=0,enabled=false;
  function sync(){
    const state={revision:++revision,patch:form.dirty?form.snapshot().patch:null,error:paused()||(invalid.size?[...invalid.values()].join('；'):''),guard:extraGuard()};
    if(enabled)sendState(state).catch(onError);
    return state;
  }
  const beforeUnload=event=>{
    if(!form.dirty&&!invalid.size&&!extraGuard()&&!paused())return;
    // This synchronous guard also covers a last edit whose queued postMessage
    // has not reached the parent yet. The browser owns the leave/stay decision.
    event.preventDefault();event.returnValue='';
  };
  win.addEventListener('beforeunload',beforeUnload);
  return{
    enable(value){enabled=value===true;sync();},sync,
    async save(snapshot){const state=sync();return enabled?saveRequest({revision:state.revision,patch:snapshot.patch}):request('POST','/api/config',snapshot.patch);},
    dispose(){win.removeEventListener('beforeunload',beforeUnload);},
  };
}
