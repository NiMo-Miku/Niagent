import {createHash} from 'node:crypto';
const FIELDS=['start','end','peak','valley'], object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value??{},key),clone=value=>structuredClone(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const slot=(row,key)=>object(row)&&own(row,key)?[true,row[key]]:[false];
export function parsePeakTime(value){if(typeof value!=='string')return null;const match=/^(\d{1,2}):(\d{2})$/.exec(value.trim());if(!match||+match[1]>23||+match[2]>59)return null;return{text:`${match[1].padStart(2,'0')}:${match[2]}`,minutes:+match[1]*60 + +match[2]};}
export function normalizePeakFields(value){
  const start=parsePeakTime(value.start),end=parsePeakTime(value.end);if(!start||!end)fail('高峰时段需为合法 HH:MM，支持跨零点');
  const next={start:start.text,end:end.text};for(const field of ['peak','valley']){const number=value[field];if(typeof number!=='number'||!Number.isFinite(number)||number<0||number>100)fail('峰谷滑条需为 0~100 的数字');next[field]=number;}return next;
}
function targetId(target){if(target==='global')return null;const match=/^group:([1-9]\d{0,14})$/.exec(target??'');if(!match)fail('编辑目标需为 global 或 group:数字');return match[1];}
function read(config,target){
  const id=targetId(target),store=config.get().store??{},ps=store.peakSchedule??{},row=id?store.groupPeakPos?.[id]:null;
  const global={enabled:ps.enabled===true,start:ps.peak?.start??'',end:ps.peak?.end??'',peak:ps.peak?.sliderPos??10,valley:ps.valley?.sliderPos??100};
  const active={values:{...global},revisions:{enabled:hash(slot(ps,'enabled')),start:hash(slot(ps.peak,'start')),end:hash(slot(ps.peak,'end')),peak:hash(slot(ps.peak,'sliderPos')),valley:hash(slot(ps.valley,'sliderPos'))}};
  if(id)for(const field of ['peak','valley']){active.values[field]=object(row)?row[field]??row[`${field}Pos`]??null:null;active.revisions[field]=hash([slot(row,field),slot(row,`${field}Pos`)]);}
  const cu=ps.custom,custom={values:{start:cu?.peak?.start??'',end:cu?.peak?.end??'',peak:cu?.peak?.sliderPos??null,valley:cu?.valley?.sliderPos??null},revisions:{start:hash(slot(cu?.peak,'start')),end:hash(slot(cu?.peak,'end')),peak:hash(slot(cu?.peak,'sliderPos')),valley:hash(slot(cu?.valley,'sliderPos'))}};
  const groups=[...new Set([...(Array.isArray(config.get().allow?.groups)?config.get().allow.groups:[]),...Object.keys(store.groupPeakPos??{})])].map(String).filter(id=>/^[1-9]\d{0,14}$/.test(id)).sort();
  return{target,active,custom,global,groups};
}
// Shared times and target-specific points commit together, synchronously over
// the latest map. Saving the custom slot never changes an active field.
export function createPeakScheduleController({config,publish=()=>{}}){
  function get(target='global'){return read(config,target);}
  function put(body){
    if(!object(body)||Object.keys(body).some(key=>!['target','kind','patch','expected'].includes(key))||!['active','custom'].includes(body.kind)||!object(body.patch)||!object(body.expected))fail('需提供峰谷目标、字段和原始版本');
    const id=targetId(body.target),view=get(body.target),keys=Object.keys(body.patch),allowed=body.kind==='active'&&!id?['enabled',...FIELDS]:FIELDS;
    if(!keys.length||keys.some(key=>!allowed.includes(key))||Object.keys(body.expected).length!==keys.length||keys.some(key=>typeof body.expected[key]!=='string'))fail('峰谷字段或原始版本无效');
    if(keys.some(key=>body.expected[key]!==view[body.kind].revisions[key]))fail('峰谷字段已被其他操作更新；草稿已保留，请对比后再保存',409);
    const merged={...view[body.kind].values,...body.patch};
    if(keys.some(key=>body.patch[key]===null&&!(body.kind==='active'&&id&&['peak','valley'].includes(key))))fail('只有分群峰谷点允许 null 跟随全局');
    if(own(body.patch,'enabled')&&typeof body.patch.enabled!=='boolean')fail('启用值需为布尔值');
    // Existing invalid historical times must never prevent turning the feature
    // off or clearing a group override. Validate time when it is being changed,
    // saved as a preset, or explicitly enabled.
    const needsTime=body.kind==='custom'||keys.includes('start')||keys.includes('end')||body.patch.enabled===true;
    const candidate={...merged,peak:merged.peak??view.global.peak,valley:merged.valley??view.global.valley};
    const normalized=normalizePeakFields(needsTime?candidate:{...candidate,start:'00:00',end:'00:00'});
    const cfg=config.get(),store=cfg.store??{},ps=clone(store.peakSchedule??{}),patch={};
    if(body.kind==='custom'){
      const cu=clone(ps.custom??{});for(const key of keys){const part=key==='valley'?'valley':'peak',field=['peak','valley'].includes(key)?'sliderPos':key;cu[part]??={};cu[part][field]=normalized[key];}ps.custom=cu;patch.peakSchedule=ps;
    }else{
      for(const key of keys){
        if(key==='enabled')ps.enabled=body.patch.enabled;
        else if(!id||key==='start'||key==='end'){const part=key==='valley'?'valley':'peak',field=['peak','valley'].includes(key)?'sliderPos':key;ps[part]??={};ps[part][field]=normalized[key];}
      }
      if(keys.some(key=>key==='enabled'||key==='start'||key==='end'||!id))patch.peakSchedule=ps;
      if(id&&keys.some(key=>key==='peak'||key==='valley')){
        const map=store.groupPeakPos??{};if(!object(map))fail('分群峰谷映射格式无效');const row=object(map[id])?{...map[id]}:{};
        for(const key of ['peak','valley'])if(own(body.patch,key)){if(body.patch[key]===null)delete row[key];else row[key]=normalized[key];delete row[`${key}Pos`];}
        const next={...map};if(Object.keys(row).length)next[id]=row;else delete next[id];patch.groupPeakPos={__replace__:next};
      }
    }
    const before=hash([store.peakSchedule,store.groupPeakPos]);
    const same=Object.entries(patch).every(([key,value])=>hash(store[key])===hash(value?.__replace__??value));
    if(!same){config.update({store:patch});publish('status',{configUpdated:true,peakScheduleUpdated:true});}
    return{ok:true,changed:before!==hash([config.get().store?.peakSchedule,config.get().store?.groupPeakPos]),committedFields:keys,...get(body.target)};
  }
  return Object.freeze({get,put});
}
