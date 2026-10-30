import {button,row,dateTime,clear} from '../ui.js';

const putText=(node,value)=>{value=String(value??'');if(node.textContent!==value)node.textContent=value;};

function mediaView(media,request){
  const box=document.createElement('div');box.className='message-media';
  const kind=media.kind||media.type||'image';
  if(kind==='face'){box.textContent=`[表情 ${media.faceId||media.id||''}]`;return box;}
  box.append(button(kind==='record'||kind==='audio'?'播放语音':kind==='video'?'播放视频':'查看图片',async()=>{
    const result=await request('POST','/api/media-data',{items:[media]}),item=result.results?.[0],url=typeof item==='string'?item:item?.dataUrl;
    const type=kind==='record'||kind==='audio'?'audio':kind==='video'?'video':'image';
    if(!url||!url.startsWith(`data:${type}/`))throw new Error(item?.error||'媒体不可用或已过期');
    if(!box.isConnected)return;
    const node=document.createElement(type==='image'?'img':type);node.src=url;
    if(type==='image'){node.alt='聊天图片';node.loading='lazy';}else node.controls=true;
    node.style.maxWidth='100%';clear(box);box.append(node);
  }));
  return box;
}

// One local message identity owns its reading surfaces. Changes to text/read/
// recall never replace its checkbox, expanded forward or loaded media.
// This leaf remains replaceable through ui.assets independently of the panel.
export function createMessageView({key,request,onSelection,expandedForwards}){
  const node=document.createElement('div');node.className='message';
  const check=document.createElement('input');check.type='checkbox';check.addEventListener('change',onSelection);
  const meta=document.createElement('small');meta.className='meta';
  const time=document.createElement('span'),stamp=document.createTextNode(''),sender=document.createElement('span'),state=document.createElement('span');
  time.className='message-time';sender.className='message-sender';state.className='message-state';time.append(stamp,state);meta.append(time,sender);
  const body=document.createElement('div');body.className='body';
  const tail=document.createComment('message attachments');node.append(check,meta,body,tail);
  let signature='',reply=null,mediaSignature=null,mediaNodes=[],forward=null,forwardContent=null,forwardVersion=0,forwardSignature='',latest=null;
  function appendForward(data){
    const nextSignature=JSON.stringify(data);if(forwardContent&&forwardSignature===nextSignature)return;forwardSignature=nextSignature;
    if(!forwardContent){forwardContent=document.createElement('details');forwardContent.className='forward-content';forwardContent.open=true;}
    const heading=forwardContent.querySelector('summary')||document.createElement('summary');putText(heading,`合并转发 · ${data.count??data.messages?.length??0} 条${data.truncated?'（已截断）':''}`);forwardContent.replaceChildren(heading);
    for(const message of data.messages||[]){const card=row(message.senderName||message.senderId||'未知成员',`${dateTime(message.ts)} · ${message.text||''}`);for(const media of message.media||[])card.append(mediaView(media,request));forwardContent.append(card);}
    if(forwardContent.parentElement!==node)node.insertBefore(forwardContent,tail);
  }
  return {node,update(message,{checked=false,selecting=false}={}){
    latest=message;
    const nextSignature=JSON.stringify(message);
    if(signature!==nextSignature){
      signature=nextSignature;node.dataset.message=String(message.id);
      node.classList.toggle('is-self',Boolean(message.self));
      check.value=String(message.id);check.setAttribute('aria-label',`选择消息 ${message.id}`);
      const timestamp=dateTime(message.ts);if(stamp.nodeValue!==timestamp)stamp.nodeValue=timestamp;
      putText(sender,message.self?'我':message.senderName||message.senderId||'未知');if(sender.title!==sender.textContent)sender.title=sender.textContent;
      putText(state,[!message.read?'未读':'',message.recalled?'已撤回':''].filter(Boolean).join(' · '));state.hidden=!state.textContent;
      putText(body,message.text||'[非文本消息]');
      if(message.reply){if(!reply){reply=document.createElement('blockquote');node.insertBefore(reply,body);}putText(reply,`回复 ${message.reply.sender||''}：${message.reply.text||''}`);}else{reply?.remove();reply=null;}
      const media=message.media||[],nextMediaSignature=JSON.stringify(media);
      if(mediaSignature!==nextMediaSignature){
        if(mediaSignature!==null)expandedForwards.delete(`${key}:${message.id}`);
        mediaSignature=nextMediaSignature;for(const old of mediaNodes)old.remove();
        mediaNodes=media.filter(m=>(m.kind||m.type)!=='forward').map(m=>mediaView(m,request));for(const box of mediaNodes)node.insertBefore(box,tail);
        forwardVersion++;forwardContent?.remove();forwardContent=null;
      }
      const hasForward=media.some(m=>(m.kind||m.type)==='forward')||message.forward||message.text?.includes('[合并转发');
      if(hasForward&&!forward){
        forward=button('展开合并转发',async()=>{
          const version=forwardVersion,id=latest.id;
          const data=await request('GET',`/api/chats/${key}/messages/${id}/forward`);
          if(version!==forwardVersion||!forward)return;
          expandedForwards.set(`${key}:${id}`,data);if(node.isConnected)appendForward(data);
        });node.insertBefore(forward,tail);
      }else if(!hasForward&&forward){forwardVersion++;forward.remove();forward=null;forwardContent?.remove();forwardContent=null;expandedForwards.delete(`${key}:${message.id}`);}
      if(hasForward&&expandedForwards.has(`${key}:${message.id}`))appendForward(expandedForwards.get(`${key}:${message.id}`));
    }
    if(check.checked!==checked)check.checked=checked;
    const hidden=!selecting;if(check.hidden!==hidden)check.hidden=hidden;
  }};
}
