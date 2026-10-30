const FIELDS=['blocklist','globalBlocklist','communityExemptions'];
const LABELS={blocklist:'按群屏蔽成员（原始 JSON）',globalBlocklist:'本机附加全局屏蔽（原始 JSON 数组）',communityExemptions:'本机全局屏蔽豁免（原始 JSON 数组）'};
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const encoded=value=>JSON.stringify(value,null,2);
const copy=value=>structuredClone(value);

// These drafts do not share the ordinary settings FormState baseline. A status
// read or an unrelated settings save can never authorize a stale raw overwrite.
export function createBlocklistRawEditor({request,onSaved=()=>{},onChange=()=>{}}){
  const base=new Map(),pending=new Map();let version=0,ticket=0,disposed=false,saving=null,host=null,notice=null,comparison=null;
  const controls=new Map();
  const report=message=>{if(notice)notice.textContent=message;};
  const value=field=>pending.get(field)?.text??(base.has(field)?encoded(base.get(field).value):'');
  function updateControls(){for(const[field,input]of controls){input.disabled=!base.has(field);if(input.value!==value(field))input.value=value(field);}}
  function acceptRead(view){for(const field of FIELDS)if(!pending.has(field)&&view?.fields?.[field])base.set(field,copy(view.fields[field]));}
  async function read(){
    const current=++ticket;report('正在读取原始本机名单…');
    try{const view=await request('GET','/api/blocklist-raw');if(disposed||current!==ticket)return;acceptRead(view);updateControls();report(pending.size?'读取完成；未保存输入和原版本均保留。':'原始本机名单已读取；填写 {} 或 [] 可明确清空。');}
    catch(error){if(!disposed&&current===ticket)report(`读取失败：${error.message}；已有输入保留。`);}
  }
  function capture(field,text){
    if(!base.has(field)){report('尚未读取该字段版本，请先重新读取。');return;}
    // Keep even invalid JSON as a versioned draft; it must survive failed saves.
    pending.set(field,{text,version:++version});onChange();report('原始名单有未保存输入；请点击“保存原始名单”，或明确放弃草稿后离开。');
  }
  function parse(field,text){
    if(!text.trim())throw Error(`${LABELS[field]}不能为空；清空请填写 ${field==='blocklist'?'{}':'[]'}`);
    const next=JSON.parse(text);
    if(field==='blocklist'?next===null||typeof next!=='object'||Array.isArray(next):!Array.isArray(next))throw Error(field==='blocklist'?'按群原始名单必须为 JSON 对象':'本机原始名单必须为 JSON 数组');
    const scan=item=>{if(!item||typeof item!=='object')return;for(const[key,value]of Object.entries(item)){if(['__proto__','prototype','constructor','__replace__'].includes(key))throw Error('原始名单不允许 prototype/constructor/__replace__ 键');scan(value);}};scan(next);
    return next;
  }
  function invalid(){for(const[field,entry]of pending)try{parse(field,entry.text);}catch(error){return error.message;}return '';}
  async function save(){
    if(saving)return saving;if(!pending.size){report('原始名单没有待保存输入。');return true;}
    const sent=new Map([...pending].map(([field,entry])=>[field,copy(entry)]));
    const patch={},expected={};
    try{for(const[field,entry]of sent){patch[field]=parse(field,entry.text);expected[field]={source:base.get(field).source,revision:base.get(field).revision};}}
    catch(error){report(`保存失败：${error.message}；原始名单草稿保留。`);return false;}
    report('正在保存原始本机名单；新输入仍会保留…');
    saving=(async()=>{
      try{
        const receipt=await request('PUT','/api/blocklist-raw',{patch,expected});
        for(const[field,entry]of sent){
          base.set(field,copy(receipt.fields[field]));
          if(pending.get(field)?.version===entry.version)pending.delete(field);
        }
        comparison?.replaceChildren();updateControls();onChange();onSaved(receipt);
        report(pending.size?'此次原始名单已保存；提交期间的新输入尚未保存。':'原始名单已保存；仅修改本机原始存储。');
        return true;
      }catch(error){report(`保存失败：${error.message}；原始名单草稿保留，可对比服务器版本后重试。`);return false;}
    })();
    try{return await saving;}finally{saving=null;}
  }
  async function compare(){
    const current=++ticket;
    try{
      const latest=await request('GET','/api/blocklist-raw');if(disposed||current!==ticket)return;
      comparison?.replaceChildren();
      for(const[field,entry]of pending){
        const original=base.get(field),server=latest.fields[field];
        if(original.revision===server.revision&&original.source===server.source)continue;
        const box=node('fieldset');box.dataset.rawConflict=field;box.append(node('legend',LABELS[field]));
        for(const[label,text]of [['编辑基线',encoded(original.value)],['服务器当前',encoded(server.value)],['我的输入',entry.text]]){box.append(node('strong',label),node('pre',text));}
        for(const[keep,label]of [[false,'采用服务器值'],[true,'保留我的输入并采用新版本']]){
          const button=node('button',label);button.type='button';button.addEventListener('click',()=>{
            if(saving){report('请等待当前保存结束后再处理冲突。');return;}
            // A comparison decision belongs only to the exact input shown.
            if(pending.get(field)?.version!==entry.version){box.remove();report('对比后输入已改变，请重新对比；新输入与原版本保留。');return;}
            base.set(field,copy(server));if(!keep)pending.delete(field);else pending.set(field,{...entry,version:++version});box.remove();updateControls();onChange();report(keep?'已确认服务器版本；输入保留，仍需保存原始名单。':'已采用服务器值；其它字段输入保留。');
          });box.append(button);
        }
        comparison?.append(box);
      }
      if(!comparison?.childElementCount)report('待保存字段版本一致；未自动推进编辑基线。');
    }catch(error){if(!disposed&&current===ticket)report(`对比失败：${error.message}；原始名单草稿保留。`);}
  }
  function discard(){
    if(saving){report('请等待当前原始名单保存结束后再放弃草稿。');return false;}
    pending.clear();comparison?.replaceChildren();updateControls();onChange();report('已明确放弃原始名单草稿，正在读取服务器当前值。');void read();return true;
  }
  async function flushGuard(){
    const error=invalid();
    if(error)throw Error(`高级原始名单输入需要修正：${error}。请在“高级原始编辑·手动保存”中修正并保存，或明确放弃原始名单草稿后离开。`);
    if(pending.size)throw Error('高级原始名单尚未保存。请在“高级原始编辑·手动保存”中点击“保存原始名单”，或明确放弃原始名单草稿后离开。');
  }
  function mount(parent){
    host=node('div');host.dataset.blocklistRaw='';host.className='setting-field full';notice=node('p');notice.setAttribute('role','status');comparison=node('div');controls.clear();
    host.append(node('h4','高级原始编辑·手动保存'),node('p','高级原始编辑只修改本机存储。本机附加名单不会上传云端；清空它不会解除仅在云端的屏蔽。清空豁免可能恢复屏蔽。所选自定义社区服务可有自己的生效策略。'),node('p','普通设置的自动保存与顶部保存按钮不会应用原始名单。请点击本区域的“保存原始名单”，或明确放弃草稿后离开；刷新/关窗选择仍要离开时不会保证保存。'));
    for(const field of FIELDS){
      const wrap=node('label');wrap.className='setting-field full';wrap.dataset.path=field;const title=node('span',LABELS[field]),input=node('textarea');title.className='field-title';input.rows=field==='blocklist'?5:3;input.id=`field-${field}`;input.dataset.configPath=field;input.dataset.rawField=field;input.value=value(field);input.disabled=!base.has(field);input.addEventListener('input',()=>capture(field,input.value));wrap.append(title,input);host.append(wrap);controls.set(field,input);
    }
    const actions=node('div');actions.className='actions';
    for(const[label,action]of [['保存原始名单',save],['对比原始名单服务器版本',compare],['重新读取原始名单',read],['放弃原始名单草稿',discard]]){const button=node('button',label);button.type='button';button.addEventListener('click',()=>{void action();});actions.append(button);}
    host.append(notice,actions,comparison);parent.append(host);void read();return host;
  }
  return{mount,read,save,compare,discard,flushGuard,get dirty(){return pending.size>0;},get invalid(){return invalid();},dispose(){disposed=true;++ticket;}};
}
