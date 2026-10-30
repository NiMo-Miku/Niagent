import {installDisposableDialog} from '../panels/dialog-lifecycle.js';

// Matches the fixed desktop probe targets. www.aliyun.com is outside the
// renderer's connect-src; do not broaden CSP or mislabel that restriction.
export const CAPTCHA_DIAGNOSTIC_TARGETS=Object.freeze([
  {url:'https://o.alicdn.com/',label:'验证码静态资源',renderer:true},
  {url:'https://captcha.cn-shanghai.aliyuncs.com/',label:'验证码接口',renderer:true},
  {url:'https://www.aliyun.com/',label:'阿里云网站',renderer:false},
  {url:'https://kondius.cn/qq-agent/captcha-api/',label:'验证码转发服务',renderer:true},
]);
const failures={dns:'域名解析失败',tls:'证书连接失败',timeout:'请求超时',network:'连接失败'};
function nodeResult(result) {
  if(result?.ok===true&&Number.isInteger(result.status)&&result.status>=100&&result.status<=599)return `HTTP 可达（${result.status}）`;
  return failures[result?.error]||'未获得 HTTP 响应';
}
async function rendererProbe(target,signal,fetchImpl) {
  if(!target.renderer)return '未直探（浏览器来源限制）';
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('请求超时','TimeoutError')),5000);
  try {
    if(signal.aborted)throw signal.reason;
    const response=await fetchImpl(target.url,{method:'HEAD',mode:'cors',redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal});
    if(response.type==='opaque'||response.type==='opaqueredirect'||response.status===0)return '请求已完成（HTTP 状态不可读）';
    return `HTTP 可达（${response.status}）`;
  } catch {return controller.signal.reason?.name==='TimeoutError'?'请求超时':'未完成（连接、CORS 或来源限制）';}
  finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

// All content stays in the root document; callers can only open this fixed UI.
export function createCaptchaDiagnostics({win=window,doc=document,fetchImpl=(...args)=>win.fetch(...args)}={}) {
  let current=null;
  function open() {
    if(current?.dialog.open){current.run.focus();return {ok:true};}
    const dialog=doc.createElement('dialog');dialog.id='captcha-diagnostics-dialog';dialog.className='captcha-diagnostics-dialog';
    const element=(tag,text,className)=>{const node=doc.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
    const title=element('h2','验证码诊断');title.id='captcha-diagnostics-title';dialog.setAttribute('aria-labelledby',title.id);
    const explanation=element('p','检测只观察网络响应，不代表已通过人机验证。主进程直连原始地址；浏览器受来源限制，并可能经桌面转发。403、404 等也说明收到了 HTTP 响应。');
    const interceptor=element('p','正在读取桌面转发状态…');interceptor.id='captcha-interceptor-state';interceptor.setAttribute('role','status');
    const status=element('p','点击“检测网络”开始；不会登录或发布内容。');status.id='captcha-diagnostics-status';status.setAttribute('role','status');
    const table=element('div',null,'captcha-diagnostics-grid');table.setAttribute('role','table');table.setAttribute('aria-label','验证码网络检测结果');
    const header=element('div',null,'captcha-diagnostics-row');header.setAttribute('role','row');for(const label of ['目标','主进程','浏览器']){const cell=element('strong',label);cell.setAttribute('role','columnheader');header.append(cell);}table.append(header);
    const rows=CAPTCHA_DIAGNOSTIC_TARGETS.map(target=>{const row=element('div',null,'captcha-diagnostics-row');row.setAttribute('role','row');const label=element('strong',target.label),node=element('span','尚未检测'),renderer=element('span','尚未检测');for(const cell of [label,node,renderer])cell.setAttribute('role','cell');row.append(label,node,renderer);table.append(row);return{target,node,renderer};});
    const run=element('button','检测网络','primary');run.type='button';run.id='captcha-diagnostics-run';
    const close=element('button','关闭');close.type='button';close.id='captcha-diagnostics-close';
    const actions=element('div',null,'dialog-actions');actions.append(close,run);
    dialog.append(title,explanation,interceptor,table,status,actions);doc.body.append(dialog);
    const session={dialog,run,controller:null,busy:false};current=session;
    const active=()=>current===session&&dialog.open;
    async function readInterceptor(){
      if(typeof win.qqAgentShell?.captchaInterceptorStatus!=='function'){if(active())interceptor.textContent='桌面转发状态：当前为浏览器控制台，需要桌面应用才能检查。';return;}
      try {
        const value=await win.qqAgentShell.captchaInterceptorStatus();if(!active())return;
        if(value?.installed!==true){interceptor.textContent='桌面转发未安装或状态未确认；这不代表人机验证一定不可用。';return;}
        const count=Number.isSafeInteger(value.redirectCount)&&value.redirectCount>=0?value.redirectCount:0;
        interceptor.textContent=`桌面转发已安装 · 已转发 ${count} 次${value.lastError?' · 最近出现转发异常':''}。安装状态不代表验证码已就绪。`;
      }catch{if(active())interceptor.textContent='无法读取桌面转发状态，请重试或重新打开桌面应用。';}
    }
    run.addEventListener('click',async()=>{
      if(session.busy)return;session.busy=true;run.disabled=true;status.textContent='正在检测固定网络目标…';const controller=new AbortController();session.controller=controller;
      for(const row of rows){row.node.textContent='检测中…';row.renderer.textContent='检测中…';}
      const hasNode=typeof win.qqAgentShell?.captchaNetProbe==='function';
      const nodePromise=hasNode?Promise.resolve().then(()=>win.qqAgentShell.captchaNetProbe()).then(value=>({value}),()=>({failed:true})):Promise.resolve({unavailable:true});
      const rendererPromise=Promise.all(rows.map(row=>rendererProbe(row.target,controller.signal,fetchImpl)));
      try {
        const [node,renderer]=await Promise.all([nodePromise,rendererPromise]);if(!active()||controller.signal.aborted)return;
        rows.forEach((row,index)=>{const result=node.value?.targets?.find(item=>item.target===row.target.url);row.node.textContent=node.unavailable?'需要桌面应用':node.failed?'桌面检测失败':nodeResult(result);row.renderer.textContent=renderer[index];});
        status.textContent='检测完成。浏览器与主进程结果不同，可能来自来源限制、转发路径或网络设置；请结合实际验证结果判断。';await readInterceptor();
      }finally{if(active()){session.busy=false;run.disabled=false;}session.controller=null;}
    });
    close.addEventListener('click',()=>dialog.close());
    installDisposableDialog(dialog,{onClosed:()=>{session.controller?.abort(new Error('诊断已关闭'));session.controller=null;if(current===session)current=null;}});
    dialog.showModal();run.focus();void readInterceptor();return {ok:true};
  }
  return Object.freeze({open});
}
