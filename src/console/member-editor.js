import {createHash} from 'node:crypto';
import {createMemberNoteController} from './member-notes.js';

const UID=/^\d{1,15}$/;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const own=(value,key)=>Object.hasOwn(value??{},key);
const text=(value,max)=>String(value??'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
function snapshot(member){
  if(!member)return null;
  return{userId:String(member.userId??''),name:String(member.name??''),
    impressions:(member.impressions??[]).map(item=>({content:String(item?.content??item??''),createdAt:number(item?.createdAt)})),
    updatedAt:number(member.updatedAt),lastConsolidatedAt:number(member.lastConsolidatedAt)};
}
const version=member=>createHash('sha256').update(JSON.stringify(snapshot(member))).digest('hex');

// Each file has its own commit. A later failure returns the earlier commit's
// receipt; this controller never claims or attempts a cross-file rollback.
export function createMemberEditorController({memory,config,memberNotes,publish=()=>{}}={}){
  const notify=(name,payload)=>{try{publish(name,payload);}catch{/* a committed file remains committed */}};
  const notes=memberNotes??createMemberNoteController({config,publish:notify});
  function validate(chatKey,uid){
    if(!UID.test(uid))fail('userId 必须是数字 QQ 号');
    if(!/^(group|private):\d+$/.test(chatKey))fail('会话标识格式错误');
  }
  function get(chatKey,uid){
    validate(chatKey,uid);
    if(typeof memory?.query!=='function')fail('当前运行环境未提供记忆服务',503);
    const member=snapshot(memory.query(chatKey,{userId:uid}).find(item=>String(item.userId)===uid));
    return{member,note:notes.get(uid).note,memberVersion:version(member)};
  }
  function put(chatKey,uid,body){
    validate(chatKey,uid);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['name','impressions','note','expected','parts'].includes(key)))fail('成员编辑参数无效');
    const fenced=own(body,'expected');
    if(fenced){
      const expected=body.expected;
      if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).some(key=>!['memberVersion','note'].includes(key))||!/^[a-f0-9]{64}$/.test(expected.memberVersion??'')||typeof expected.note!=='string'||expected.note.length>300)fail('成员编辑原值无效');
    }
    const parts=own(body,'parts')?body.parts:['member',...(own(body,'note')?['note']:[])];
    if(!Array.isArray(parts)||new Set(parts).size!==parts.length||parts.some(part=>!['member','note'].includes(part))||own(body,'parts')&&!fenced)fail('分步保存需要有效原值与保存项目');
    if(parts.includes('note')&&(typeof body.note!=='string'||body.note.length>300))fail('备注需为不超过300字的字符串');
    if(parts.includes('member')&&typeof memory?.replaceMember!=='function')fail('当前运行环境未提供记忆服务',503);
    const memberDraft={userId:uid,name:text(body.name,60),impressions:Array.isArray(body.impressions)?body.impressions.map(item=>text(item?.content??item,300)).filter(Boolean).slice(0,20):[]};
    const noteDraft=parts.includes('note')?body.note.trim():null;
    // Check the note before reading memory (which can trigger legacy loading).
    // All validation and both CAS checks precede either new user edit.
    const beforeNote=notes.get(uid).note;
    if(fenced&&body.expected.note!==beforeNote)fail('备注已被其他操作更新；输入已保留，请重新打开核对后保存。',409);
    const before=get(chatKey,uid);
    if(fenced&&body.expected.memberVersion!==before.memberVersion)fail('成员印象已被其他操作更新；输入已保留，请重新打开核对后保存。',409);
    const steps={member:{state:'unchanged'},note:{state:'unchanged'}};
    let member=before.member,memberVersion=before.memberVersion,note=before.note,saved=0;
    const result=(status,ok,error='')=>({status,body:{ok,partial:!ok&&saved>0,member,memberVersion,note,steps,
      concurrency:{checked:fenced},retryParts:ok?[]:parts.filter(part=>steps[part].state!=='saved'&&steps[part].state!=='unchanged'),
      ...(error?{error,code:saved>0?'MEMBER_EDIT_PARTIAL':'MEMBER_EDIT_FAILED'}:{})}});
    if(parts.includes('member')){
      try{
        const committed=memory.replaceMember(chatKey,memberDraft);
        if(!committed)fail('成员印象保存失败',503);
        member=snapshot(committed);memberVersion=version(member);saved++;
        steps.member={state:'saved',member,memberVersion};
        notify('memory.update',{chatKey});
      }catch(error){
        steps.member={state:'failed',status:error?.status??500,error:'成员印象未保存'};
        if(parts.includes('note'))steps.note={state:'not-attempted'};
        return result(error?.status===503?503:500,false,'成员印象未保存，备注尚未保存；输入已保留。');
      }
    }
    if(parts.includes('note')){
      try{
        const committed=notes.put(uid,{note:noteDraft,expected:beforeNote});
        note=committed.note;
        steps.note={state:note===beforeNote?'unchanged':'saved',note};
        if(note!==beforeNote)saved++;
      }catch(error){
        steps.note={state:'failed',status:error?.status??500,error:error?.status===409?'备注已被其他操作更新':'备注未保存'};
        return result(saved>0?207:error?.status===409?409:500,false,
          saved>0?'成员印象已保存，备注未保存；输入已保留，再次保存仅重试未保存部分。':'备注未保存；输入已保留。');
      }
    }
    return result(200,true);
  }
  return Object.freeze({get,put});
}
