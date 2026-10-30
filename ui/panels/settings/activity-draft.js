const maps=new Set(['store.groupSliderPos','store.groupPeakPos']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Overlay only edited group keys on the latest view; clearing one override
// must not replace another group's newer data.
function overlay(base,value,latest){
  const next=structuredClone(latest||{});
  for(const key of new Set([...Object.keys(base||{}),...Object.keys(value||{})])){
    if(equal(base?.[key],value?.[key]))continue;
    if(Object.hasOwn(value||{},key))next[key]=structuredClone(value[key]);else delete next[key];
  }
  return next;
}
export class ActivityDraft {
  constructor(read){this.read=read;this.pending=new Map();this.active=new Map();this.version=0;this.submitting=null;}
  get dirty(){return this.pending.size>0;}
  value(path){return structuredClone(this.pending.has(path)?this.pending.get(path).value:this.read(path));}
  set(path,value){
    const base=this.pending.has(path)?this.pending.get(path).base:structuredClone(this.read(path));++this.version;
    if(equal(base,value)&&!this.active.has(path))this.pending.delete(path);else this.pending.set(path,{base,value:structuredClone(value),version:this.version});
  }
  snapshot(){return new Map([...this.pending].map(([path,entry])=>[path,structuredClone(entry)]));}
  beginCommit(){this.active=this.snapshot();return this.active;}
  reject(){this.active=new Map();}
  changes(sent){return [...sent].map(([path,entry])=>({path,value:maps.has(path)?overlay(entry.base,entry.value,this.read(path)):entry.value,replace:maps.has(path)}));}
  accept(sent){
    this.active=new Map();
    for(const[path,entry]of sent){const current=this.pending.get(path);if(!current)continue;
      if(current.version===entry.version){this.pending.delete(path);continue;}
      const base=structuredClone(this.read(path)),value=maps.has(path)?overlay(entry.value,current.value,base):current.value;
      if(equal(base,value))this.pending.delete(path);else this.pending.set(path,{...current,base,value});
    }
  }
  discard(sent=this.snapshot()){for(const[path,entry]of sent)if(this.pending.get(path)?.version===entry.version)this.pending.delete(path);++this.version;}
}
