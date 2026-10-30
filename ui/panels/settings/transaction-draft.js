// JSON-only field drafts. A successful own receipt advances only its submitted
// fields; later input and stale unrelated fields retain their own baselines.
export class TransactionDraft {
  constructor(view){this.base=structuredClone(view);this.pending=new Map();this.version=0;}
  value(field){return this.pending.has(field)?this.pending.get(field).value:this.base.values[field];}
  set(field,value){if(Object.is(value,this.base.values[field]))this.pending.delete(field);else this.pending.set(field,{value,version:++this.version});}
  snapshot(convert=value=>value){const fields=new Map([...this.pending].map(([key,value])=>[key,structuredClone(value)]));return{fields,patch:Object.fromEntries([...fields].map(([key,entry])=>[key,convert(entry.value,key)])),expected:Object.fromEntries([...fields].map(([key])=>[key,this.base.revisions[key]]))};}
  accept(sent,view){for(const[field,entry]of sent.fields){this.base.values[field]=view.values[field];this.base.revisions[field]=view.revisions[field];if(this.pending.get(field)?.version===entry.version)this.pending.delete(field);}}
  resolve(field,view,keep){this.base.values[field]=view.values[field];this.base.revisions[field]=view.revisions[field];if(!keep)this.pending.delete(field);}
  pack(){return{base:structuredClone(this.base),pending:[...this.pending].map(([field,entry])=>[field,entry.value,entry.version]),version:this.version};}
  static restore(value){if(!value?.base?.values||!value.base.revisions||!Array.isArray(value.pending))throw Error('草稿格式无效');const draft=new TransactionDraft(value.base);draft.version=value.version||0;for(const[field,item,version]of value.pending)draft.pending.set(field,{value:item,version});return draft;}
}
export function withinDraftBudget(value,maximum){
  let count=0;const seen=new Set();
  function valid(item,depth){
    // The host adds one envelope level around this own-scope snapshot.
    if(++count>900||depth>5)return false;
    if(item===null||typeof item==='boolean')return true;
    if(typeof item==='number')return Number.isFinite(item);
    if(typeof item==='string')return item.length<=256;
    if(!item||typeof item!=='object'||seen.has(item))return false;
    seen.add(item);const keys=Object.keys(item);if(keys.length>(Array.isArray(item)?128:64))return false;
    const result=keys.every(key=>!['__proto__','prototype','constructor'].includes(key)&&valid(item[key],depth+1));seen.delete(item);return result;
  }
  return valid(value,0)&&new TextEncoder().encode(JSON.stringify(value)).length<=maximum;
}
export function packFields(draft,fields){return{values:fields.map(key=>draft.base.values[key]),revisions:fields.map(key=>draft.base.revisions[key]),pending:[...draft.pending].map(([key,entry])=>[key,entry.value,entry.version]),version:draft.version};}
export function restoreFields(value,fields){return TransactionDraft.restore({base:{values:Object.fromEntries(fields.map((key,index)=>[key,value.values[index]])),revisions:Object.fromEntries(fields.map((key,index)=>[key,value.revisions[index]]))},pending:value.pending,version:value.version});}
