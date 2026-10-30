import {createHash} from 'node:crypto';
const FIELDS=['in','out','cached'], forbidden=new Set(['__proto__','prototype','constructor','__replace__']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value??{},key);
const hash=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const slot=(row,key)=>object(row)&&own(row,key)?[true,row[key]]:[false];
function validId(id){if(typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>200||forbidden.has(id))fail('模型 ID 需为 1~200 字符');}
function mapping(config){const value=config.get().api?.modelPrices;if(value==null)return{};if(!object(value))fail('模型价格映射格式无效');return value;}
function describe(id,row){return{id,values:Object.fromEntries(FIELDS.map(key=>[key,object(row)&&own(row,key)?row[key]:null])),revisions:Object.fromEntries(FIELDS.map(key=>[key,hash(slot(row,key))])),rowRevision:hash(row)};}

// Only the submitted fields/rows are compared and merged over the latest map.
// Unknown row metadata survives ordinary edits; explicit row removal compares
// the complete row so it cannot silently erase a concurrent metadata update.
export function createModelPriceController({config,publish=()=>{}}){
  function get(){return{entries:Object.entries(mapping(config)).filter(([id])=>!forbidden.has(id)).map(([id,row])=>describe(id,row)),empty:describe('',undefined)};}
  function put(body){
    if(!object(body)||Object.keys(body).some(key=>key!=='changes')||!Array.isArray(body.changes)||!body.changes.length||body.changes.length>64)fail('需提供 1~64 项价格变更');
    const current=mapping(config),next={...current},seen=new Set(),ids=[];
    for(const change of body.changes){
      if(!object(change))fail('价格变更格式无效');validId(change.id);
      if(seen.has(change.id))fail('同一模型只能提交一次');seen.add(change.id);ids.push(change.id);
      const row=current[change.id],view=describe(change.id,row);
      if(change.remove===true){
        if(Object.keys(change).some(key=>!['id','remove','expectedRow'].includes(key))||typeof change.expectedRow!=='string')fail('清除价格需提供整行版本');
        if(change.expectedRow!==view.rowRevision)fail(`${change.id} 已被其他操作更新；输入已保留`,409);
        delete next[change.id];continue;
      }
      if(Object.keys(change).some(key=>!['id','patch','expected'].includes(key))||!object(change.patch)||!object(change.expected))fail('需逐字段提供价格和原始版本');
      const keys=Object.keys(change.patch);
      if(!keys.length||keys.some(key=>!FIELDS.includes(key))||Object.keys(change.expected).length!==keys.length||keys.some(key=>typeof change.expected[key]!=='string'))fail('只允许输入、输出、缓存三个单价');
      if(keys.some(key=>change.expected[key]!==view.revisions[key]))fail(`${change.id} 单价已被其他操作更新；输入已保留`,409);
      const updated=object(row)?{...row}:{};
      for(const key of keys){const value=change.patch[key];if(value===null)delete updated[key];else{if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail(`${change.id} 单价需为非负数字或 null`);updated[key]=value;}}
      if(!Object.keys(updated).length)delete next[change.id];
      else{if(updated.in==null&&updated.out==null)fail(`${change.id} 至少需要输入或输出单价；清除整行请使用清除自定义价`);next[change.id]=updated;}
    }
    const changed=hash(current)!==hash(next);
    if(changed){config.update({api:{modelPrices:{__replace__:next}}});publish('status',{configUpdated:true,modelPricesUpdated:true});}
    return{ok:true,changed,entries:ids.map(id=>describe(id,mapping(config)[id]))};
  }
  return Object.freeze({get,put});
}
