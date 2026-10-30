// Optional startup-only UI identity/capability snapshot. No file paths leave here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const extensions=new Set(['.html','.css','.js','.mjs','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.json','.txt']);
const relative=value=>typeof value==='string'&&value.length<512&&!/[\\%:\x00-\x1f?#]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.startsWith('.'));
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!=='..'&&!rel.startsWith(`..${path.sep}`)&&!path.isAbsolute(rel);};
function fileUnder(root,rel){
  if(!relative(rel))return false;let current=root;
  try{
    if(fs.lstatSync(root).isSymbolicLink())return false;
    for(const part of rel.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())return false;}
    return inside(root,current)&&fs.statSync(current).isFile()?current:false;
  }catch{return false;}
}
function keysOf(declaration){const keys=declaration?.keys;return Array.isArray(keys)&&keys.length>0&&keys.length<=4&&new Set(keys).size===keys.length&&keys.every(key=>typeof key==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key)&&!['__proto__','constructor','prototype'].includes(key))?[...keys]:null;}

export function createPanelMetadata({panels,defaultPanels=[],ui={},resolveUiAsset,staticRoot,maxFiles=512,maxBytes=16*1024*1024,log=console}={}){
  const original=panels.map(panel=>structuredClone(panel));
  if(typeof staticRoot!=='string'||!path.isAbsolute(staticRoot))return original;
  const root=path.join(staticRoot,'panels');
  try{if(!fs.statSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())return original;}catch{return original;}
  const defaults=new Map(defaultPanels.map(panel=>[panel.id,panel])),ids=new Set([...defaults.keys(),...panels.map(panel=>panel.id)]),rows=new Map();
  let fileCount=0,byteCount=0;
  function enumerate(directory,prefix,excluded=new Set()){
    const result=[];
    function walk(dir,rel=''){
      for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
        if(item.name.startsWith('.')||!rel&&excluded.has(item.name))continue;
        if(item.isSymbolicLink())throw Error('UI metadata does not accept symlinks');
        const next=rel?`${rel}/${item.name}`:item.name;
        if(item.isDirectory())walk(path.join(dir,item.name),next);
        else if(item.isFile()&&extensions.has(path.extname(item.name).toLowerCase()))result.push(prefix+next);
        if(result.length>maxFiles)throw Error('UI metadata file limit');
      }
    }
    if(fs.existsSync(directory))walk(directory);return result;
  }
  function selected(url){
    const result=resolveUiAsset?.describe?.(url);
    if(result===false)return false;
    if(result&&typeof result==='object')return result;
    // Without the private resolver interface a trusted contribution cannot be
    // identified. Default fallback is safe only when the resolver says null.
    if(result!==null)return false;
    const filename=fileUnder(root,url.slice('/panels/'.length));
    return filename?{filename,source:{ownerId:'defaults',slot:`default:${url}`}}:false;
  }
  function read(url){
    if(rows.has(url))return rows.get(url);
    const resolved=selected(url);if(!resolved)return false;
    if(typeof resolved.source?.ownerId!=='string')throw Error('Selected UI source has no trusted owner');
    if(fileCount>=maxFiles||fs.statSync(resolved.filename).size>maxBytes-byteCount)throw Error('UI metadata byte/file limit');
    const content=fs.readFileSync(resolved.filename);++fileCount;byteCount+=content.byteLength;
    if(byteCount>maxBytes)throw Error('UI metadata byte limit');
    const row={url,source:resolved.source,sha256:hash(content)};rows.set(url,row);return row;
  }
  function criticalProof(panel,declaration,expectedOwner,kind){
    const scripts=declaration?.bootScripts;
    if(!Array.isArray(scripts)||!scripts.length||scripts.length>8||!scripts.every(script=>relative(script)&&/\.(?:m?js)$/.test(script)))return false;
    const prefix=`/panels/${panel.id}/`,urls=[prefix+panel.entry,...scripts.map(script=>prefix+script)];
    return urls.every(url=>{
      const row=read(url),slot=kind==='default'?`default:${url}`:`panel:${panel.id}/${url.slice(prefix.length)}`;
      if(!row||row.source.ownerId!==expectedOwner||row.source.slot!==slot)return false;
      // The default proof comes from the declared default root, never from a
      // replacement selected at this URL. Content/source must both agree.
      if(kind==='default')return Boolean(fileUnder(root,url.slice('/panels/'.length)));
      return true;
    });
  }
  let shared;
  try{
    shared=new Set(enumerate(root,'/panels/',new Set([...ids,'u','manifest.json'])));
    for(const key of Object.keys(ui.assets??{})){const match=key.match(/^panels\/([^/]+)(?:\/|$)/);if(match&&!ids.has(match[1])&&match[1]!=='u')shared.add('/'+key);}
  }catch(error){log.warn?.(`[panels] 视图状态元数据不可用：${error.message}`);return original;}
  return original.map(panel=>{
    delete panel.saveLifecycle;
    try{
      const trusted=ui.panels?.find(item=>item.id===panel.id),prefix=`/panels/${panel.id}/`,urls=new Set(enumerate(trusted?.assetRoot??path.join(root,panel.id),prefix));
      for(const key of Object.keys(ui.assets??{}))if(key.startsWith(prefix.slice(1)))urls.add('/'+key);
      for(const url of shared)urls.add(url);urls.add(prefix+panel.entry);
      const selectedRows=[...urls].sort().map(read).filter(Boolean);
      if(!selectedRows.some(row=>row.url===prefix+panel.entry))return panel;
      const sourceRows=selectedRows.map(({url,source})=>({url,...source}));
      panel.stateOwner='ui-'+hash(canonical(sourceRows)).slice(0,60);
      const raw=trusted??defaults.get(panel.id),owner=trusted?read(prefix+panel.entry)?.source.ownerId:'defaults',kind=trusted?'panel':'default';
      const stateKeys=keysOf(raw?.viewState);
      if(stateKeys&&criticalProof(panel,raw.viewState,owner,kind))panel.viewState={keys:stateKeys};
      if(raw?.navigation&&criticalProof(panel,raw.navigation,owner,kind)){
        const navigation={source:trusted?'trusted':'defaults'};
        if(raw.navigation.home===true)navigation.home=true;
        if(raw.navigation.role==='configuration'&&Array.isArray(raw.navigation.sections)){
          navigation.role='configuration';navigation.sections=[...new Set(raw.navigation.sections)].filter(section=>['models','access','onebot'].includes(section)).sort();
        }
        if(navigation.home||navigation.role)panel.navigation=navigation;
      }
      // Only the selected default settings sources may mirror config patches to
      // the host's unload writer. Metadata supplied by a replacement is ignored.
      // Extra unrelated assets do not revoke the default; replacing any default
      // settings or shared module does, even if the replacement claims its id.
      if(panel.id==='settings'&&!trusted){
        const critical=new Set([...enumerate(path.join(root,'settings'),prefix),...shared].filter(url=>fileUnder(root,url.slice('/panels/'.length))));
        const required=['/panels/settings/index.html','/panels/settings/panel.js','/panels/settings/form-state.js','/panels/settings/save-lifecycle.js','/panels/panel-client.js'];
        if(required.every(url=>critical.has(url))&&[...critical].every(url=>{const row=read(url);return row?.source.ownerId==='defaults'&&row.source.slot===`default:${url}`;}))panel.saveLifecycle={kind:'settings-v1'};
      }
      panel.stateGeneration=hash(canonical({schema:1,id:panel.id,entry:panel.entry,permissions:[...panel.permissions].sort(),api:[...panel.api].sort((a,b)=>(a.method+a.path).localeCompare(b.method+b.path)),viewState:panel.viewState??null,navigation:panel.navigation??null,saveLifecycle:panel.saveLifecycle??null,rows:selectedRows}));
      return panel;
    }catch(error){log.warn?.(`[panels] 面板 ${panel.id} 的可选元数据不可用：${error.message}`);delete panel.stateOwner;delete panel.stateGeneration;delete panel.viewState;delete panel.navigation;delete panel.saveLifecycle;return panel;}
  });
}
