// One typed local resource. It never receives a filename, owner or storage key
// from a panel, and it never publishes or uploads feedback.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const BUDGET=2*1024*1024-64*1024;
const REVISION=/^[a-f0-9]{32}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,status=400,cause)=>{throw Object.assign(new Error(message,{cause}),{status,expose:true});};
const empty=()=>({nickname:'',text:'',images:[]});
const revision=()=>randomUUID().replaceAll('-','');
function exact(value,keys){return object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function typedDraft(value){
  if(!exact(value,['nickname','text','images'])||typeof value.nickname!=='string'||value.nickname.length>32||typeof value.text!=='string'||value.text.length>5000||!Array.isArray(value.images)||value.images.length>9)fail('草稿需包含昵称（最多32字）、正文（最多5000字）和最多9张截图');
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>BUDGET)fail('草稿超过2MB，请减少截图后重试',413);
  for(const image of value.images){
    const match=typeof image==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if(!match||match[2].length%4!==0)fail('草稿截图须为PNG、JPEG、WebP或GIF的base64数据');
    const bytes=Buffer.from(match[2],'base64');
    const format=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='gif'?/^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii')):bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
    if(bytes.toString('base64')!==match[2]||!format)fail('草稿截图格式与声明的图片类型不一致');
  }
  return{nickname:value.nickname,text:value.text,images:[...value.images]};
}

export function createFeedbackDraftController({dataDir,lifecycle,publish=()=>{}}={}){
  const file=typeof dataDir==='string'&&path.isAbsolute(dataDir)?path.join(dataDir,'feedback-draft.json'):null,initialRevision=revision();
  const active=()=>{if(!file)fail('当前环境未提供本机草稿目录',503);if(lifecycle?.signal?.aborted)fail('当前实例已停止，草稿未写入',503);};
  function read(){
    active();
    try{
      let stat;
      try{stat=fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')return{version:1,revision:initialRevision,draft:null};throw error;}
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>BUDGET+1024)throw Error('Invalid draft file');
      const stored=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!exact(stored,['version','revision','draft'])||stored.version!==1||!REVISION.test(stored.revision))throw Error('Invalid draft envelope');
      return{version:1,revision:stored.revision,draft:stored.draft===null?null:typedDraft(stored.draft)};
    }catch(error){fail('本机草稿无法读取，未修改原文件',500,error);}
  }
  const receipt=stored=>({ok:true,revision:stored.revision,draft:stored.draft===null?empty():{...stored.draft,images:[...stored.draft.images]},saved:stored.draft!==null});
  function expected(body,keys){
    active();
    if(!exact(body,keys)||typeof body.expected!=='string'||!REVISION.test(body.expected))fail('保存草稿需提供读取时的明确版本');
    const current=read();
    if(body.expected!==current.revision)fail('本机草稿已被其他窗口更新；当前输入已保留，请对比后再决定',409);
    return current;
  }
  function commit(draft){
    active();const stored={version:1,revision:revision(),draft},tmp=`${file}.${process.pid}.${revision()}.tmp`;
    try{
      fs.mkdirSync(dataDir,{recursive:true});
      fs.writeFileSync(tmp,JSON.stringify(stored),{encoding:'utf8',flag:'wx',mode:0o600});
      active();fs.renameSync(tmp,file);
    }catch(error){
      try{fs.unlinkSync(tmp);}catch{}
      if(error.status===503)throw error;
      fail('草稿未能保存到本机；当前内容仍保留，请重试',500,error);
    }
    // Notification failure must not turn an acknowledged disk commit into an
    // apparent failed write. No private draft text or screenshots enter SSE.
    try{publish('status',{feedbackDraftUpdated:true});}catch{}
    return receipt(stored);
  }
  return Object.freeze({
    get:()=>receipt(read()),
    put(body){expected(body,['expected','draft']);return commit(typedDraft(body.draft));},
    remove(body){expected(body,['expected']);return commit(null);},
  });
}
