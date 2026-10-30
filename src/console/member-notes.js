// A synchronous, field-scoped config transaction. Clients never replace the
// entire memberNotes map when changing one person's display name.
const UID=/^\d{1,15}$/;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const noteOf=(notes,uid)=>typeof notes?.[uid]==='string'?notes[uid].trim():'';

export function createMemberNoteController({config,publish=()=>{}}){
  function validate(uid){if(!UID.test(uid))fail('userId 必须是数字 QQ 号');}
  function get(uid){validate(uid);return{note:noteOf(config.get().memberNotes,uid)};}
  function put(uid,body){
    validate(uid);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['note','expected'].includes(key))||typeof body.note!=='string')fail('备注需为字符串');
    if(body.note.length>300)fail('备注最多300字');
    if(Object.hasOwn(body,'expected')&&typeof body.expected!=='string')fail('备注原值需为字符串');
    const notes={...(config.get().memberNotes??{})},previous=noteOf(notes,uid),note=body.note.trim();
    if(Object.hasOwn(body,'expected')&&body.expected!==previous)fail('备注已被其他操作更新，请重新读取后再保存',409);
    if(note===previous)return{ok:true,note};
    if(note)notes[uid]=note;else delete notes[uid];
    // update writes successfully before publishing new config. No await may
    // separate the current read, expected check and commit.
    config.update({memberNotes:{__replace__:notes}});
    publish('status',{configUpdated:true});
    publish('memory.update',{memberNotesUpdated:true});
    return{ok:true,note};
  }
  return Object.freeze({get,put});
}
