const valid=/^\d{1,15}$/;
const key=(scope,groupId,uid)=>`${scope}:${scope==='global'?'':groupId??''}:${uid}`;
export function createBlocklistState(){
  const rows=new Map();let data=null,sequence=0,active=null,notice='';
  function incoming(scope,groupId,uid,payload=data){
    if(scope==='global'){const global=payload?.global,member=global?.membership?.entries?.find(item=>item.uid===uid);return{blocked:global?.ids?.includes(uid)??false,revision:member?.revision??global?.membership?.empty,source:global?.membership?.source};}
    const group=payload?.groups?.find(item=>item.groupId===groupId);return{blocked:group?.ids?.includes(uid)??false,revision:group?.revisions?.[uid]??payload?.emptyRevision};
  }
  function dirty(row){return row.value!==row.base.blocked||row.value===row.sentValue&&(row.localPending||row.remotePending);}
  function ensure(scope,groupId,uid){const id=key(scope,groupId,uid);if(!rows.has(id)){const base=incoming(scope,groupId,uid);rows.set(id,{scope,groupId:scope==='global'?undefined:groupId,uid,base,value:base.blocked,localPending:false,remotePending:false});}return rows.get(id);}
  return{
    read(payload){data=payload;for(const row of rows.values())if(!dirty(row)){row.base=incoming(row.scope,row.groupId,row.uid);row.value=row.base.blocked;}return this.view();},
    view(){return{data,notice,saving:!!active,rows:[...rows.values()].map(row=>({...row,base:{...row.base},localPending:row.localPending&&row.value===row.sentValue,remotePending:row.remotePending&&row.value===row.sentValue,dirty:dirty(row)})),pending:[...rows.values()].filter(dirty).length};},
    value(scope,groupId,uid){return ensure(scope,groupId,uid).value;},
    choose(scope,groupId,uid,value){if(!valid.test(uid)||typeof value!=='boolean')return false;const row=ensure(scope,groupId,uid);row.value=value;row.conflict=null;notice='';return true;},
    begin(){if(active)return null;const pending=[...rows.values()].filter(dirty);if(!pending.length)return{noop:true};active={id:++sequence,rows:pending.map(row=>({scope:row.scope,groupId:row.groupId,uid:row.uid,blocked:row.value,expected:row.base.revision,source:row.base.source}))};notice='';return structuredClone(active);},
    accept(sent,scope,groupId,changes,receipt){if(!active||active.id!==sent.id)return false;for(const change of changes){const row=rows.get(key(scope,groupId,change.uid)),own=receipt?.receipts?.find(item=>item.uid===change.uid);if(!row||!own||typeof own.revision!=='string'||typeof own.blocked!=='boolean')continue;const next={blocked:own.blocked,revision:own.revision,...(scope==='global'?{source:receipt.membership?.source??change.source}:{})};if(own.local==='conflict'){row.conflict=next;continue;}row.base=next;row.sentValue=change.blocked;row.localPending=own.local!=='applied';row.remotePending=scope==='global'&&own.remote!=='confirmed';row.conflict=null;}return true;},
    finish(sent,message=''){if(active?.id===sent.id){active=null;notice=message;}},
    conflict(changes,payload,scope,groupId){for(const change of changes){const row=ensure(scope,groupId,change.uid);row.conflict=incoming(scope,groupId,change.uid,payload);}},
    resolve(scope,groupId,uid,keepMine){const row=ensure(scope,groupId,uid);if(!row.conflict?.revision)return false;row.base={...row.conflict};if(!keepMine)row.value=row.base.blocked;row.conflict=null;row.localPending=false;row.remotePending=false;return true;},
    candidates(groupId,members=[]){const found=new Map(members.map(item=>{const uid=String(item.userId??item.user_id??item.id??'');return[uid,{uid,nickname:String(item.nickname??''),card:String(item.card??'')}];}).filter(([uid])=>valid.test(uid)));for(const uid of new Set([...(data?.groups?.find(item=>item.groupId===groupId)?.ids??[]),...(data?.global?.ids??[]),...[...rows.values()].filter(row=>row.scope==='global'?(dirty(row)||row.value||row.base.blocked):row.groupId===groupId).map(row=>row.uid)]))if(!found.has(uid))found.set(uid,{uid,nickname:'',card:'',offline:true});return[...found.values()];},
  };
}
