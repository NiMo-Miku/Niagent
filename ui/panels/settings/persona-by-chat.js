import {button,text} from '../ui.js';
import {installDisposableDialog} from '../dialog-lifecycle.js';
import {PersonaDraft} from './persona-by-chat-state.js';

const FIELDS=[['participation','参与程度'],['roleText','角色设定'],['customRules','管理员附加规则'],['systemPromptOverride','完整系统提示词覆盖']];
const path=key=>`/api/persona-by-chat/${key.replace(':','_')}`;
const node=(tag,value)=>text(document.createElement(tag),value);
const queryFor=storageKey=>storageKey===undefined?undefined:{storageKey};

// Owns only its list and field drafts. Storage source and effective preview come
// from the selected controller; ordinary settings autosave never stages a map.
export function createPersonaByChatUI({request,beforeOpen=async()=>{},onSaved=()=>{}}){
  let disposed=false,list,filter,status,readVersion=0,editorVersion=0,filterDraft='',enriched=false,inventory={chats:[],legacy:[]};
  const titles=new Map(),editors=new Set(),rows=new Map();
  const title=row=>titles.get(row.chatKey)||row.title;
  function draw(){
    if(disposed||!list)return;const query=filterDraft.toLocaleLowerCase(),wanted=[];
    for(const row of inventory.chats){
      const label=title(row),source=row.source.legacyShared?'旧共享（同号群/私聊）':row.overriddenFields.length?'本会话覆盖':'跟随全局';
      if(query&&!`${label} ${row.chatKey} ${source}`.toLocaleLowerCase().includes(query))continue;
      let entry=rows.get(row.chatKey);if(!entry){const card=document.createElement('div'),pick=button('',()=>open(entry.row.chatKey)),hidden=button('遮蔽存档',()=>open(entry.row.chatKey,entry.row.chatKey));card.className='persona-chat-entry';card.dataset.personaChat=row.chatKey;pick.className='persona-chat-choice';hidden.className='persona-shadow-choice';hidden.setAttribute('aria-label','编辑被遮蔽存档（当前不生效）');card.append(pick,hidden);entry={card,pick,hidden,row};rows.set(row.chatKey,entry);}
      entry.row=row;text(entry.pick,`${label}${row.overriddenFields.length?' ●':''}`);entry.pick.setAttribute('aria-label',`编辑${label}的人设`);entry.pick.title=`${label} · ${row.chatKey} · ${source}${row.active?'':' · 当前统一模式中'}`;entry.pick.classList.toggle('has-custom',row.overriddenFields.length>0);entry.hidden.hidden=!row.hiddenQualified;wanted.push(entry.card);
    }
    for(const row of inventory.legacy.filter(value=>!value.associated.length)){
      if(query&&!`${row.title} ${row.storageKey}`.toLocaleLowerCase().includes(query))continue;
      const key=`legacy:${row.storageKey}`;let entry=rows.get(key);if(!entry){const card=document.createElement('div'),pick=button('',()=>open(`group:${entry.row.storageKey}`,entry.row.storageKey));card.className='persona-chat-entry';card.dataset.personaLegacy=row.storageKey;pick.className='persona-chat-choice';pick.setAttribute('aria-label','编辑旧共享人设');card.append(pick);entry={card,pick,row};rows.set(key,entry);}entry.row=row;text(entry.pick,row.title);entry.pick.title='旧共享存档；影响同号群聊和私聊（若存在）';wanted.push(entry.card);
    }
    if(!wanted.length){let empty=list.querySelector('.empty');if(!empty){empty=node('p','没有匹配的白名单、档案或已配置会话');empty.className='empty';}wanted.push(empty);}
    for(const child of [...list.children])if(!wanted.includes(child))child.remove();wanted.forEach((child,index)=>{if(list.children[index]!==child)list.insertBefore(child,list.children[index]||null);});
  }
  async function refresh(){
    const version=++readVersion;
    try{const data=await request('GET','/api/persona-by-chat');if(disposed||version!==readVersion)return;inventory=data;draw();status.textContent=data.active?'分会话存档已启用；空白字段跟随全局':'统一人设已启用；以下存档保留，默认策略暂不使用';}
    catch(error){if(!disposed&&version===readVersion)status.textContent=`读取失败：${error.message}`;}
  }
  async function enrich(){
    const results=await Promise.allSettled([request('GET','/api/chats'),request('GET','/api/onebot/groups'),request('GET','/api/onebot/friends')]);if(disposed)return;
    const [chats,groups,friends]=results.map(result=>result.status==='fulfilled'?result.value??{}:{});
    for(const row of chats.chats??[])if(row.chatKey&&row.chatName)titles.set(row.chatKey,String(row.chatName));
    for(const row of groups.groups??[])if(row.id&&row.name)titles.set(`group:${row.id}`,String(row.name));
    for(const row of friends.friends??[])if(row.id&&(row.remark||row.nickname||row.name))titles.set(`private:${row.id}`,String(row.remark||row.nickname||row.name));
    draw();
  }
  async function open(chatKey,storageKey,transfer){
    const generation=++editorVersion;await beforeOpen();if(disposed||generation!==editorVersion)return false;
    const [view,catalog]=await Promise.all([request('GET',path(chatKey),undefined,queryFor(storageKey)),request('GET','/api/persona-templates')]);
    if(disposed||generation!==editorVersion)return false;
    if(transfer&&(view.storageKey!==transfer.storageKey||view.sourceGuard!==transfer.sourceGuard))throw new Error('来源再次变化，旧草稿保留；请重新对比');
    const draft=new PersonaDraft(view),dialog=document.createElement('dialog'),body=document.createElement('article'),inputs=new Map(),effectiveLabels=new Map();let templates=catalog.templates??[],busy=false,compareVersion=0;
    if(transfer)for(const [field,entry] of transfer.fields)draft.set(field,entry.value);
    dialog.className='settings-spec-dialog persona-chat-dialog';body.style.overflowWrap='anywhere';dialog.dataset.chatKey=chatKey;dialog.dataset.storageKey=view.storageKey;
    const lifecycle=installDisposableDialog(dialog,{onClosed:()=>{draft.dispose();++compareVersion;editors.delete(lifecycle);}});editors.add(lifecycle);
    const heading=view.scope==='legacy-shared'?`旧共享 ${view.storageKey}（同号群/私聊）`:`${titles.get(chatKey)||chatKey} 的人设`;
    body.append(node('h3',heading),node('p',`${view.source.policy==='custom'?'默认映射查找来源（自定义策略未披露内部来源）':'实际存档来源'}：${view.source.selectedStorageKey}；编辑存档：${view.storageKey}${view.shadowed?'（按默认规则被旧共享键遮蔽，当前不生效）':''}`),node('p','只覆盖四个风格字段。空白跟随全局，不能用空白禁用全局规则。机器人名字与账号昵称仅在全局设置。'));
    const mode=node('p',view.active?'分会话模式已启用':'统一人设已启用：本次只保存存档，不切换模式。');body.append(mode);
    if(view.source.policy==='custom')body.append(node('p','当前使用自定义人设策略，实际值以预览为准。下列存档来源遵循默认查找规则。'));
    if(view.malformedEntry)body.append(node('p','此存档原值格式无效，当前继承全局。保存将把此来源修复为四字段对象。'));
    const feedback=node('p',''),comparison=document.createElement('div'),picker=document.createElement('select');feedback.className='muted';feedback.setAttribute('role','status');picker.setAttribute('aria-label','选择会话人设模板');
    const live=()=>!disposed&&!draft.disposed;
    const notify=(message,error=false)=>{if(live()){feedback.textContent=message;feedback.className=error?'error':'muted';}};
    function fillPicker(selected=''){picker.replaceChildren(new Option('选择模板（只填本弹窗草稿）',''));for(const template of templates)picker.append(new Option(`${template.name}（${template.builtin?'内置':'自定义'}）`,template.id));picker.value=selected;}
    fillPicker();body.append(picker);
    for(const [field,label] of FIELDS){
      const wrap=document.createElement('label'),input=document.createElement(field==='participation'?'select':'textarea');wrap.className='setting-field';wrap.append(node('span',`${label}（空白跟随全局）`));
      if(field==='participation')for(const [value,name] of [['','跟随全局'],['low','克制'],['medium','自然'],['high','积极']])input.append(new Option(name,value));
      else input.maxLength=field==='customRules'?10000:20000;
      input.name=field;input.value=draft.value(field);input.addEventListener(field==='participation'?'change':'input',()=>draft.set(field,input.value));inputs.set(field,input);
      const actual=node('small',`当前实际值：${view.effective[field]??''}`);effectiveLabels.set(field,actual);wrap.append(input,actual);body.append(wrap);
    }
    function applyTemplate(template){draft.chooseTemplate(template);for(const field of ['roleText','customRules'])inputs.get(field).value=draft.value(field);notify(template.customRules?'模板已填入会话草稿，尚未保存':'模板已填入会话草稿；空附加规则会继承全局规则，尚未保存');}
    picker.addEventListener('change',()=>{const template=templates.find(value=>value.id===picker.value);if(template)applyTemplate(template);});
    async function createTemplate(){
      const nested=document.createElement('dialog'),content=document.createElement('article'),nestedStatus=node('p',''),nestedInputs={};nested.className='settings-spec-dialog persona-template-create-dialog';let submitting=false;
      const nestedLife=installDisposableDialog(nested,{onClosed:()=>editors.delete(nestedLife)});editors.add(nestedLife);content.append(node('h3','添加会话人设模板'));
      for(const [field,label,value] of [['name','人设名称',''],['text','角色设定',draft.value('roleText')],['customRules','管理员附加规则',draft.value('customRules')]]){const wrap=document.createElement('label'),input=document.createElement(field==='name'?'input':'textarea');wrap.className='setting-field';input.name=field;input.value=value;input.maxLength=field==='name'?50:field==='text'?20000:10000;wrap.append(node('span',label),input);content.append(wrap);nestedInputs[field]=input;}
      nestedStatus.setAttribute('role','status');
      content.append(button('创建模板并填入会话草稿',async()=>{
        if(submitting||!live()||nestedLife.closed)return;submitting=true;const sent=Object.fromEntries(Object.entries(nestedInputs).map(([field,input])=>[field,input.value]));
        const parentVersions=new Map(['roleText','customRules'].map(field=>[field,draft.pending.get(field)?.version]));
        try{
          const result=await request('POST','/api/persona-templates',sent);if(!live()||nestedLife.closed)return;
          templates=result.templates??templates;const created=templates.find(value=>value.id===result.created);fillPicker(result.created);
          if(created)for(const [field,value] of [['roleText',created.text],['customRules',created.customRules??'']])if(draft.pending.get(field)?.version===parentVersions.get(field)){draft.set(field,value);inputs.get(field).value=value;}
          if(Object.entries(sent).some(([field,value])=>nestedInputs[field].value!==value)){nestedStatus.textContent='提交时的模板已创建；随后输入仍保留。点击取消返回会话草稿，或另存新的模板。';return;}
          nestedLife.close();notify('模板已创建并填入会话草稿；会话与全局人设尚未改变');
        }catch(error){if(live()&&!nestedLife.closed){nestedStatus.textContent=`${error.message}；输入已保留`;nestedStatus.className='error';}}
        finally{submitting=false;}
      }),button('取消添加模板',()=>nestedLife.close()),nestedStatus);nested.append(content);document.body.append(nested);nested.showModal();
    }
    async function compare(){
      const ticket=++compareVersion;comparison.replaceChildren(node('p','正在读取最新存档，保留当前草稿…'));
      try{
        let latest;try{latest=await request('GET',path(chatKey),undefined,{storageKey:view.storageKey});}catch(error){if(error.data?.httpStatus!==409)throw error;latest=await request('GET',path(chatKey));}
        if(!live()||ticket!==compareVersion)return;comparison.replaceChildren();
        if(latest.storageKey!==draft.baseline.storageKey||latest.sourceGuard!==draft.baseline.sourceGuard){
          comparison.append(node('p',`来源已改变。新的默认来源：${latest.source.selectedStorageKey}${latest.source.legacyShared?'（旧共享，同号群/私聊）':''}。旧草稿不会自动改写新目标。`),button('打开新的当前来源并复制草稿',async()=>{
            const current=await request('GET',path(chatKey));if(!live())return;
            if(current.storageKey!==latest.source.selectedStorageKey||current.sourceGuard!==latest.sourceGuard&&current.storageKey===latest.storageKey)throw new Error('来源再次变化，请重新对比；旧草稿保留');
            const opened=await open(chatKey,undefined,{storageKey:current.storageKey,sourceGuard:current.sourceGuard,fields:new Map(draft.pending)});if(opened&&live())lifecycle.close();
          }));return;
        }
        const conflicts=[...draft.pending.keys()].filter(field=>latest.revisions[field]!==draft.baseline.revisions[field]);
        if(!conflicts.length){comparison.append(node('p','当前提交字段与打开时版本一致；本次读取没有更改保存基线，可以重试保存。'));return;}
        for(const field of conflicts){
          const box=document.createElement('fieldset');box.dataset.conflictField=field;box.append(node('legend',FIELDS.find(value=>value[0]===field)[1]));
          for(const [label,value] of [['打开时',draft.baseline.values[field]],['服务端最新',latest.values[field]],['当前草稿',draft.value(field)]]){const wrap=document.createElement('label'),valueBox=document.createElement('textarea');wrap.className='setting-field';valueBox.readOnly=true;valueBox.value=value;wrap.append(node('span',label),valueBox);box.append(wrap);}
          box.append(button('采用服务端值',()=>{draft.resolve(field,latest,false);inputs.get(field).value=draft.value(field);box.remove();notify('已采用该字段的服务端值；其余草稿保留');}),button('保留草稿并确认覆盖此字段',()=>{draft.resolve(field,latest,true);box.remove();notify('已明确保留该字段草稿；再次点击保存才会提交');}));comparison.append(box);
        }
      }catch(error){if(live()&&ticket===compareVersion)comparison.replaceChildren(node('p',`对比失败：${error.message}；草稿已保留`));}
    }
    const saveLabel=view.scope==='legacy-shared'?'保存旧共享人设（群/私同号）':view.shadowed?'保存遮蔽存档（当前不生效）':'保存此会话人设';
    const save=button(saveLabel,async()=>{
      if(busy||!live())return;if(!draft.pending.size){notify('没有待保存字段');return;}busy=true;const snapshot=draft.snapshot();notify('正在保存…');
      try{
        const receipt=await request('PUT',path(chatKey),snapshot.body);if(!live())return;const previouslyActive=draft.baseline.active;
        draft.accept(snapshot,receipt);++compareVersion;comparison.replaceChildren();for(const [field,label] of effectiveLabels)label.textContent=`当前实际值：${receipt.effective[field]??''}`;
        onSaved(receipt);void refresh();
        if(draft.pending.size)notify('提交时的改动已保存；随后输入仍留在草稿，请再次保存');
        else if(previouslyActive&&!receipt.active){mode.textContent='统一人设已启用，保存的存档保留，默认策略暂不使用';notify('存档已保存；当前统一模式不会使用这份默认覆盖');}
        else lifecycle.close();
      }catch(error){notify(`${error.message}；草稿已保留。可对比最新存档后明确解决冲突。`,true);}
      finally{busy=false;}
    });
    const actions=document.createElement('div');actions.className='actions';actions.append(button('添加会话人设模板',createTemplate),button('四项恢复跟随全局（填入草稿）',()=>{draft.clear();for(const [field,input] of inputs)input.value=draft.value(field);notify(view.scope==='legacy-shared'?'四项清空已填入草稿；保存后同号群/私聊跟随全局，隐藏存档保持遮蔽':'四项清空已填入草稿，保存后跟随全局');}),save,button('对比最新存档（保留草稿）',compare),button('取消并丢弃本次草稿',()=>lifecycle.close()));
    body.append(actions,feedback,comparison);dialog.append(body);document.body.append(dialog);dialog.showModal();return true;
  }
  function mount(host){
    if(disposed)return;host.replaceChildren();filter=document.createElement('input');filter.type='search';filter.value=filterDraft;filter.placeholder='搜索会话名称或ID';filter.setAttribute('aria-label','搜索分会话人设');filter.addEventListener('input',()=>{filterDraft=filter.value;draw();});status=node('p',''),list=document.createElement('div');list.className='persona-chat-grid';const toolbar=document.createElement('div');toolbar.className='persona-chat-toolbar';toolbar.append(filter,button('重新读取会话清单',refresh));host.append(node('h4','分会话人设'),node('p','点击会话编辑人设；● 表示已单独配置，未配置的字段沿用全局人设。'),toolbar,status,list);void refresh();if(!enriched){enriched=true;void enrich();}
  }
  function dispose(){disposed=true;++readVersion;++editorVersion;for(const editor of [...editors].reverse())editor.dispose();editors.clear();rows.clear();list=filter=status=null;}
  return Object.freeze({mount,refresh,dispose});
}
