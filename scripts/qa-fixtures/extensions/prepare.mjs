// Generate installable fixtures only inside an isolated QA app/output tree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '../../..');
const json = (value) => JSON.stringify(value, null, 2);
function crc32(buffer) { let value = 0xffffffff; for (const byte of buffer) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
export function makeFixtureZip(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(header, filename, data); central.push(entry, filename); offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function isolatedApp(appRoot) {
  const resolved = fs.realpathSync(appRoot);
  if (resolved.toLowerCase() === fs.realpathSync(workspace).toLowerCase()) throw new Error('Refusing to modify the source workspace as a QA app');
  for (const name of ['plugins', 'skills', 'bundled']) if (!fs.statSync(path.join(resolved, name)).isDirectory()) throw new Error('QA app is missing ' + name);
  return resolved;
}
const panelHtml = '<!doctype html><meta charset="utf-8"><title>扩展 QA 面板</title><link rel="stylesheet" href="style.css"><h1>扩展 QA 面板</h1><p>所有动作只对隔离夹具生效。</p><label>文本 <input id="text" value="有头验收"></label><label>会话 <input id="chat"></label><div id="buttons"></div><pre id="output">等待操作</pre><script type="module" src="panel.js"></script>';
const panelCss = 'body{font:16px system-ui;padding:24px;color:#183047;background:#f5f8fb}label{display:block;margin:12px 0}button{margin:5px;padding:9px}pre{white-space:pre-wrap;background:white;padding:16px;border:1px solid #cbd5e1}input{padding:8px;width:300px}';
function panelJs(id, chatKey) {
  return `import {ctx} from './panel-client.js';const out=document.querySelector('#output');document.querySelector('#chat').value=${JSON.stringify(chatKey)};
  const args=()=>({text:document.querySelector('#text').value,chatKey:document.querySelector('#chat').value});
  for(const [label,tool] of [['回声/版本','echo'],['存储/计时器','state'],['本地HTTP（需授权）','fetch'],['发送（需授权）','send'],['读消息（需授权）','read'],['能力提供者','provider'],['禁止net.raw','raw']]){const button=document.createElement('button');button.textContent=label;button.addEventListener('click',async()=>{button.disabled=true;try{out.textContent=JSON.stringify(await ctx.call(${JSON.stringify(id + '__')}+tool,args()),null,2);}catch(error){out.textContent=error.message;}finally{button.disabled=false;}});document.querySelector('#buttons').append(button);}
  const button=document.createElement('button');button.textContent='读取脱敏配置';button.addEventListener('click',async()=>{try{out.textContent=JSON.stringify(await ctx.getConfig(),null,2);}catch(error){out.textContent=error.message;}});document.querySelector('#buttons').append(button);`;
}
function panelSource(version) {
  return `export default {setup(ctx){const version=${JSON.stringify(version)};const count=key=>ctx.storage.set(key,(ctx.storage.get(key)||0)+1);count('setups');ctx.log.info('QA setup '+version);
  ctx.scheduler.every(1000,()=>count('ticks'));ctx.events.on('message.in',()=>count('events'));ctx.config.onChange(()=>count('configChanges'));ctx.lifecycle.onStop(()=>{count('stops');ctx.log.info('QA stopped '+version);});
  const tool=(id,scopes,handler)=>ctx.registerTool({id,name:'QA '+id,category:'other',scopes,params:{type:'object',properties:{text:{type:'string'},chatKey:{type:'string'}}},execute:handler});
  tool('echo',[],args=>({version,text:args.text,greeting:ctx.config.get('greeting')}));tool('state',[],()=>({version,setups:ctx.storage.get('setups'),ticks:ctx.storage.get('ticks'),events:ctx.storage.get('events'),stops:ctx.storage.get('stops'),configChanges:ctx.storage.get('configChanges')}));
  tool('fetch',['net.outbound'],async()=>{const response=await ctx.http.fetch(ctx.config.get('endpoint'),{timeoutMs:5000,maxBytes:65536});return {status:response.status,text:await response.text()};});
  tool('send',['qq.send'],args=>ctx.send(args.chatKey,[{type:'text',text:'QA '+version+' '+String(args.text||'发送夹具')} ]));
  tool('read',['data.sessions.read'],args=>ctx.capability('data.messages').recent(args.chatKey,5));tool('provider',[],()=>ctx.capability('qa.color'));tool('raw',['net.raw'],()=>({unexpected:'net.raw must never execute'}));
}};`;
}
function providerSource(id, color) {
  return `export default {setup(ctx){const color=${JSON.stringify(color)};const count=key=>ctx.storage.set(key,(ctx.storage.get(key)||0)+1);ctx.registerCapability('qa.color',()=>({owner:ctx.id,color}));
  ctx.registerCapability('web.search',{create(){count('creates');return {start(){count('starts');},stop(){count('stops');},search:async query=>({provider:ctx.id,results:[{title:color+' '+query,url:ctx.config.get('resultUrl'),snippet:'离线替代搜索提供者'}]}),fetchPage:async url=>({url,text:color+' 离线页面',images:[]}),lockState:()=>({browseLocked:false,allowedHosts:[],allowPrivate:true})};}},{lifecycle:true,scopes:['net.outbound']});
  ctx.registerTool({id:'state',name:'QA provider state',execute:()=>({id:ctx.id,color,starts:ctx.storage.get('starts'),stops:ctx.storage.get('stops')})});
}};`;
}
export function prepareExtensionFixtures({ appRoot, outputDir, localBaseUrl = 'http://127.0.0.1:1', chatKey = 'group:10001' } = {}) {
  appRoot = isolatedApp(path.resolve(appRoot)); outputDir = path.resolve(outputDir);
  const url = new URL(localBaseUrl); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('QA endpoints must remain local');
  fs.mkdirSync(outputDir, { recursive: true });
  const packagesDir = path.join(outputDir, 'packages'), sourcesDir = path.join(outputDir, 'sources');
  fs.mkdirSync(packagesDir, { recursive: true }); fs.mkdirSync(sourcesDir, { recursive: true });
  const packages = [];
  const writePackage = (id, kind, files, description, fileName = id) => {
    const dir = path.join(sourcesDir, fileName); fs.mkdirSync(dir, { recursive: true });
    for (const [relative, content] of Object.entries(files)) { const file = path.join(dir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
    const zipPath = path.join(packagesDir, fileName + '.zip'); fs.writeFileSync(zipPath, makeFixtureZip(files));
    const entry = { id, kind, zipPath, sourceDir: dir, description }; packages.push(entry); return entry;
  };
  const manifest = { id: 'qa-panel', kind: 'plugin', name: 'QA 面板与权限', version: '1.0.0', apiVersion: 1, entry: 'index.js', enabledByDefault: true,
    permissions: ['ui.panel', 'net.outbound', 'qq.send', 'data.sessions.read', 'net.raw'],
    panels: [{ id: 'qa_panel', title: '扩展 QA 面板', entry: 'index.html', permissions: ['ui.panel'], api: [] }],
    configSchema: { greeting: { type: 'string', title: '欢迎文字' }, enabledFeature: { type: 'boolean', title: '开关' }, attempts: { type: 'integer', minimum: 1, maximum: 5 }, mode: { type: 'string', enum: ['alpha', 'beta'] }, rules: { type: 'object' }, labels: { type: 'array', items: { type: 'string' } }, apiKey: { type: 'string', secret: true, title: '测试密钥' }, endpoint: { type: 'string', title: '本地 HTTP' } },
    settings: { greeting: '初始 QA', enabledFeature: true, attempts: 2, mode: 'alpha', rules: { local: true }, labels: ['one'], apiKey: 'QA_ONLY_SYNTHETIC_SECRET', endpoint: new URL('/qa/status', url).href } };
  const panelFiles = { 'plugin.json': json(manifest), 'index.js': panelSource('v1'), 'ui/index.html': panelHtml, 'ui/style.css': panelCss, 'ui/panel.js': panelJs(manifest.id, chatKey), 'ui/panel-client.js': fs.readFileSync(path.join(workspace, 'ui/panels/panel-client.js')) };
  writePackage(manifest.id, 'plugin', panelFiles, 'ZIP安装默认停用；授权ui.panel后显示；其余动作验证单独scope');
  writePackage(manifest.id, 'plugin', { ...panelFiles, 'plugin.json': json({ ...manifest, version: '1.0.1' }), 'index.js': panelSource('v2') }, '热更源：只复制index.js到已装qa-panel，再点热重载', 'qa-panel-v2');
  writePackage('qa-skill', 'skill', { 'skill.json': json({ id: 'qa-skill', name: 'QA 模型工具', kind: 'skill', apiVersion: 1, entry: 'index.js', enabledByDefault: true, configSchema: { instruction: { type: 'string' } }, settings: { instruction: 'QA 动态提示片段' } }), 'index.js': `export default {setup(ctx){ctx.registerTool({name:'echo',description:'本地QA回声工具',params:{type:'object',properties:{text:{type:'string'}},required:['text']},handler:args=>({text:args.text,owner:ctx.id})});ctx.prompt.add({id:'qa-skill-context',priority:20,render:()=>ctx.config.get('instruction')});}};` }, 'Skill分类、模型工具发现、动态prompt配置');
  for (const [id, color] of [['qa-provider-a', '红色 A'], ['qa-provider-b', '蓝色 B']]) writePackage(id, 'plugin', { 'plugin.json': json({ id, name: 'QA 搜索提供者 ' + color, kind: 'plugin', version: '1.0.0', apiVersion: 1, entry: 'index.js', permissions: ['net.outbound'], configSchema: { resultUrl: { type: 'string' } }, settings: { resultUrl: new URL('/qa/result', url).href } }), 'index.js': providerSource(id, color) }, 'qa.color选择与真实web.search managed替换/停用回退，需net.outbound');
  writePackage('qa-legacy', 'skill', { 'skill.json': json({ id: 'qa-legacy', name: 'QA 0.4 兼容', kind: 'skill', compat: '04', entry: 'index.js' }), 'index.js': `export default {setup(api){api.registerTool({id:'echo',name:'QA legacy echo',execute:args=>({text:args.text,legacy:true})});api.log('离线0.4兼容工具已注册');}};` }, '0.4安装与命名空间工具');
  const invalid = [
    ['bad-traversal', { ...panelFiles, '../qa-escape.txt': 'must never be written' }, '路径穿越拒绝'],
    ['bad-entry', { 'plugin.json': json({ id: 'qa-bad-entry', kind: 'plugin', entry: '../outside.js' }), 'index.js': 'export default {};' }, '目录外入口拒绝'],
    ['bad-two-manifests', { ...panelFiles, 'skill.json': json({ id: 'qa-panel', kind: 'skill' }) }, '双清单拒绝'],
    ['bad-protected-id', { 'plugin.json': json({ id: 'core-tools', kind: 'plugin', entry: 'index.js' }), 'index.js': 'export default {};' }, '捆绑身份冲突拒绝'],
  ].map(([name, files, description]) => { const zipPath = path.join(packagesDir, name + '.zip'); fs.writeFileSync(zipPath, makeFixtureZip(files)); return { zipPath, description }; });
  const serverPath = path.join(outputDir, 'mcp-server.mjs'); fs.copyFileSync(path.join(here, 'mcp-server.mjs'), serverPath);
  const mcpServers = [{ id: 'headed-qa', command: process.execPath, args: [serverPath, 'normal'], requestTimeoutMs: 2000 }];
  const manifestFile = path.join(outputDir, 'fixture-manifest.json');
  const result = { appRoot, outputDir, packages, invalid, mcpServers, mcpServerPath: serverPath, chatKey, localBaseUrl: url.href,
    hotReload: { id: 'qa-panel', source: path.join(sourcesDir, 'qa-panel-v2/index.js'), target: path.join(appRoot, 'plugins/qa-panel/index.js') } };
  fs.writeFileSync(manifestFile, json(result));
  fs.writeFileSync(path.join(outputDir, 'HEADED-STEPS.txt'), [
    '1. 插件页安装 qa-panel.zip；安装后仍停用，重复安装应冲突。启用后无授权不能显示用户面板。',
    '2. 权限窗口允许ui.panel，打开「扩展 QA 面板」。先回声/存储/脱敏配置；测试密钥只显示hasApiKey。',
    '3. 在面板点HTTP/发送/读消息：分别拒绝，再始终允许对应scope并重试。net.raw永远不能运行。',
    '4. 插件设置编辑string/boolean/integer/enum/object/array/secret；保留空密钥、清除密钥、非法JSON错误。',
    '5. 安装并启用两个qa-provider，给net.outbound授权。在能力列表切换qa.color/web.search，再停用所选provider观察替代/默认回退。',
    '6. 将hotReload.source复制到hotReload.target；点qa-panel热重载，旧面板失效，重新授权/打开后回声为v2。停用移除面板与timer；重启ticks继续且无重复timer。',
    '7. Skills页安装qa-skill.zip/qa-legacy.zip；启用，确认自己的工具前缀与动态prompt。先停用才能卸载，清理残留设置。',
    '8. MCP桥接设置的servers粘贴fixture-manifest.json中mcpServers数组；停用/启用桥，确认动态工具和本地回声。改args最后元素malformed/hang测试错误与超时；恢复normal。',
    '9. 逐个安装bad-*.zip应显示错误，且不新增扩展/不写出目录；skill ZIP从plugin页安装应类型不匹配。',
    '所有网络、发送、会话、模型数据来自隔离有头夹具，不使用真实QQ/收费服务。',
  ].join('\n'));
  return result;
}
export function applyFixtureHotReload({ appRoot, source }) {
  appRoot = isolatedApp(path.resolve(appRoot)); const target = path.join(appRoot, 'plugins/qa-panel/index.js');
  if (!fs.existsSync(target)) throw new Error('Install qa-panel in the isolated QA app first');
  fs.writeFileSync(target, fs.readFileSync(source)); return target;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  console.log(json(prepareExtensionFixtures({ appRoot: argument('--app-root'), outputDir: argument('--output'), localBaseUrl: argument('--base-url'), chatKey: argument('--chat') })));
}
