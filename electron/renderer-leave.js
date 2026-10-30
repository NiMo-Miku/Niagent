import {randomUUID} from 'node:crypto';

// A bounded handshake with the current main-frame document. The renderer gets
// no shutdown, filesystem or generic IPC authority through this protocol.
export function createRendererLeave({getWindow,allowFrame=()=>true,timeout=20000}={}){
  let ready=null,pending=null;
  const current=event=>{
    const win=getWindow?.();if(!win||win.isDestroyed?.())return null;
    const contents=win.webContents;
    return event?.sender===contents&&event.senderFrame===contents.mainFrame&&allowFrame(contents,event.senderFrame)?contents:null;
  };
  function register(event){const contents=current(event);if(contents)ready={contents,frame:contents.mainFrame};}
  function acknowledge(event,body){
    const contents=current(event);
    if(!contents||!pending||pending.contents!==contents||pending.frame!==event.senderFrame||body?.requestId!==pending.id||typeof body.ok!=='boolean')return;
    pending.finish({ok:body.ok,...(body.ok?{}:{error:String(body.error||'设置尚未保存；退出已取消').slice(0,512)})});
  }
  async function prepare(reason){
    const win=getWindow?.();if(!win||win.isDestroyed?.())return{ok:true};const contents=win.webContents;
    // A document which has not registered the default shell cannot have entered
    // its settings editor. Destroyed/crashed renderers cannot promise a save.
    if(!ready||ready.contents!==contents||ready.frame!==contents.mainFrame)return{ok:true};
    if(pending)return pending.promise;
    let finish;const promise=new Promise(resolve=>{finish=resolve;});
    const id=randomUUID(),frame=contents.mainFrame;
    const timer=setTimeout(()=>pending?.id===id&&pending.finish({ok:false,error:'等待设置保存超时；窗口保留，请稍后重试'}),timeout);
    pending={id,contents,frame,promise,finish(result){if(pending?.id!==id)return;clearTimeout(timer);pending=null;finish(result);}};
    try{contents.send('qq-agent:prepare-leave',{requestId:id,reason});}catch{pending.finish({ok:false,error:'无法确认设置保存；退出已取消'});}
    return promise;
  }
  function reset(){ready=null;if(pending)pending.finish({ok:false,error:'窗口代际已变化，未确认保存'});}
  return{register,acknowledge,prepare,reset};
}
