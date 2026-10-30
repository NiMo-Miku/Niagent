import {allChatsAllowed} from '../chat-access.js';
import {normalizeQQList} from './list-choice.js';
import {commandMuteKey,commandMuteUntil,isChatQuiet} from './quiet-state.js';

const chatKey=value=>/^(group|private):[1-9]\d{0,14}$/.test(String(value??''))?String(value):null;
const ids=value=>[...new Set((Array.isArray(value)?value:[]).map(String).map(id=>id.trim()).filter(id=>/^[1-9]\d{0,14}$/.test(id)))];
// Named, per-target buttons over the existing settings writer. A click patches
// only one map key; it cannot replace another chat's concurrently saved state.
export function mountQuietView({read,write,request,doc=document,now=()=>Date.now()}){
  const node=(tag,cls,value)=>{const el=doc.createElement(tag);el.className=cls;if(value!==undefined)el.textContent=value;return el;};
  const element=node('section','quiet-chat-view full'),heading=node('h4','','会话安静状态'),hint=node('p','muted quiet-chat-hint','点击会话切换安静状态，沿用上方安静时长；0 分钟为永久。'),notice=node('p','field-error quiet-chat-notice');
  hint.id='quiet-chat-hint';notice.setAttribute('role','status');element.append(heading,hint,notice);
  const rows=new Map(),known=new Map(),names=new Map();let disposed=false,timer=null;
  for(const[kind,label]of [['group','群聊'],['private','私聊']]){const section=node('div','quiet-chat-section'),title=node('h5','',label),buttons=node('div','quiet-chat-buttons'),empty=node('p','muted quiet-chat-empty',`白名单中暂无${label}。`);buttons.setAttribute('role','group');buttons.setAttribute('aria-label',label);section.append(title,buttons,empty);element.append(section);rows.set(kind,{section,title,buttons,empty,label});}
  function candidates(){
    const allow=read('allow')||{},cfg={allow,allowAllWhenEmpty:read('allowAllWhenEmpty')},map=read('commandMute.active')||{},keys=new Set();
    for(const[kind,field]of [['group','groups'],['private','private']]){
      for(const id of ids(allow[field]))keys.add(`${kind}:${id}`);
      if(allChatsAllowed(cfg,kind)){
        for(const key of known.keys())if(key.startsWith(kind+':'))keys.add(key);
        for(const key of Object.keys(map)){const typed=chatKey(key)||(/^\d+$/.test(key)?chatKey(`group:${key}`):null);if(typed?.startsWith(kind+':'))keys.add(typed);}
      }
    }
    return [...keys];
  }
  function refresh(){
    if(disposed)return;clearTimeout(timer);timer=null;
    const keys=candidates(),wanted=new Set(keys),stamp=now(),config=read('commandMute')||{},next=[];
    for(const[kind,row]of rows){
      for(const child of [...row.buttons.children])if(!wanted.has(child.dataset.quietChat))child.remove();
      const matching=keys.filter(key=>key.startsWith(kind+':'));row.title.textContent=`${row.label}（${matching.length}）`;row.empty.hidden=matching.length>0;
      matching.forEach((key,index)=>{
        let button=row.buttons.querySelector(`[data-quiet-chat="${key}"]`);
        if(!button){button=node('button','quiet-chat-button');button.type='button';button.dataset.quietChat=key;button.setAttribute('role','switch');button.setAttribute('aria-describedby',hint.id);button.append(node('span','quiet-chat-name'),node('small','quiet-chat-state'));button.addEventListener('click',()=>toggle(key));}
        if(row.buttons.children[index]!==button)row.buttons.insertBefore(button,row.buttons.children[index]||null);
        const id=key.slice(kind.length+1),label=names.get(key)||id,quiet=isChatQuiet(config,key,stamp),until=commandMuteUntil(config.active,key);
        button.querySelector('.quiet-chat-name').textContent=label;button.querySelector('.quiet-chat-state').textContent=`${id} · ${quiet?(until===0?'永久安静':'安静中'):'正常'}`;button.setAttribute('aria-label',`${row.label} ${label}（${id}）`);button.setAttribute('aria-checked',String(quiet));
        button.title=quiet?(until===0?'永久安静；点击恢复正常':`安静至 ${new Date(until).toLocaleString('zh-CN',{hour12:false})}；点击恢复正常`):'正常；点击设置安静';
        if(quiet&&until>stamp)next.push(until);
      });
    }
    notice.hidden=!notice.textContent;
    const visible=element.isConnected&&!doc.hidden&&read('commandMute.enabled')===true&&element.closest('details')?.open!==false;
    if(visible&&next.length)timer=doc.defaultView.setTimeout(refresh,Math.max(20,Math.min(60_000,Math.min(...next)-stamp+1)));
  }
  function toggle(key){
    if(disposed||read('commandMute.enabled')!==true||!candidates().includes(key))return;
    try{
      const duration=Number(read('commandMute.durationMin')??30);if(!Number.isFinite(duration)||duration<0)throw Error('请先填写有效的安静时长。');
      const quiet=isChatQuiet(read('commandMute'),key,now()),until=quiet?1:duration===0?0:now()+duration*60_000;
      // A historical timestamp means off. Keeping a tombstone lets the normal
      // recursive config patch update just this target, without a whole-map delete.
      write(`commandMute.active.${commandMuteKey(key)}`,until);notice.textContent='';refresh();
    }catch(error){notice.textContent=error.message;notice.hidden=false;}
  }
  const onToggle=event=>{if(event.target?.contains?.(element))refresh();};
  doc.addEventListener('visibilitychange',refresh);doc.addEventListener('toggle',onToggle,true);
  refresh();
  void(async()=>{
    const results=await Promise.allSettled([request('GET','/api/chats'),request('GET','/api/onebot/groups'),request('GET','/api/onebot/friends')]);if(disposed)return;
    if(results[0].status==='fulfilled')for(const chat of results[0].value.chats||[]){const key=chatKey(chat.chatKey||String(chat.key||'').replace('_',':'));if(key){known.set(key,true);if(chat.chatName)names.set(key,String(chat.chatName));}}
    for(const[index,kind,list]of [[1,'group','groups'],[2,'private','friends']])if(results[index].status==='fulfilled')for(const item of normalizeQQList(results[index].value,list).items||[]){const key=`${kind}:${item.id}`;known.set(key,true);names.set(key,item.name);}
    refresh();
  })().catch(()=>{});
  return{element,refresh,dispose(){disposed=true;clearTimeout(timer);doc.removeEventListener('visibilitychange',refresh);doc.removeEventListener('toggle',onToggle,true);}};
}
