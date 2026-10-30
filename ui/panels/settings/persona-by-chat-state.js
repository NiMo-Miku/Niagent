// Independent field drafts never copy the whole personaByChat mapping.
export class PersonaDraft {
  constructor(view){this.baseline=structuredClone(view);this.pending=new Map();this.version=0;this.disposed=false;}
  set(field,value){this.pending.set(field,{value,version:++this.version});}
  value(field){return this.pending.has(field)?this.pending.get(field).value:this.baseline.values[field];}
  chooseTemplate(template){this.set('roleText',template.text);this.set('customRules',template.customRules??'');}
  clear(){for(const field of ['roleText','participation','customRules','systemPromptOverride'])this.set(field,'');}
  snapshot(){
    const fields=new Map([...this.pending].map(([key,value])=>[key,structuredClone(value)]));
    return{fields,body:{storageKey:this.baseline.storageKey,sourceGuard:this.baseline.sourceGuard,patch:Object.fromEntries([...fields].map(([field,entry])=>[field,entry.value])),expected:Object.fromEntries([...fields].map(([field])=>[field,this.baseline.revisions[field]])),...(this.baseline.scope==='legacy-shared'?{shared:true}:{})}};
  }
  accept(snapshot,receipt){
    if(this.disposed)return;
    if(receipt.storageKey!==this.baseline.storageKey||receipt.sourceGuard!==this.baseline.sourceGuard)throw new Error('An acknowledgement cannot retarget a draft');
    for(const [field,entry] of snapshot.fields){
      // Advance only this receipt's fields. A later edit remains dirty against
      // the confirmed own-write baseline; untouched dirty fields stay stale.
      this.baseline.values[field]=receipt.values[field];this.baseline.revisions[field]=receipt.revisions[field];
      if(this.pending.get(field)?.version===entry.version)this.pending.delete(field);
    }
    this.baseline.active=receipt.active;this.baseline.effective=structuredClone(receipt.effective);
  }
  resolve(field,latest,keepDraft){
    if(this.disposed||latest.storageKey!==this.baseline.storageKey||latest.sourceGuard!==this.baseline.sourceGuard)throw new Error('来源已变化，请明确打开新来源');
    this.baseline.values[field]=latest.values[field];this.baseline.revisions[field]=latest.revisions[field];
    if(!keepDraft)this.pending.delete(field);
  }
  dispose(){this.disposed=true;}
}
