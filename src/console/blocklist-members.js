import {createHash} from 'node:crypto';
const UID=/^\d{1,15}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const ids=value=>[...new Set((Array.isArray(value)?value:[]).map(String).filter(id=>UID.test(id)))];
const revision=blocked=>createHash('sha256').update(JSON.stringify(blocked)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const groupView=(groupId,values)=>{const members=ids(values);return{groupId,ids:members,revisions:Object.fromEntries(members.map(uid=>[uid,revision(true)]))};};

// Local membership edits are synchronous config transactions. Global edits are
// owned by the selected community service, including its concurrency contract.
export function createBlocklistMemberController({config,communityClient,resolveCommunity=()=>communityClient,selfId=()=>'',publish=()=>{}}){
  async function get(){
    const cfg=config.get();let global;
    try{const selected=resolveCommunity();if(typeof selected?.getBlocklist!=='function')throw Error('社区屏蔽能力未就绪');global=await selected.getBlocklist();}
    catch(error){global={ok:false,unavailable:true,error:String(error?.message??error),ids:[]};}
    return{groups:Object.entries(object(cfg.blocklist)?cfg.blocklist:{}).filter(([id])=>UID.test(id)).map(([id,values])=>groupView(id,values)),emptyRevision:revision(false),selfId:String(await selfId()??''),global};
  }
  function put(body){
    if(!object(body)||!['group','global'].includes(body.scope)||!Array.isArray(body.changes)||!body.changes.length||body.changes.length>64)fail('需提供 1~64 项逐成员屏蔽变更');
    const allowed=body.scope==='group'?['scope','groupId','changes']:['scope','source','changes'];
    if(Object.keys(body).some(key=>!allowed.includes(key)))fail('屏蔽变更字段无效');
    const seen=new Set();
    for(const item of body.changes){if(!object(item)||Object.keys(item).some(key=>!['uid','blocked','expected'].includes(key))||typeof item.uid!=='string'||!UID.test(item.uid)||typeof item.blocked!=='boolean'||typeof item.expected!=='string'||seen.has(item.uid))fail('需提供不同数字 QQ 号、屏蔽值和原版本');seen.add(item.uid);}
    if(body.scope==='global'){
      if(typeof body.source!=='string'||!body.source)fail('需提供全局名单来源版本');
      return (async()=>{
        const selected=resolveCommunity();
        if(typeof selected?.getBlocklist!=='function'||typeof selected?.updateBlocklist!=='function')fail('社区屏蔽能力未就绪；本机群屏蔽仍可保存',503);
        const current=await selected.getBlocklist();
        if(!current?.membership?.source)fail('所选社区客户端没有逐成员版本合同；请使用原社区名单入口',503);
        if(current.membership.source!==body.source)fail('全局名单来源已改变；草稿保留，请比较后重试',409);
        if(resolveCommunity()!==selected)fail('读取期间全局名单来源已改变；草稿保留，请比较后重试',409);
        const result=await selected.updateBlocklist({source:body.source,changes:body.changes});
        if(result?.receipts?.some(item=>item.local==='applied'))publish('status',{communityBlocklistUpdated:true});
        return result;
      })();
    }
    if(typeof body.groupId!=='string'||!UID.test(body.groupId))fail('群号必须为数字');
    const cfg=config.get();
    if(cfg.blocklist!==undefined&&!object(cfg.blocklist))fail('群屏蔽映射结构异常，请使用高级编辑；没有修改历史数据');
    const mapping=cfg.blocklist??{},original=mapping[body.groupId];
    if(Object.hasOwn(mapping,body.groupId)&&!Array.isArray(original))fail('当前群屏蔽结构异常，请使用高级编辑；没有修改历史数据');
    const selected=new Set(ids(original));let members=[...(original??[])];
    for(const item of body.changes)if(item.expected!==revision(selected.has(item.uid)))fail(`${item.uid} 在群 ${body.groupId} 的屏蔽已被其它操作修改；草稿保留`,409);
    for(const item of body.changes){
      if(item.blocked){if(!selected.has(item.uid))members.push(item.uid);}
      else{
        if(members.some(value=>String(value)===item.uid&&!['string','number'].includes(typeof value)))fail(`${item.uid} 由异常历史条目表示；请使用高级编辑，原条目未修改`);
        members=members.filter(value=>String(value)!==item.uid);
      }
    }
    const next={...mapping};if(members.length)next[body.groupId]=members;else delete next[body.groupId];
    const after=new Set(ids(members));
    const changed=JSON.stringify(mapping)!==JSON.stringify(next);
    if(changed){const patch={blocklist:{__replace__:next}};if(typeof config.updateRawFields==='function')config.updateRawFields(patch);else config.update(patch);publish('status',{configUpdated:true,memberBlocklistUpdated:true});}
    return{ok:true,changed,group:groupView(body.groupId,next[body.groupId]),receipts:body.changes.map(item=>({uid:item.uid,blocked:after.has(item.uid),revision:revision(after.has(item.uid)),local:'applied'}))};
  }
  return Object.freeze({get,put});
}
