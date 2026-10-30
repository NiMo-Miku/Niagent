// One delegated sweep binding per message pane; no listeners are created when
// switching chats or rebuilding message rows. Independent default UI asset.
export function createMessageSweep({root,enabled,changed}) {
  let pointer=null,disposed=false;const cleanups=[];
  const listen=(target,event,fn)=>{target.addEventListener(event,fn);cleanups.push(()=>target.removeEventListener(event,fn));};
  const reset=()=>{pointer=null;};
  function checkbox(event){
    if(!(event.target instanceof Element)||event.target.closest('button,summary,input,a,audio,video,textarea,select'))return null;
    const row=event.target.closest('.message');if(!row||!root.contains(row))return null;
    const input=row.querySelector('input[type=checkbox]');return input&&!input.hidden&&!input.disabled?input:null;
  }
  function set(input,value){if(input.checked===value)return;input.checked=value;changed();}
  listen(root,'pointerdown',event=>{
    if(disposed||!enabled()||event.button!==0||event.isPrimary===false)return;
    const input=checkbox(event);if(!input)return;
    event.preventDefault();pointer={id:event.pointerId,value:!input.checked};set(input,pointer.value);
  });
  listen(root,'pointerover',event=>{
    if(!pointer||event.pointerId!==pointer.id)return;
    if(!enabled()||!(event.buttons&1)){reset();return;}
    const input=checkbox(event);if(input)set(input,pointer.value);
  });
  listen(root,'pointermove',event=>{if(pointer&&event.pointerId===pointer.id&&!(event.buttons&1))reset();});
  const finish=event=>{if(pointer?.id===event.pointerId)reset();};
  listen(window,'pointerup',finish);listen(window,'pointercancel',finish);listen(root,'lostpointercapture',reset);listen(window,'blur',reset);
  listen(document,'visibilitychange',()=>{if(document.hidden)reset();});
  return {reset,dispose(){if(disposed)return;disposed=true;reset();cleanups.splice(0).forEach(fn=>fn());}};
}
