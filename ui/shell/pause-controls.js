// Trusted default shell leaf. The primary action preserves unread messages;
// only the separately named action explicitly marks the old backlog read.
export function createPauseControls({api,button,getPaused,onBusy=()=>{},commitStatus=()=>{},notify=()=>{},refresh=()=>{}}){
  const doc=button.ownerDocument,skip=doc.createElement('button');
  skip.id='resume-read-btn';skip.type='button';skip.textContent='恢复并全部标为已读';
  skip.title='恢复自动响应，并把此操作执行时已有的积压消息标为已读；之后的新消息仍正常接收。';
  skip.hidden=true;button.after(skip);
  const cancel=doc.createElement('button');cancel.id='resume-read-cancel-btn';cancel.type='button';cancel.textContent='取消重试，开始新操作';cancel.hidden=true;skip.after(cancel);
  let busy=false,disposed=false,controller=null,remaining=null,uncertain=false,markedTotal=0;
  const countOf=result=>result?.marked&&typeof result.marked==='object'&&!Array.isArray(result.marked)&&Object.values(result.marked).every(count=>Number.isSafeInteger(count)&&count>=0)?Object.values(result.marked).reduce((sum,count)=>sum+count,0):null;
  function resetRetry(){remaining=null;uncertain=false;markedTotal=0;}
  function sync(){
    skip.hidden=getPaused()!==true;skip.disabled=busy||disposed||uncertain;
    skip.textContent=remaining?'重试未保存的标读':initialLabel;
    cancel.hidden=skip.hidden||!remaining&&!uncertain;cancel.disabled=busy||disposed;
  }
  const initialLabel=skip.textContent;
  async function act(skipBacklog=false){
    const paused=getPaused();if(disposed||busy||typeof paused!=='boolean'||skipBacklog&&(!paused||uncertain))return;
    busy=true;controller=new AbortController();onBusy(true);sync();
    try{
      const result=await api.request(skipBacklog?'DELETE':'POST','/api/pause',skipBacklog?(remaining?{remaining}:undefined):{paused:!paused},undefined,{signal:controller.signal});
      if(disposed)return;
      if(skipBacklog&&result?.partial===true&&result.ok===false&&result.paused===true&&countOf(result)!==null&&Array.isArray(result.remaining)&&result.remaining.length>0){
        markedTotal+=countOf(result);remaining=result.remaining;uncertain=false;commitStatus({paused:true});
        notify(`已将 ${markedTotal} 条已有消息标为已读；部分标读未保存，仍保持暂停。可只重试未保存部分。`,'error');return;
      }
      if(result?.ok!==true||typeof result.paused!=='boolean'||skipBacklog&&result.paused!==false)throw Error('未能确认暂停状态，请稍后重试。');
      if(skipBacklog&&countOf(result)===null)throw Error('未能确认积压消息标读结果，请刷新状态。');
      commitStatus({paused:result.paused});
      const total=skipBacklog?markedTotal+countOf(result):0;resetRetry();
      notify(skipBacklog?`已恢复自动响应，并将 ${total} 条已有消息标为已读。`:result.paused?'已暂停自动响应；新消息保留为未读。':'已恢复自动响应。','good');
    }catch(error){if(!disposed){if(skipBacklog)uncertain=true;notify(error.message||'暂停状态更新失败','error');}}
    finally{controller=null;busy=false;if(!disposed){onBusy(false);sync();void refresh();}}
  }
  const primary=()=>{void act();},discard=()=>{void act(true);};
  const abandon=()=>{if(busy||disposed)return;resetRetry();sync();notify('已取消旧标读重试；下一次操作将以当时已有消息建立新边界。');};
  button.addEventListener('click',primary);skip.addEventListener('click',discard);cancel.addEventListener('click',abandon);sync();
  return Object.freeze({sync,dispose(){if(disposed)return;disposed=true;controller?.abort();button.removeEventListener('click',primary);skip.removeEventListener('click',discard);cancel.removeEventListener('click',abandon);skip.remove();cancel.remove();}});
}
