// Only the top-level local shell may obtain a credential. Browser bootstrap is
// checked again by the server; plugins never receive a token through this API.
export const CONSOLE_SESSION_KEY='qq-agent.console-session.v1';
export const CONSOLE_SESSION_TTL_MS=30*60*1000;
const validToken=value=>typeof value==='string'&&value.length>0&&value.length<=8192;

export async function createConsoleAuth(win=window){
  let allowed=false;
  try{allowed=win.top===win&&['/','/index.html'].includes(win.location.pathname);}catch{}
  if(!allowed)return Object.freeze({token:'',confirm(){},invalidate(){},recover:async()=>false,dispose(){}});
  const origin=win.location.origin;
  const clear=()=>{try{win.sessionStorage.removeItem(CONSOLE_SESSION_KEY);}catch{/* storage may be unavailable */}};
  const url=new URL(win.location.href),explicit=url.searchParams.has('token');
  let token='',verified=false,revision=0,pending=null,disposed=false;
  const desktop=typeof win.qqAgentShell?.getConsoleToken==='function';
  const local=/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin);
  let autoAvailable=desktop||local;
  async function bootstrap(controller,setAvailability){
    if(desktop){const value=await win.qqAgentShell.getConsoleToken();return validToken(value)?value:'';}
    if(!local||typeof win.fetch!=='function')throw new Error('自动连接不可用');
    const response=await win.fetch('/api/console/bootstrap',{
      method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',referrerPolicy:'same-origin',
      headers:{accept:'application/json','x-qq-agent-bootstrap':'1'},signal:controller.signal,
    });
    if(!response.ok){
      // A denied/unsupported bootstrap needs the manual fallback. A temporary
      // listener or server failure remains eligible for automatic recovery.
      if([403,404,405].includes(response.status))setAvailability(false);
      throw new Error('自动连接不可用');
    }
    setAvailability(true);
    const data=await response.json();
    if(typeof data?.token!=='string'||data.token.length>8192)throw new Error('自动连接响应无效');
    return data.token;
  }
  function fetchCredential(){
    const controller=new AbortController(),ticket=revision;
    const state={controller,promise:null,available:null};pending=state;
    const current=()=>!disposed&&!controller.signal.aborted&&revision===ticket&&pending===state;
    const commitAvailability=()=>{if(current()&&state.available!==null)autoAvailable=state.available;};
    const timer=setTimeout(()=>controller.abort(),5000);
    let cancel;
    const interrupted=new Promise((resolve,reject)=>{cancel=()=>reject(new DOMException('自动连接已取消','AbortError'));controller.signal.addEventListener('abort',cancel,{once:true});});
    state.promise=(async()=>{
      try{
        const next=await Promise.race([bootstrap(controller,value=>{state.available=value;}),interrupted]);
        if(!current())return false;
        commitAvailability();
        token=next;++revision;return true;
      }catch{commitAvailability();return false;}
      finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);if(pending===state)pending=null;}
    })();return state.promise;
  }
  if(explicit){
    token=url.searchParams.get('token')||'';clear();
    url.searchParams.delete('token');
    win.history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
  }else if(desktop){
    await fetchCredential(); // IPC remains authoritative on desktop.
  }else{
    let cached='';
    try{
      const record=JSON.parse(win.sessionStorage.getItem(CONSOLE_SESSION_KEY)||'null'),now=Date.now();
      if(record?.version===1&&record.origin===origin&&validToken(record.token)&&Number.isFinite(record.expiresAt)&&record.expiresAt>now&&record.expiresAt<=now+CONSOLE_SESSION_TTL_MS)cached=record.token;
      else clear();
    }catch{clear();}
    if(!await fetchCredential())token=cached;
  }
  if(!validToken(token))token='';
  return Object.freeze({
    get token(){return token;},
    get automatic(){return !disposed&&autoAvailable&&(!explicit||verified);},
    adopt(value){
      if(!validToken(value))throw new Error('控制台令牌无效');
      ++revision;pending?.controller.abort();token=value;
      this.confirm();
    },
    // Persist only after the real console API has authenticated the credential.
    confirm(){
      verified=true;if(desktop||!token)return;
      try{win.sessionStorage.setItem(CONSOLE_SESSION_KEY,JSON.stringify({version:1,origin,token,expiresAt:Date.now()+CONSOLE_SESSION_TTL_MS}));}catch{/* unavailable storage does not block this document */}
    },
    invalidate(error){
      if(error?.status!==401||error?.credentialCurrent===false)return;
      try{if(JSON.parse(win.sessionStorage.getItem(CONSOLE_SESSION_KEY)||'null')?.token===token)clear();}catch{clear();}
    },
    async recover(expectedToken=token){
      if(disposed||explicit&&!verified)return false;
      if(expectedToken!==token)return true;
      if(pending)return pending.promise;
      const restored=await fetchCredential();
      if(restored)this.confirm();
      return restored;
    },
    dispose(){disposed=true;++revision;pending?.controller.abort();},
  });
}
