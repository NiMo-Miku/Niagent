// Field-scoped persona transactions over the latest persisted mapping.
import {createHash} from 'node:crypto';
import {personaForChat} from '../kernel/persona.js';
const FIELDS=['roleText','participation','customRules','systemPromptOverride'];
const CHAT=/^(group|private):([1-9]\d{0,14})$/;
const UID=/^[1-9]\d{0,14}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value??{},key);
const hash=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const slot=(entry,field)=>object(entry)&&own(entry,field)?[true,entry[field]]:[false];
const effectiveField=(entry,field)=>field==='participation'?['low','medium','high'].includes(entry?.[field]):typeof entry?.[field]==='string'&&Boolean(entry[field].trim());
const projection=persona=>Object.fromEntries(FIELDS.map(field=>[field,persona?.[field]]));
function mapOf(config){const value=config.personaByChat;if(value==null)return{};if(!object(value))fail('分会话映射格式无效，需先修复原始配置');return value;}
function identify(chatKey){const match=CHAT.exec(chatKey);if(!match)fail('会话标识须为 group:数字 或 private:数字');return{chatKey,kind:match[1],id:match[2]};}
function normalized(field,value){
  if(value===null)return undefined;
  if(typeof value!=='string')fail(`${field} 必须为字符串或 null`);
  if(!value.trim())return undefined;
  if(field==='participation'){if(!['low','medium','high'].includes(value))fail('参与程度仅允许 low/medium/high 或空白继承');return value;}
  const maximum=field==='customRules'?10000:20000;if(value.length>maximum)fail(`${field} 超过 ${maximum} 字`);
  return value.trim();
}

