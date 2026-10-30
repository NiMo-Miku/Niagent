import crypto from 'node:crypto';
// Default channel editing policy. The route commits this patch once through
// the selected configuration store; no client provider array is accepted.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status, expose:true}); };
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const idOf = value => typeof value === 'string' ? value.trim() : String(value?.id ?? value?.model ?? '').trim();
const idsOf = models => (Array.isArray(models) ? models : []).map(idOf).filter(Boolean);
const displayName = p => p.displayName || p.name || p.id;
const revisionSecret=crypto.randomBytes(32);
export function providerCredentialRevision(provider,cfg) {
  // An opaque process-local compare token, never a public hash of a secret.
  return crypto.createHmac('sha256',revisionSecret).update(JSON.stringify([
    provider.id,cfg.dshProviderKeys?.[provider.id] ?? null,provider.apiKey ?? null,
    provider.apiKeyFrom ?? null,provider.apiKeyFrom ? process.env[provider.apiKeyFrom] ?? null : null,
  ])).digest('hex');
}
function endpoint(value) {
  try { const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';u.pathname=u.pathname.replace(/\/+$/,'')||'/';u.hash='';return u.href; } catch { return ''; }
}
export function providerEditPatch(cfg, body) {
  const matches=(cfg.providers ?? []).filter(p=>p.id===body?.providerId);
  if(!matches.length)fail('提供商不存在',404);
  if(matches.length!==1)fail('渠道身份重复，请先修复配置',409);
  const current=matches[0], changes=body.changes, expected=body.expected;
  if(!object(changes)||!object(expected))fail('请提供字段改动及原值');
  const allowed=['displayName','baseUrl','models','apiKey'];
  if(Object.keys(changes).some(k=>!allowed.includes(k)))fail('渠道包含不支持的编辑字段');
  // Even key-only changes must not target an endpoint changed since opening.
  const original=endpoint(expected.baseUrl);
  if(!original)fail('预期渠道地址无效');
  if(original!==endpoint(current.baseURL ?? current.baseUrl))fail('渠道地址已改变，请重新打开编辑器',409);
  const next=structuredClone(current);
  if(own(changes,'displayName')) {
    if(typeof changes.displayName!=='string'||!changes.displayName.trim()||changes.displayName.trim().length>100)fail('显示名称须为1至100个字符');
    if(expected.displayName!==displayName(current))fail('渠道名称已被修改，请重新打开编辑器',409);
    next.displayName=changes.displayName.trim();
  }
  if(own(changes,'models')) {
    if(!Array.isArray(changes.models)||changes.models.some(id=>typeof id!=='string'||!id.trim()))fail('模型目录必须是非空ID的数组');
    if(!Array.isArray(expected.models)||JSON.stringify(expected.models)!==JSON.stringify(idsOf(current.models)))fail('模型目录已被修改，请重新打开编辑器',409);
    const ids=[...new Set(changes.models.map(id=>id.trim()))], old=new Map((Array.isArray(current.models)?current.models:[]).map(model=>[idOf(model),model]));
    next.models=ids.map(id=>old.get(id) ?? id);
    if(object(current.modelNames))next.modelNames=Object.fromEntries(Object.entries(current.modelNames).filter(([id])=>ids.includes(id)));
  }
  if(own(changes,'baseUrl')) {
    if(typeof changes.baseUrl!=='string'||!endpoint(changes.baseUrl))fail('Base URL 必须是有效的 http(s) 地址');
    next.baseUrl=endpoint(changes.baseUrl);next.baseURL=next.baseUrl;
  }
  if(own(changes,'apiKey')&&(typeof changes.apiKey!=='string'||!changes.apiKey.trim()||changes.apiKey.trim()==='******'))fail('请提供新密钥；清除请使用独立按钮');
  if(own(changes,'apiKey')&&expected.credentialRevision!==providerCredentialRevision(current,cfg))fail('渠道密钥已被修改，请重新打开编辑器',409);
  if(!Object.keys(changes).length)return null;
  const patch={providers:structuredClone((cfg.providers ?? []).map(p=>p===current?next:p))};
  if(own(changes,'baseUrl')&&cfg.api?.provider===current.id)patch.api={baseUrl:next.baseUrl};
  if(own(changes,'apiKey'))patch.dshProviderKeys={__replace__:{...cfg.dshProviderKeys,[current.id]:changes.apiKey.trim()}};
  return patch;
}

// One catalogue entry and its configured uses change in the same store commit.
// Only the edited label is compared; unrelated metadata can change concurrently.
export function providerModelEditPatch(cfg, body) {
  const matches=(cfg.providers ?? []).filter(p=>p.id===body?.providerId);
  if(!matches.length)fail('提供商不存在',404);
  if(matches.length!==1)fail('渠道身份重复，请先修复配置',409);
  const provider=matches[0], original=endpoint(body.expectedBaseUrl);
  if(!original)fail('预期渠道地址无效');
  if(original!==endpoint(provider.baseURL ?? provider.baseUrl))fail('渠道地址已改变，请重新打开编辑器',409);
  const oldId=body.modelId, nextId=typeof body.id==='string'?body.id.trim():'', name=typeof body.name==='string'?body.name.trim():'';
  if(typeof oldId!=='string'||!nextId||nextId.length>500)fail('模型 ID 须为1至500个字符');
  if(!name||name.length>200)fail('显示名称须为1至200个字符');
  const models=Array.isArray(provider.models)?provider.models:[], indexes=models.flatMap((m,i)=>idOf(m)===oldId?[i]:[]);
  if(indexes.length!==1)fail('模型已被修改或移除，请重新打开编辑器',409);
  const index=indexes[0], current=models[index];
  const names=object(provider.modelNames)?provider.modelNames:{};
  const label=String((own(names,oldId)&&names[oldId])||(object(current)&&(current.name||current.displayName))||oldId);
  if(body.expectedName!==label)fail('模型名称已被修改，请重新打开编辑器',409);
  if(nextId!==oldId&&models.some(m=>idOf(m)===nextId))fail('此渠道已有相同的模型 ID',409);
  if(nextId===oldId&&name===label)return null;
  const next=structuredClone(provider), entry=object(current)?{...current}:{id:nextId};
  if(own(entry,'model'))entry.model=nextId;
  entry.id=nextId;entry.name=name;
  if(own(entry,'displayName'))entry.displayName=name;
  next.models[index]=entry;
  // Replace the map explicitly so the old ID cannot survive a deep merge.
  next.modelNames=Object.fromEntries([...Object.entries(names).filter(([id])=>id!==oldId),[nextId,name]]);
  const patch={providers:structuredClone(cfg.providers.map(p=>p===provider?next:p))};
  if(nextId!==oldId){
    const api=cfg.api||{}, edits={};
    if(api.provider===provider.id&&api.model===oldId)edits.model=nextId;
    for(const kind of ['vision','video'])if((api[`${kind}Provider`]||api.provider)===provider.id&&api[`${kind}Model`]===oldId)edits[`${kind}Model`]=nextId;
    if(Array.isArray(api.fallbackModels)&&api.fallbackModels.some(m=>(m?.provider||api.provider)===provider.id&&m?.model===oldId))edits.fallbackModels=api.fallbackModels.map(m=>(m?.provider||api.provider)===provider.id&&m?.model===oldId?{...m,model:nextId}:m);
    if(Object.keys(edits).length)patch.api=edits;
    if(cfg.memory?.provider===provider.id&&cfg.memory.model===oldId)patch.memory={model:nextId};
  }
  return patch;
}
