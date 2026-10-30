// Small ID-only navigation state. The host already bounds/isolates the JSON;
// this leaf additionally validates the business ID against the real live list.
export function createSelectionState({read,register,getId,validId,restore,getFollow}={}){
  let disposed=false,ready=false,consumed=false,intent=0;
  const saved=Promise.resolve().then(read).catch(()=>null);
  const unregister=register(()=>{
    if(!ready)throw Error('选择状态尚未就绪');
    const id=getId();return{schema:1,id:validId(id)?id:null,...(getFollow?{follow:getFollow()===true}:{})};
  });
  return Object.freeze({
    touch(){++intent;},
    async accept(ids,{isCurrent=()=>true}={}){
      if(disposed||consumed)return false;
      const ticket=intent,snapshot=await saved;
      if(disposed||consumed||!isCurrent())return false;
      consumed=true;ready=true;
      if(ticket!==0||ticket!==intent||getId()!==null)return false;
      if(snapshot?.schema!==1)return false;
      const id=validId(snapshot.id)&&ids.includes(snapshot.id)?snapshot.id:null;
      await restore(id,{...(getFollow&&typeof snapshot.follow==='boolean'?{follow:snapshot.follow}:{})});
      return id!==null;
    },
    dispose(){if(disposed)return;disposed=true;++intent;unregister();},
  });
}