export function createPersonaByChatController({config,store,resolvePersona,getTemplates=()=>({templates:[]}),publish=()=>{}}){
  if(typeof resolvePersona!=='function')throw new TypeError('Must pass the selected core.prompt.persona');
  function describe(chatKey,requestedKey){
    const info=identify(chatKey),c=config.get(),map=mapOf(c),bareSelected=map[info.id]!==null&&map[info.id]!==undefined;
    const selectedKey=bareSelected?info.id:chatKey,key=requestedKey??selectedKey;
    if(key!==chatKey&&key!==info.id)fail('不能从一个会话修改另一个会话的存档');
    if(key===info.id&&!bareSelected)fail('旧共享来源已移除，请重新读取',409);
    const entry=map[key],isObject=object(entry),active=c.personaUnified===false,defaultPolicy=resolvePersona===personaForChat;
    const revisions=Object.fromEntries(FIELDS.map(field=>[field,hash(slot(entry,field))]));
    const values=Object.fromEntries(FIELDS.map(field=>[field,effectiveField(entry,field)?(field==='participation'?entry[field]:entry[field].trim()):'']));
    const effective=projection(resolvePersona(c,chatKey));
    return{
      chatKey,storageKey:key,scope:key===info.id?'legacy-shared':'chat',active,
      source:{policy:defaultPolicy?'default':'custom',selectedStorageKey:selectedKey,effectiveStorageKey:defaultPolicy&&active&&map[selectedKey]!=null?selectedKey:null,global:defaultPolicy?(!active||map[selectedKey]==null):null,legacyShared:bareSelected},
      // Changes of fields/container creation at this same target do not block
      // disjoint merges. Creation/removal of a non-nullish bare selector does.
      sourceGuard:hash([chatKey,key,bareSelected]),
      values,revisions,effective,global:projection(c.persona),
      templateId:typeof entry?.templateId==='string'?entry.templateId:null,templateName:typeof entry?.templateName==='string'?entry.templateName:'',selectionRevision:hash([slot(entry,'templateId'),slot(entry,'templateName')]),
      overriddenFields:FIELDS.filter(field=>isObject&&effectiveField(entry,field)),
      shadowed:key===chatKey&&bareSelected,
      hiddenQualified:bareSelected&&map[chatKey]!=null?{storageKey:chatKey,values:projection(map[chatKey])}:null,
      malformedEntry:entry!=null&&!isObject,
      inheritedFields:defaultPolicy?FIELDS.filter(field=>!active||key!==selectedKey||!effectiveField(entry,field)):null,
      sharedImpact:key===info.id?[`group:${info.id}`,`private:${info.id}`]:[],
    };
  }
  function list(){
    const c=config.get(),map=mapOf(c),keys=new Set(),archived=store?.listChats?.()??[];
    for(const [kind,ids] of [['group',c.allow?.groups],['private',c.allow?.private]])for(const id of Array.isArray(ids)?ids:[])if(UID.test(String(id)))keys.add(`${kind}:${id}`);
    for(const chat of archived)if(CHAT.test(chat.chatKey??chat.key??''))keys.add(chat.chatKey??chat.key);
    for(const key of Object.keys(map))if(CHAT.test(key))keys.add(key);
    const chats=[...keys].sort().map(chatKey=>({...describe(chatKey),title:`${chatKey.startsWith('group:')?'群':'私聊'} ${chatKey.split(':')[1]}`}));
    const legacy=Object.keys(map).filter(key=>UID.test(key)&&map[key]!=null).sort().map(id=>({storageKey:id,title:`旧共享 ${id}`,sharedImpact:[`group:${id}`,`private:${id}`],associated:chats.filter(value=>value.chatKey.endsWith(`:${id}`)).map(value=>value.chatKey)}));
    return{active:c.personaUnified===false,chats,legacy};
  }
  function put(chatKey,body){
    identify(chatKey);
    if(!object(body)||Object.keys(body).some(key=>!['storageKey','sourceGuard','patch','expected','shared','selection'].includes(key))||typeof body.storageKey!=='string'||typeof body.sourceGuard!=='string'||!object(body.patch)||!object(body.expected)||(own(body,'shared')&&typeof body.shared!=='boolean'))fail('需提供明确来源和字段版本');
    const fields=Object.keys(body.patch);
    if(!fields.length||fields.some(field=>!FIELDS.includes(field))||Object.keys(body.expected).length!==fields.length||fields.some(field=>typeof body.expected[field]!=='string'))fail('只允许提交四个风格字段，并逐字段提供原始版本');
    // Source checking precedes every mutation. No fallback or retarget occurs.
    const current=describe(chatKey,body.storageKey);
    if(current.sourceGuard!==body.sourceGuard)fail('实际人设来源已变化，请重新读取；输入已保留',409);
    if(current.scope==='legacy-shared'&&body.shared!==true)fail('需明确使用“保存旧共享人设”，它同时影响同号群聊和私聊');
    const conflicts=fields.filter(field=>body.expected[field]!==current.revisions[field]);
    if(conflicts.length)fail(`字段已被其他操作更新：${conflicts.join('、')}；输入已保留`,409);
    let selected;
    if(own(body,'selection')){
      const selection=body.selection;
      if(!object(selection)||selection.expected!==current.selectionRevision||fields.length!==FIELDS.length)fail('人设选择已变化，请重新打开后选择',409);
      if(selection.id!==null){selected=getTemplates().templates.find(item=>item.id===selection.id);if(!selected||selected.revision!==selection.revision)fail('所选人设已变更，请重新打开后选择',409);}
      const desired={roleText:selected?.text??'',customRules:selected?.customRules??'',participation:'',systemPromptOverride:''};
      if(FIELDS.some(field=>body.patch[field]!==desired[field]))fail('所选人设与提交内容不一致');
    }
    const c=config.get(),map=mapOf(c),entry=object(map[body.storageKey])?{...map[body.storageKey]}:{};
    for(const field of fields){const value=normalized(field,body.patch[field]);if(value===undefined)delete entry[field];else entry[field]=value;}
    if(own(body,'selection')){if(selected){entry.templateId=selected.id;entry.templateName=selected.name;}else{delete entry.templateId;delete entry.templateName;}}
    else if(fields.some(field=>body.patch[field]!==current.values[field])){delete entry.templateId;delete entry.templateName;}
    const removeEmptyQualified=current.scope==='chat'&&!Object.keys(entry).length;
    const unchanged=hash(map[body.storageKey])===hash(removeEmptyQualified?undefined:entry);
    if(!unchanged){
      // A bare {} sentinel prevents hidden qualified entries from reactivating.
      // An empty qualified record can be removed: no different storage key can
      // become active by that deletion. Unknown metadata is never discarded.
      const next={...map};if(removeEmptyQualified)delete next[body.storageKey];else next[body.storageKey]=entry;
      config.update({personaByChat:{__replace__:next}});
      publish('status',{configUpdated:true,personaByChatUpdated:true});
    }
    return{ok:true,changed:!unchanged,committedFields:fields,...describe(chatKey,body.storageKey)};
  }
  return Object.freeze({list,get:describe,put});
}
