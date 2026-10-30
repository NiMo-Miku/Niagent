import {createHash} from 'node:crypto';

const FIELDS=['blocklist','globalBlocklist','communityExemptions'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const source=field=>`host-config:${field}`;
function view(config){
  const cfg=config.get();
  return{revisionKind:'raw-field-v1',fields:Object.fromEntries(FIELDS.map(field=>{
    const present=Object.hasOwn(cfg,field),value=present?structuredClone(cfg[field]):field==='blocklist'?{}:[];
    return[field,{value,present,source:source(field),revision:hash(present?[true,cfg[field]]:[false])}];
  }))};
}
function validate(value,field){
  if(field==='blocklist'?!object(value):!Array.isArray(value))fail(field==='blocklist'?'按群原始名单必须为 JSON 对象':'本机原始名单必须为 JSON 数组');
  const scan=item=>{
    if(item===null||['string','boolean'].includes(typeof item))return;
    if(typeof item==='number'&&Number.isFinite(item))return;
    if(!item||typeof item!=='object')fail('名单必须为有效 JSON');
    for(const[key,next]of Object.entries(item)){
      if(['__proto__','prototype','constructor','__replace__'].includes(key))fail('原始名单不允许 prototype/constructor/__replace__ 键');
      scan(next);
    }
  };
  scan(value);
}

// Whole raw fields have independent versions. This local synchronous transaction
// intentionally never reads/writes a selected community service or cloud cache.
export function createBlocklistRawController({config,publish=()=>{}}){
  function get(){return view(config);}
  function put(body){
    if(!object(body)||Object.keys(body).some(key=>!['patch','expected'].includes(key))||!object(body.patch)||!object(body.expected))fail('需提供原始名单字段及打开时的版本');
    const keys=Object.keys(body.patch);
    if(!keys.length||keys.some(key=>!FIELDS.includes(key))||Object.keys(body.expected).length!==keys.length||Object.keys(body.expected).some(key=>!keys.includes(key)))fail('只允许三个原始名单字段，且每个字段需有版本');
    const current=get();
    for(const field of keys){
      const expected=body.expected[field];
      if(!object(expected)||Object.keys(expected).some(key=>!['source','revision'].includes(key))||typeof expected.source!=='string'||typeof expected.revision!=='string')fail('每个原始名单字段需提供来源和原版本');
      validate(body.patch[field],field);
      if(expected.source!==current.fields[field].source||expected.revision!==current.fields[field].revision)fail(`${field} 已被其它操作修改；原始名单草稿保留，请对比后重试`,409);
    }
    const changed=keys.some(field=>!current.fields[field].present||hash(current.fields[field].value)!==hash(body.patch[field]));
    if(changed){
      // Use the existing durable .tmp/rename transaction once for all fields.
      const patch=Object.fromEntries(keys.map(field=>[field,field==='blocklist'?{__replace__:structuredClone(body.patch[field])}:structuredClone(body.patch[field])]));
      if(typeof config.updateRawFields==='function')config.updateRawFields(patch);else config.update(patch);
      publish('status',{configUpdated:true,blocklistRawUpdated:true});
    }
    return{ok:true,changed,...get()};
  }
  return Object.freeze({get,put});
}
