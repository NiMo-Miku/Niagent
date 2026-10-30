// Bounded shell-document RAM only. A frame receives no owner selector or storage API.
const forbidden=new Set(['__proto__','prototype','constructor']);
function copyJson(value){
  const seen=new Set();let nodes=0;
  function visit(item,depth){
    if(++nodes>1024||depth>6)throw Error('View state is too complex');
    if(item===null||typeof item==='boolean')return;
    if(typeof item==='number'){if(!Number.isFinite(item))throw Error('Invalid number');return;}
    if(typeof item==='string'){if(item.length>256)throw Error('View state string limit');return;}
    if(typeof item!=='object'||seen.has(item))throw Error('View state must be JSON');
    if(!Array.isArray(item)&&![Object.prototype,null].includes(Object.getPrototypeOf(item)))throw Error('View state must be a plain object');
    const keys=Reflect.ownKeys(item);
    if(Array.isArray(item)){if(item.length>128||keys.length!==item.length+1)throw Error('View state array limit');}
    else if(keys.length>64)throw Error('View state key limit');
    seen.add(item);
    for(const key of keys){
      if(Array.isArray(item)&&key==='length')continue;
      if(typeof key!=='string'||forbidden.has(key))throw Error('Invalid view state key');
      const descriptor=Object.getOwnPropertyDescriptor(item,key);
      if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('View state cannot contain accessors');
      visit(descriptor.value,depth+1);
    }
    seen.delete(item);
  }
  visit(value,0);const serialized=JSON.stringify(value),bytes=new TextEncoder().encode(serialized).length;
  if(bytes>8192)throw Error('View state byte limit');return{value:JSON.parse(serialized),bytes};
}
function identity(definition){
  if(definition?.kind!=='bundled'||!Array.isArray(definition.viewState?.keys)||!definition.viewState.keys.length||definition.viewState.keys.length>4)return null;
  const keys=definition.viewState.keys;
  if(new Set(keys).size!==keys.length||keys.some(key=>typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key)||forbidden.has(key)))return null;
  if([definition.id,definition.stateOwner,definition.stateGeneration].some(value=>typeof value!=='string'||!/^[A-Za-z0-9._-]{1,64}$/.test(value)))return null;
  return JSON.stringify([definition.kind,definition.stateOwner,definition.id,definition.stateGeneration,[...keys].sort()]);
}
export function createPanelViewState({now=()=>Date.now(),ttl=30*60*1000,flushMs=15000,maxScopes=32,totalBytes=256*1024}={}){
  const entries=new Map(),handles=new WeakMap();
  const close=lease=>{lease.status='closed';if(lease.entry.lease===lease)lease.entry.lease=null;};
  const current=handle=>{const lease=handles.get(handle);return lease&&lease.status!=='closed'&&lease.entry.lease===lease?lease:null;};
  function drop(key){const entry=entries.get(key);if(entry?.lease)close(entry.lease);entries.delete(key);}
  function reconcile(definitions){const live=new Map(definitions.map(definition=>[definition.id,identity(definition)]));for(const[key,entry]of entries)if(live.get(entry.id)!==key)drop(key);}
  function open(definition){
    const key=identity(definition);if(!key)return null;
    for(const[oldKey,entry]of entries)if(entry.id===definition.id&&oldKey!==key||entry.expiresAt<=now()&&!entry.lease)drop(oldKey);
    let entry=entries.get(key);
    if(!entry){if(entries.size>=maxScopes)return null;entry={id:definition.id,keys:[...definition.viewState.keys],data:{},bytes:2,expiresAt:now()+ttl,lease:null};entries.set(key,entry);}
    if(entry.lease)close(entry.lease);
    const handle=Object.freeze({}),lease={entry,status:'active',flushId:null,deadline:0};entry.lease=lease;handles.set(handle,lease);return handle;
  }
  function read(handle){const lease=current(handle);return lease?.status==='active'&&lease.entry.expiresAt>now()?copyJson(lease.entry.data).value:{};}
  function leave(handle,flushId){const lease=current(handle);if(!lease||lease.status!=='active'||typeof flushId!=='string')return false;lease.status='draining';lease.flushId=flushId;lease.deadline=now()+flushMs;return true;}
  function finish(handle,flushId,snapshot){
    const lease=current(handle);if(!lease||lease.status!=='draining'||lease.flushId!==flushId)return false;
    close(lease);if(now()>lease.deadline)return false;
    try{
      if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||Reflect.ownKeys(snapshot).some(key=>!lease.entry.keys.includes(key)))return false;
      const copied=copyJson(snapshot),otherBytes=[...entries.values()].filter(entry=>entry!==lease.entry).reduce((sum,entry)=>sum+entry.bytes,0);
      if(otherBytes+copied.bytes>totalBytes)return false;
      lease.entry.data=copied.value;lease.entry.bytes=copied.bytes;lease.entry.expiresAt=now()+ttl;return true;
    }catch{return false;}
  }
  function expire(handle){const lease=current(handle);if(lease)close(lease);}
  function cancel(handle,flushId){const lease=current(handle);if(lease?.status==='draining'&&lease.flushId===flushId){lease.status='active';lease.flushId=null;lease.deadline=0;}}
  return Object.freeze({open,read,leave,finish,expire,cancel,reconcile});
}
