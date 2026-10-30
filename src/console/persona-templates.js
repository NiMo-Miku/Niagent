import {createHash,randomUUID} from 'node:crypto';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stableId=/^custom_[a-f0-9]{32}$/;
const fields=entry=>({name:String(entry?.name??''),text:String(entry?.text??entry?.roleText??''),customRules:String(entry?.customRules??'')});

// Reads do not migrate config. Legacy records receive content-derived IDs; the
// first successful mutation persists those exact IDs in the same transaction.
// In particular deleting a preceding record cannot retarget an observed ID.
function records(config){
  const source=config.get().customPersonas,seen=new Set(),occurrences=new Map();
  return (Array.isArray(source)?source:[]).map(raw=>{
    const value=fields(raw),fingerprint=digest(value);let occurrence=occurrences.get(fingerprint)||0;
    occurrences.set(fingerprint,occurrence+1);
    let id=stableId.test(raw?.id||'')?raw.id:`custom_${digest([value,occurrence]).slice(0,32)}`;
    while(seen.has(id))id=`custom_${digest([value,++occurrence]).slice(0,32)}`;
    seen.add(id);
    const dto={id,...value,builtin:false,revision:digest([id,value])};
    return{dto,stored:{...(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}),id}};
  });
}

export function createPersonaTemplateController({config,personaText='',publish=()=>{}}){
  const builtinValue={name:'小鲸鱼',text:String(personaText??''),customRules:''};
  const builtin={id:'xiaojingyu',...builtinValue,builtin:true,revision:digest(['xiaojingyu',builtinValue])};
  function list(){
    const templates=[{...builtin},...records(config).map(record=>record.dto)];
    return{templates,revision:digest(templates.map(template=>[template.id,template.revision]))};
  }
  function publishChange(){publish('status',{configUpdated:true,personaTemplatesUpdated:true});}
  function create(body){
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.name!=='string'||typeof body.text!=='string'||(body.customRules!==undefined&&typeof body.customRules!=='string'))fail('人设名称、角色设定和附加规则需为字符串');
    const name=body.name.trim().slice(0,50),text=body.text.trim().slice(0,20000),customRules=(body.customRules||'').trim().slice(0,10000);
    if(!name||!text)fail('人设名称和角色设定都不能为空');
    const current=records(config),ids=new Set(current.map(record=>record.dto.id));let id;
    do{id=`custom_${randomUUID().replaceAll('-','')}`;}while(ids.has(id));
    config.update({customPersonas:[...current.map(record=>record.stored),{id,name,text,customRules}]});
    publishChange();return{ok:true,created:id,...list()};
  }
  function remove(id,body){
    if(id==='xiaojingyu')fail('不能删除出厂人设',403);
    const current=records(config),target=current.find(record=>record.dto.id===id);
    if(!target||typeof body?.expected!=='string'||body.expected!==target.dto.revision)fail('人设已变更或标识已过期，请重新读取后再删除',409);
    config.update({customPersonas:current.filter(record=>record!==target).map(record=>record.stored)});
    publishChange();return{ok:true,removed:true,...list()};
  }
  function update(id,body){
    if(id==='xiaojingyu')fail('出厂人设只读，请添加新的人设',403);
    const current=records(config),target=current.find(record=>record.dto.id===id);
    if(!target||body?.expected!==target.dto.revision)fail('人设已变更，请重新打开后再保存；输入已保留',409);
    if(typeof body.name!=='string'||typeof body.text!=='string'||typeof body.customRules!=='string')fail('人设名称、提示词和附加规则需为字符串');
    const value={name:body.name.trim().slice(0,50),text:body.text.trim().slice(0,20000),customRules:body.customRules.trim().slice(0,10000)};
    if(!value.name||!value.text)fail('人设名称和提示词都不能为空');
    const cfg=config.get(),patch={customPersonas:current.map(record=>record===target?{...record.stored,...value}:record.stored)};
    const matches=entry=>entry?.templateId===id&&entry.roleText===target.dto.text&&(entry.customRules??'')===target.dto.customRules;
    if(matches(cfg.persona))patch.persona={roleText:value.text,customRules:value.customRules,templateName:value.name};
    if(cfg.personaByChat&&typeof cfg.personaByChat==='object'&&!Array.isArray(cfg.personaByChat)){
      let changed=false;const map=Object.fromEntries(Object.entries(cfg.personaByChat).map(([key,entry])=>{if(!matches(entry))return[key,entry];changed=true;return[key,{...entry,roleText:value.text,customRules:value.customRules,templateName:value.name}];}));
      if(changed)patch.personaByChat={__replace__:map};
    }
    config.update(patch);publishChange();return{ok:true,updated:id,...list()};
  }
  return Object.freeze({list,create,update,remove});
}
