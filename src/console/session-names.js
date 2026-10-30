// Optional presentation data, bound to the current transport/account generation.
// A name lookup can never make the session history itself unavailable.
const groupKey = value => typeof value === 'string' && /^group:\d{1,15}$/.test(value);
const privateKey = value => typeof value === 'string' && /^private:\d{1,15}$/.test(value);
const safeName = value => typeof value === 'string' ? [...value.trim()].slice(0, 512).join('') : '';

export function createSessionNameController({
  resolveSource = () => null, serviceLeaseOf, capability, bus, lifecycle,
  timeoutMs = 1500, cacheMs = 30000, failureBackoffMs = 5000, maxEntries = 4096, concurrency = 8, now = Date.now,
} = {}) {
  for (const [key, value] of Object.entries({timeoutMs, cacheMs, failureBackoffMs, maxEntries, concurrency})) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} 必须为正整数`);
  }
  let closed = false, epoch = 0, scope = null;
  const catalogs = new Map(), catalogFailedUntil = new Map();
  const cache = new Map(), operations = new Set(), cleanups = [], nameReads = new Map();
  function source() {
    try {
      const value = resolveSource() ?? {}, provider = value.provider ?? null;
      const identity = provider?.selfId === undefined ? provider?.status?.()?.selfId : provider.selfId;
      return {provider, token:value.token, identity:identity == null ? null : String(identity),account:provider?.actions?.getAccountIdentity?.()};
    } catch { return {provider:null, token:null, identity:null,account:undefined}; }
  }
  const same = (a,b) => a?.provider === b?.provider && a?.token === b?.token && a?.identity === b?.identity && a?.account === b?.account;
  function invalidate() {
    epoch++;cache.clear();catalogs.clear();catalogFailedUntil.clear();nameReads.clear();
    for (const operation of operations) operation.abort(new Error('名称来源已变化'));
  }
  function sync() {
    const next=source();
    if (!same(scope,next)) { scope=next;invalidate(); }
    return next;
  }
  function current(snapshot, generation) {
    if (closed || lifecycle?.signal?.aborted) return false;
    const next=sync();
    return generation === epoch && same(snapshot,next);
  }
  function leaseFor(snapshot) {
    if (typeof serviceLeaseOf !== 'function') return {isValid:()=>true,dispose(){}};
    try {
      const lease=serviceLeaseOf('transport.provider');
      if (lease.provider !== snapshot.provider) { lease.dispose?.();return null; }
      return lease;
    } catch { return null; }
  }
  const validLease = lease => { try { return !!lease && lease.isValid?.() !== false; } catch { return false; } };
  function remember(key,name,generation,ttl=name?cacheMs:Math.min(cacheMs,500)) {
    if (generation !== epoch || closed) return;
    cache.delete(key);cache.set(key,{name,expiresAt:now()+ttl});
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }
  async function bounded(action, snapshot, generation, lease, deadline, consumerSignal) {
    if (!current(snapshot,generation) || !validLease(lease) || consumerSignal?.aborted) return undefined;
    const controller=new AbortController();operations.add(controller);
    const upstream=[consumerSignal,lease?.signal,lifecycle?.signal].filter(Boolean), off=[];
    for (const signal of upstream) {
      const abort=()=>controller.abort(signal.reason);
      signal.addEventListener('abort',abort,{once:true});off.push(()=>signal.removeEventListener('abort',abort));
      if (signal.aborted) abort();
    }
    const remaining=Math.max(0,deadline-now());
    let timer,abort;
    const cancelled=new Promise(resolve=>{
      abort=()=>resolve(undefined);controller.signal.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>controller.abort(new Error('名称查询超时')),remaining);
      if (controller.signal.aborted) abort();
    });
    try {
      const operation=Promise.resolve().then(()=>{
        if (controller.signal.aborted || !current(snapshot,generation) || !validLease(lease)) return undefined;
        return action(controller.signal);
      });
      const result=await Promise.race([operation,cancelled]);
      return !controller.signal.aborted && current(snapshot,generation) && validLease(lease) ? result : undefined;
    } catch { return undefined; }
    finally {
      clearTimeout(timer);controller.signal.removeEventListener('abort',abort);
      for (const cleanup of off) cleanup();operations.delete(controller);
      if (!controller.signal.aborted) controller.abort(new Error('名称查询已结束'));
    }
  }
  function readCatalog(snapshot,generation,kind='group') {
    const previous=catalogs.get(kind);if (previous?.epoch === generation) return previous.promise;
    const state={epoch:generation,promise:null};catalogs.set(kind,state);
    state.promise=(async()=>{
      const lease=leaseFor(snapshot);
      try {
        const rows=await bounded(signal=>snapshot.provider.actions[kind==='group'?'listGroups':'listFriends']({signal}),snapshot,generation,lease,now()+timeoutMs);
        if (!Array.isArray(rows)) {if(current(snapshot,generation))catalogFailedUntil.set(kind,now()+failureBackoffMs);return null;}
        const names=new Map();
        for (const row of rows) {
          const id=String(row?.id??(kind==='group'?row?.group_id:row?.user_id)??'');
          const name=kind==='group'?safeName(row?.name??row?.group_name):safeName(row?.remark)||safeName(row?.nickname)||safeName(row?.name);
          if (/^\d{1,15}$/.test(id)) names.set(kind+':'+id,name===id||name===kind+':'+id?'':name);
        }
        return current(snapshot,generation) && validLease(lease) ? names : null;
      } finally { lease?.dispose?.();if(catalogs.get(kind)===state)catalogs.delete(kind); }
    })();
    return state.promise;
  }
  function readName(key,snapshot,generation,deadline) {
    const previous=nameReads.get(key);
    if(previous?.epoch===generation)return previous.promise;
    const state={epoch:generation,promise:null};nameReads.set(key,state);
    state.promise=(async()=>{
      const lease=leaseFor(snapshot);
      try {
        const value=await bounded(signal=>snapshot.provider.actions.getGroupName(key,{signal}),snapshot,generation,lease,deadline);
        if(!current(snapshot,generation)||!validLease(lease))return undefined;
        const name=safeName(value);remember(key,name,generation);return name;
      }finally{lease?.dispose?.();if(nameReads.get(key)===state)nameReads.delete(key);}
    })();
    return state.promise;
  }
  async function awaitConsumer(promise,signal) {
    if (!signal) return promise;
    if (signal.aborted) return null;
    let abort;
    const cancelled=new Promise(resolve=>{abort=()=>resolve(null);signal.addEventListener('abort',abort,{once:true});});
    try { return await Promise.race([promise,cancelled]); }
    finally { signal.removeEventListener('abort',abort); }
  }
  async function getGroupNames(chatKeys,{signal}={}) {
    const keys=[...new Set(chatKeys)].filter(groupKey),out=new Map();
    if (!keys.length || closed || signal?.aborted) return out;
    const snapshot=sync(),generation=epoch,lease=leaseFor(snapshot);
    if (!snapshot.provider || !validLease(lease)) { lease?.dispose?.();return out; }
    try {
      const missing=[];
      for (const key of keys) {
        const item=cache.get(key);
        if (item && item.expiresAt > now()) {out.set(key,item.name);cache.delete(key);cache.set(key,item);}
        else {cache.delete(key);missing.push(key);}
      }
      // Presentation enrichment should not repeatedly stall history while a
      // disconnected protocol or an unavailable catalog is recovering.
      if(snapshot.provider.status?.()?.connected===false)return out;
      if(snapshot.account===null&&typeof snapshot.provider.actions?.getAccountIdentity==='function')return out;
      if (missing.length && typeof snapshot.provider.actions?.listGroups === 'function') {
        if(now()<(catalogFailedUntil.get('group')??0))return out;
        const names=await awaitConsumer(readCatalog(snapshot,generation),signal);
        if (!current(snapshot,generation) || !validLease(lease) || signal?.aborted) return new Map();
        if (names) {
          for (const key of missing) {const name=names.get(key)||'';remember(key,name,generation,cacheMs);out.set(key,name);}
        }
        // An unavailable catalog must not fan out into one platform request
        // per archived group. The legacy single-name fallback is for providers
        // that do not implement catalogs at all.
        return out;
      }
      if (missing.length && typeof snapshot.provider.actions?.getGroupName === 'function') {
        // Compatibility for selected providers exposing only the older name
        // action. Bound the whole batch, including queued work, to one deadline.
        const deadline=now()+timeoutMs;let index=0;
        await Promise.all(Array.from({length:Math.min(concurrency,missing.length)},async()=>{
          while (index < missing.length && now() < deadline && current(snapshot,generation) && validLease(lease) && !signal?.aborted) {
            const key=missing[index++];
            const value=await awaitConsumer(readName(key,snapshot,generation,deadline),signal);
            if (!current(snapshot,generation) || !validLease(lease) || signal?.aborted) return;
            const name=safeName(value);remember(key,name,generation);out.set(key,name);
          }
        }));
      }
      return current(snapshot,generation) && validLease(lease) && !signal?.aborted ? out : new Map();
    } catch { return new Map(); }
    finally { lease?.dispose?.(); }
  }
  async function getPrivateNames(chatKeys,{signal}={}) {
    const keys=[...new Set(chatKeys)].filter(privateKey),out=new Map();
    if(!keys.length||closed||signal?.aborted)return out;
    const snapshot=sync(),generation=epoch,lease=leaseFor(snapshot);
    if(!snapshot.provider||!validLease(lease)){lease?.dispose?.();return out;}
    try{
      const missing=[];for(const key of keys){const item=cache.get(key);if(item&&item.expiresAt>now()){out.set(key,item.name);cache.delete(key);cache.set(key,item);}else{cache.delete(key);missing.push(key);}}
      if(!missing.length||snapshot.provider.status?.()?.connected===false||snapshot.account===null&&typeof snapshot.provider.actions?.getAccountIdentity==='function'||typeof snapshot.provider.actions?.listFriends!=='function'||now()<(catalogFailedUntil.get('private')??0))return out;
      const names=await awaitConsumer(readCatalog(snapshot,generation,'private'),signal);
      if(!current(snapshot,generation)||!validLease(lease)||signal?.aborted)return new Map();
      if(names)for(const key of missing){const name=names.get(key)||'';remember(key,name,generation,cacheMs);out.set(key,name);}
      return out;
    }catch{return new Map();}finally{lease?.dispose?.();}
  }
  async function getNames(chatKeys,options={}) {
    const snapshot=sync(),generation=epoch;
    const [groups,friends]=await Promise.all([getGroupNames(chatKeys,options),getPrivateNames(chatKeys,options)]);
    return current(snapshot,generation)&&!options.signal?.aborted?new Map([...groups,...friends]):new Map();
  }
  const offSelection=capability?.onChange?.(sync);
  const offStatus=bus?.on?.('transport.status',sync,{internal:true});
  const offPermission=bus?.on?.('permission.decision',event=>{
    // Authorization reads emit audit records too. Only actual decisions may
    // retire cached/ongoing work; otherwise acquiring our lease invalidates it.
    if(event?.detail==='管理员显式决定'||event?.resolution&&event.resolution!=='pending')invalidate();
  },{internal:true});
  for (const off of [offSelection,offStatus,offPermission]) if(typeof off==='function')cleanups.push(off);
  function dispose() {if(closed)return;closed=true;invalidate();for(const off of cleanups.splice(0))off();}
  lifecycle?.onStop?.(dispose);
  if (lifecycle?.signal) {lifecycle.signal.addEventListener('abort',dispose,{once:true});cleanups.push(()=>lifecycle.signal.removeEventListener('abort',dispose));}
  if(lifecycle?.signal?.aborted)dispose();
  return Object.freeze({getNames,dispose});
}
