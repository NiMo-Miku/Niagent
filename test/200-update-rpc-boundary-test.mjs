import assert from 'node:assert/strict';
import {RpcBridge} from '../ui/shell/rpc-bridge.js';
import {updateDownloadUrl} from '../ui/shell/update-notice.js';
globalThis.window={addEventListener(){},removeEventListener(){}};
for(const value of ['javascript:alert(1)','data:text/html,hi','file:///tmp/update.exe','http://example.test','https://name:password@example.test','not a url'])assert.equal(updateDownloadUrl(value),'');
assert.equal(updateDownloadUrl('https://example.test/download?q=1'),'https://example.test/download?q=1');
let invoked=0;
for(const manifest of [{id:'settings',kind:'user',api:[]},{id:'skills',kind:'bundled',api:[]},{id:'settings',kind:'bundled',api:[]}]){
  const messages=[],contentWindow={postMessage:m=>messages.push(m)},frame={contentWindow,addEventListener(){}};
  const bridge=new RpcBridge({frame,manifest,onUpdateAction:params=>{invoked++;return{action:params.action};}});
  const send=async params=>{await bridge.handle({source:contentWindow,origin:'null',data:{jsonrpc:'2.0',id:1,method:'console.update',params,meta:{nonce:bridge.nonce,panel:manifest.id}}});return messages.at(-1);};
  try{
    const eligible=manifest.kind==='bundled'&&manifest.id==='settings';const before=invoked;
    for(const action of ['status','check','reveal']){const response=await send({action});if(eligible)assert.deepEqual(response.result,{action});else assert.equal(response.error.code,-32003);}
    if(eligible){for(const params of [undefined,null,[],{}, {action:'install'},{action:'check',url:'https://example.test'},{action:'status',token:'should-not-be-accepted'}])assert.equal((await send(params)).error.code,-32600);assert.equal(invoked,before+3);}else assert.equal(invoked,before);
  }finally{bridge.close();}
}
delete globalThis.window;
console.log('✓ update RPC: only bundled settings, exact action payloads, no arbitrary navigation or install, HTTPS credential-free URLs only');
