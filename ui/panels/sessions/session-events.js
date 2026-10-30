// Bounded, single-flight read-only SSE reconciliation. No event payload is
// treated as an authoritative business snapshot or retained in the queue.
export function createSessionEvents({run,doc=document,delay=80,onError=()=>{}}){
  const view=doc.defaultView;let timer=null,busy=false,disposed=false,follow=false,followId=null;const ids=new Set();
  function schedule(){if(disposed||doc.hidden||busy||timer!==null||!ids.size)return;timer=view.setTimeout(drain,delay);}
  async function drain(){
    timer=null;if(disposed||doc.hidden||busy||!ids.size)return;
    const batch={ids:new Set(ids),follow,followId};ids.clear();follow=false;followId=null;busy=true;
    try{if(!disposed)await run(batch);}catch(error){if(!disposed)onError(error);}finally{busy=false;schedule();}
  }
  function push(id,{follow:requested=false}={}){
    if(disposed)return;follow ||= requested;if(requested&&typeof id==='string'&&id&&id.length<=200&&id!=='*')followId=id;
    if(typeof id!=='string'||!id||id.length>200||id==='*'||ids.size>=256){ids.clear();ids.add('*');}else if(!ids.has('*'))ids.add(id);
    schedule();
  }
  function visibility(){if(doc.hidden){if(timer!==null)view.clearTimeout(timer);timer=null;}else schedule();}
  function dispose(){if(disposed)return;disposed=true;if(timer!==null)view.clearTimeout(timer);timer=null;ids.clear();doc.removeEventListener('visibilitychange',visibility);view.removeEventListener('pagehide',dispose);}
  doc.addEventListener('visibilitychange',visibility);view.addEventListener('pagehide',dispose,{once:true});
  return{push,dispose};
}
