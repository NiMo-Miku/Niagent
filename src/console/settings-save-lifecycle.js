import {createHash,randomUUID} from 'node:crypto';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status,expose:true});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const leaseId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);

// Selected default leaf. Authentication and the ordinary config/key guards stay
// in the route's applyPatch closure; this controller only owns ordered receipts.
export function createSettingsSaveLifecycleController({applyPatch,getIdentity,readConfig,lifecycle,canRecoverDraft=()=>false,now=()=>Date.now(),ttl=30*60*1000,maxScopes=64,maxBytes=1024*1024}={}){
  const scopes=new Map();let closed=false,tail=Promise.resolve();
  lifecycle?.onStop?.(()=>{closed=true;scopes.clear();});
  function active(){
    if(closed)fail('设置保存服务已关闭',503);
    if(lifecycle?.signal?.aborted){
      // Reset quiescence cancels the default unit before its diagnostic routes
      // are retained. Only the host may reopen config-draft recovery after a
      // failed reset; disposal remains permanent even in that recovery phase.
      let recover=false;try{recover=canRecoverDraft()===true;}catch{}
      if(!recover)fail('设置保存服务已关闭',503);
    }
  }
  function activeIdentity(body){
    active();
    const identity=getIdentity?.();if(!identity||identity.owner!==body.owner||identity.generation!==body.generation)fail('设置界面来源已变化，请重新打开后保存',409);
  }
  function prune(){for(const[key,scope]of scopes)if(!scope.pending&&(scope.retired||scope.expires<=now()))scopes.delete(key);}
  function open(body){
    if(!object(body)||!['generation,owner,parentLease,retireParent','generation,owner,parentLease,retireOnly,retireParent'].includes(Object.keys(body).sort().join(','))||Object.hasOwn(body,'retireOnly')&&body.retireOnly!==true||!/^ui-[a-f0-9]{60}$/.test(body.owner||'')||!/^[a-f0-9]{64}$/.test(body.generation||'')||body.parentLease!==null&&!leaseId(body.parentLease)||typeof body.retireParent!=='boolean'||body.retireOnly===true&&(!body.parentLease||!body.retireParent))fail('设置保存租约来源无效');
    activeIdentity(body);prune();
    const parent=body.parentLease&&scopes.get(body.parentLease);
    // Only a completed pagehide/unmount marks the tab's previous ticket retired.
    // A cloned or concurrently active tab keeps retired:false and is independent.
    if(body.retireParent&&parent){parent.retired=true;if(!parent.pending)scopes.delete(body.parentLease);}
    if(body.retireOnly===true)return{ok:true,retired:true};
    if(scopes.size>=maxScopes)fail('设置保存窗口过多；请稍后重试',429);
    const lease=randomUUID(),expiresAt=now()+ttl;scopes.set(lease,{owner:body.owner,generation:body.generation,revision:0,signature:null,pending:0,expires:expiresAt,receipt:null,retired:false});
    return{ok:true,lease,expiresAt};
  }
  async function put(body){
    active();
    if(!object(body)||Object.keys(body).sort().join(',')!=='generation,lease,owner,patch,revision'||!/^ui-[a-f0-9]{60}$/.test(body.owner||'')||!/^[a-f0-9]{64}$/.test(body.generation||'')||!leaseId(body.lease)||!Number.isSafeInteger(body.revision)||body.revision<1||!object(body.patch))fail('设置保存来源或版本无效');
    const patch=body.patch;
    if(Object.hasOwn(patch,'__replace__')||Object.hasOwn(patch,'server')&&(!object(patch.server)||Object.hasOwn(patch.server,'token')||Object.hasOwn(patch.server,'__replace__')))fail('控制台令牌只能在宿主窗口管理',403);
    activeIdentity(body);
    const serialized=JSON.stringify(body.patch);if(Buffer.byteLength(serialized)>maxBytes)fail('设置保存超过1MiB；请分批保存',413);
    const signature=digest(serialized);prune();const scope=scopes.get(body.lease);
    if(!scope||scope.retired||scope.owner!==body.owner||scope.generation!==body.generation)fail('设置保存租约已过期或被后续页面关闭；请保留输入并重新打开设置',409);
    ++scope.pending;scope.expires=now()+ttl;
    // Serialize arrivals across document leases too: an older accepted request
    // held by an asynchronous selected writer must finish before a later one.
    const operation=tail.then(async()=>{
      active();
      activeIdentity(body);if(scope.retired)fail('旧设置页面的保存租约已关闭，未重放旧修改',409);
      if(body.revision<scope.revision)return{ok:true,stale:true,revision:scope.revision};
      if(body.revision===scope.revision){if(signature!==scope.signature)fail('同一保存版本的内容不一致',409);return{...structuredClone(scope.receipt),...(readConfig?{config:readConfig()}:{}),revision:scope.revision};}
      if(typeof applyPatch!=='function')fail('设置保存能力不可用',503);
      const receipt=await applyPatch(structuredClone(body.patch));
      scope.revision=body.revision;scope.signature=signature;
      // Cache metadata only when the host supplies the current sanitized view.
      scope.receipt=readConfig?{ok:receipt?.ok!==false,...(receipt?.restartRequired?{restartRequired:true}:{})}:structuredClone(receipt);
      return{...receipt,revision:scope.revision};
    });
    tail=operation.catch(()=>{}).finally(()=>{--scope.pending;scope.expires=now()+ttl;});
    return operation;
  }
  return{open,put,close(){closed=true;scopes.clear();}};
}
