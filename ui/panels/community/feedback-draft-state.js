// Form data and acknowledged local persistence are separate. A conflict never
// adopts another writer's revision; only an explicit comparison decision can.
const empty=()=>({nickname:'',text:'',images:[]});
const copy=value=>({nickname:value.nickname,text:value.text,images:[...value.images]});
const signature=value=>JSON.stringify(value);
function receipt(value){
  if(value?.ok!==true||!/^[a-f0-9]{32}$/.test(value.revision??'')||typeof value.draft?.nickname!=='string'||typeof value.draft?.text!=='string'||!Array.isArray(value.draft?.images)||value.draft.images.some(image=>typeof image!=='string'))throw Error('未能确认本机草稿保存结果');
  return{revision:value.revision,draft:copy(value.draft),saved:value.saved===true};
}
export class FeedbackDraft {
  constructor(request){this.request=request;this.value=empty();this.baseline=null;this.edits=0;this.touched=new Set();this.loading=null;this.pending=Promise.resolve();this.conflict=false;this.disposed=false;}
  get dirty(){return this.baseline?signature(this.value)!==signature(this.baseline.draft):this.edits>0;}
  update(patch){if(this.disposed)return;const next=copy({...this.value,...patch});if(signature(next)===signature(this.value))return;for(const key of Object.keys(patch))if(JSON.stringify(next[key])!==JSON.stringify(this.value[key]))this.touched.add(key);this.value=next;this.edits++;}
  async load(){
    if(this.disposed)throw Error('反馈编辑已结束');
    if(this.baseline)return this.baseline;
    if(!this.loading){
      this.loading=Promise.resolve().then(()=>this.request('GET','/api/community/feedback-draft')).then(value=>{
        const current=receipt(value);if(this.disposed)return null;
        this.baseline=current;this.value=copy(Object.fromEntries(['nickname','text','images'].map(key=>[key,this.touched.has(key)?this.value[key]:current.draft[key]])));return current;
      }).finally(()=>{this.loading=null;});
    }
    return this.loading;
  }
  serialize(action){const run=this.pending.then(action,action);this.pending=run.catch(()=>{});return run;}
  flush(){return this.serialize(async()=>{
    await this.load();
    if(this.disposed)return null;
    if(this.conflict)throw Object.assign(Error('本机草稿已被其他窗口更新；输入已保留，请先对比已保存草稿'),{status:409});
    while(this.dirty&&!this.disposed){
      const snapshot=copy(this.value),expected=this.baseline.revision;
      try{
        const saved=receipt(await this.request('PUT','/api/community/feedback-draft',{expected,draft:snapshot}));
        if(this.disposed)return null;
        if(signature(saved.draft)!==signature(snapshot))throw Error('未能确认已保存的草稿内容；当前输入仍保留');
        this.baseline=saved;
      }catch(error){if(error.status===409||error.data?.httpStatus===409)this.conflict=true;throw error;}
    }
    return this.ticket();
  });}
  ticket(){return this.baseline&&!this.dirty?{revision:this.baseline.revision,signature:signature(this.value)}:null;}
  async compare(){return receipt(await this.request('GET','/api/community/feedback-draft'));}
  resolve(comparison,useSaved){
    if(this.disposed)return;
    const current=receipt({ok:true,...comparison});this.baseline=current;this.conflict=false;
    if(useSaved){this.value=copy(current.draft);this.edits++;}
  }
  async clear(ticket){
    if(this.disposed||!ticket||this.baseline?.revision!==ticket.revision||signature(this.value)!==ticket.signature)return{cleared:false};
    const edit=this.edits;
    try{
      const cleared=receipt(await this.request('DELETE','/api/community/feedback-draft',{expected:ticket.revision}));
      if(this.disposed)return{cleared:false};
      this.baseline=cleared;
      if(this.edits===edit&&signature(this.value)===ticket.signature)this.value=empty();
      return{cleared:this.edits===edit};
    }catch(error){if(error.status===409||error.data?.httpStatus===409)this.conflict=true;throw error;}
  }
  clearPublished(ticket){return this.serialize(()=>this.clear(ticket));}
  discard(){const edit=this.edits,value=signature(this.value);return this.serialize(async()=>{await this.load();if(this.edits!==edit)return{cleared:false};return this.clear({revision:this.baseline.revision,signature:value});});}
  dispose(){this.disposed=true;}
}
