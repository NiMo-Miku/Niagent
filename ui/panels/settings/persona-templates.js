import {button,destructiveButton,row,text} from '../ui.js';

// Independent default UI asset. It owns only template list/name drafts; the
// settings editor supplies the current persona and its existing save contract.
export function createPersonaTemplates({request,readPersona,onApply,onChange=()=>{}}){
  let templates=[],revision=0,readVersion=0,operation=0,disposed=false,busy=false;
  let root=null,list=null,nameInput=null,feedback=null,createButton=null,refreshButton=null,nameDraft='',message='',failed=false;
  const entries=new Map();
  function notify(value,error=false){message=value;failed=error;if(feedback){feedback.textContent=message;feedback.className=error?'error':'muted';}}
  function render(){
    if(disposed||!list)return;
    const live=new Set(templates.map(template=>template.id)),next=[],persona=readPersona();
    for(const [id,entry] of entries)if(!live.has(id)){entry.item.remove();entries.delete(id);}
    for(const template of templates){
      let entry=entries.get(template.id);
      if(!entry){
        entry={template,item:null};
        const use=button('使用',()=>run(async current=>{await onApply({...entry.template,customRules:entry.template.customRules??''},{isCurrent:current});if(current())notify('角色卡已保存');}));
        const actions=[use];let remove=null;
        if(!template.builtin){
          remove=destructiveButton('删除',()=>run(async (current,commit)=>{
            const selected=entry.template,result=await request('DELETE',`/api/persona-templates/${encodeURIComponent(selected.id)}`,{expected:selected.revision});
            if(current()){commit(result);notify('模板已删除；当前角色卡保留');}
          }),{target:()=>entry.item,clicks:2,key:()=>`${entry.template.id}:${entry.template.revision}`,canActivate:()=>!disposed&&!busy&&entries.get(template.id)===entry,impact:()=>`将删除人设 ${entry.template.name}，已选中的角色卡内容会保留。`});
          actions.push(remove);
        }
        const item=row(template.name,template.builtin?'出厂人设':'我的人设',actions);item.dataset.motionKey=`persona:${template.id}`;item.dataset.personaTemplate=template.id;
        entry={...entry,item,title:item.querySelector('strong'),use,remove};entries.set(template.id,entry);
      }
      entry.template=template;entry.title.textContent=template.name;entry.use.disabled=busy;if(entry.remove)entry.remove.disabled=busy;
      entry.use.setAttribute('aria-pressed',String(persona.text===template.text&&(persona.customRules??'')===(template.customRules??'')));next.push(entry.item);
    }
    for(const node of [...list.children])if(!next.includes(node))node.remove();next.forEach((node,index)=>{if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null);});
    if(!templates.length)list.append(text(document.createElement('p'),'暂无人设模板'));
    if(createButton)createButton.disabled=busy;if(refreshButton)refreshButton.disabled=busy;
  }
  function accept(data,ticket){
    if(disposed||(ticket!==undefined&&ticket!==revision))return false;
    templates=Array.isArray(data?.templates)?data.templates:[];++revision;onChange(templates);render();return true;
  }
  async function refresh(){
    if(disposed)return;
    const ticket=revision,read=++readVersion;
    try{const data=await request('GET','/api/persona-templates');if(!disposed&&read===readVersion)accept(data,ticket);}
    catch(error){if(!disposed&&read===readVersion&&ticket===revision)notify(`模板读取失败：${error.message}`,true);}
  }
  async function run(action){
    if(disposed||busy)return;
    busy=true;const started=++revision,token=++operation,current=()=>!disposed&&operation===token;
    // A response captured before another window's later write must not replace
    // a newer accepted list. Re-read after this receipt instead of adopting it.
    const commit=data=>{if(!current())return;if(revision===started)accept(data);else void refresh();};
    notify('正在保存…');render();
    try{await action(current,commit);}catch(error){if(current())notify(`${error.message||'保存失败'}；输入已保留`,true);}
    finally{if(current()){busy=false;render();}}
  }
  function mount(host){
    if(disposed)return;root=host;root.replaceChildren();
    list=document.createElement('div');list.id='template-list';list.className='settings-list';
    const editor=document.createElement('div');editor.className='settings-editor';const heading=text(document.createElement('h4'),'保存为自定义人设'),fields=document.createElement('div');fields.className='settings-fields';
    const label=document.createElement('label');label.className='setting-field';label.append(text(document.createElement('span'),'人设名称'));nameInput=document.createElement('input');nameInput.type='text';nameInput.id='persona-template-name';nameInput.maxLength=50;nameInput.value=nameDraft;nameInput.addEventListener('input',()=>{nameDraft=nameInput.value;});label.append(nameInput);fields.append(label);
    feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');notify(message,failed);
    createButton=button('保存当前角色卡为模板',()=>run(async (current,commit)=>{
      const name=nameDraft,persona=readPersona(),result=await request('POST','/api/persona-templates',{name,text:persona.text,customRules:persona.customRules??''});
      if(!current())return;
      commit(result);if(nameDraft===name){nameDraft='';if(nameInput)nameInput.value='';}notify('模板已保存');
    }),'primary');
    refreshButton=button('重新读取模板',refresh);editor.append(heading,fields,createButton,refreshButton,feedback);root.append(list,editor);render();
  }
  function dispose(){disposed=true;++operation;++readVersion;++revision;root=list=nameInput=feedback=createButton=refreshButton=null;entries.clear();}
  return Object.freeze({mount,accept,refresh,ticket:()=>revision,dispose});
}
