// 62：真实 HTTP + ZIP + 文件系统 + loader；只使用临时扩展，不执行用户代码。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpServer } from '../src/kernel/http.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createPanelAdapters, registerPanelRoutes } from '../src/console/panel-adapters.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { installDisposableDialog } from '../ui/panels/dialog-lifecycle.js';
import { mktmp, eq, ok, section, summary } from './helpers.mjs';

function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const locals = [], centers = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42); centers.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const center = Buffer.concat(centers), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(center.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, center, end]).toString('base64');
}
const root = mktmp('qqa-management-');
for (const kind of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, kind));
const dataDir = path.join(root, 'fixture-data');
const log = { info() {}, warn() {}, error() {}, child() { return this; }, recent: () => [] };
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log }); config.load(); config.update({ server: { port: 0, token: 'fixture-management-token' } });
const capability = createCapabilityRegistry({ log });
const permissions = createPermissions({ log, dataDir, headless: true });
const registry = createToolRegistry({ log, permissions, capabilities: capability });
const scheduler = createScheduler({ log }); const storage = createStorage({ dataDir, log });
const loader = createPluginLoader({ appRoot: root, config, log, registry, capabilityRegistry: capability, permissions, scheduler, storage });
const http = createHttpServer({ config, log, staticDir: root });
registerConsoleRoutes(http, { config, loader, permissions, registry, capability, log, dataDir, appRoot: root, sessions: {}, store: {}, onebot: {} });
registerPanelRoutes(http, createPanelAdapters({ config, loader, permissions, registry, bundledManifest: { panels: [] }, log }));
const port = await http.listen();
async function req(method, url, body) { const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'x-console-token': 'fixture-management-token' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, data: await response.json() }; }
function manifest(id, kind = 'plugin') { return { id, kind, description: '管理行为测试扩展', entry: 'index.js', permissions: ['net.outbound'], configSchema: { count: { type: 'integer', minimum: 1 }, flag: { type: 'boolean' }, password: { type: 'string', secret: true } }, settings: { count: 2, flag: false } }; }
function files(id, kind = 'plugin') { return { [`package/${kind}.json`]: JSON.stringify(manifest(id, kind)), 'package/package.json': '{"type":"module"}', 'package/index.js': `import {value} from './helper.js'; globalThis.__managementTopLevel=(globalThis.__managementTopLevel||0)+1; export default { setup(ctx) { ctx.registerTool({id:'ping',name:'Ping',execute:async()=>value}); } };`, 'package/helper.js': `export const value='old';` }; }
async function install(id, kind = 'plugin', extra = {}) { return req('POST', '/api/skills/install', { zipBase64: zip(files(id, kind)), kind, ...extra }); }
try {
  section('安装默认停用、完整解压与身份验证');
  delete globalThis.__managementTopLevel;
  let result = await install('fixture-one'); eq(result.status, 200, '安装请求成功'); eq(result.data.skill.code, 'disabled', '默认停用'); eq(result.data.skill.enabled, false, '开关停用'); eq(globalThis.__managementTopLevel, undefined, '安装不执行顶层');
  const dir = path.join(root, 'plugins', 'fixture-one'); ok(fs.existsSync(path.join(dir, 'helper.js')), 'helper 解压至真实安装目录'); ok(fs.existsSync(path.join(dir, 'index.js')), 'entry 位于根目录'); eq(fs.readdirSync(dir).some(name => name.startsWith('.market-')), false, '没有把 staging 当插件'); eq(result.data.skill.description, '管理行为测试扩展', 'DTO 保留描述'); ok(result.data.skill.fingerprint, '停用扩展仍有授权指纹');
  const authBeforeEnable = await req('GET', '/api/plugins/fixture-one/permissions'); eq(authBeforeEnable.status, 200, '停用插件可先查看权限');
  if (authBeforeEnable.status === 200) {
    eq((await req('POST', '/api/plugins/fixture-one/permissions', { scope: 'net.outbound', value: 'allow', fingerprint: authBeforeEnable.data.fingerprint })).status, 403, '权限授权要求显式确认');
    eq((await req('POST', '/api/plugins/fixture-one/permissions', { scope: 'net.outbound', value: 'allow', fingerprint: authBeforeEnable.data.fingerprint, confirm: true })).status, 200, '停用态预授权成功');
    eq(globalThis.__managementTopLevel, undefined, '预授权不执行代码');
  }
  const beforeBytes = fs.readFileSync(path.join(dir, 'index.js'), 'utf8'); result = await install('fixture-one'); eq(result.status, 409, '重复安装 409'); eq(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), beforeBytes, '重复安装保留现有文件');
  eq((await install('bad-id', 'plugin', { skillId: 'mismatch' })).status, 400, '显式 id 不匹配拒绝'); eq(fs.existsSync(path.join(root, 'plugins', 'bad-id')), false, '非法安装无目标目录');
  const traversal = { ...files('traversal'), 'package/../outside.js': 'evil' }; eq((await req('POST', '/api/skills/install', { zipBase64: zip(traversal) })).status, 400, 'ZIP 穿越拒绝'); eq(fs.existsSync(path.join(root, 'outside.js')), false, '穿越没有创建文件');
  const badEntry = files('entry-out'); badEntry['package/plugin.json'] = JSON.stringify({ ...manifest('entry-out'), entry: '../outside.js' }); eq((await req('POST', '/api/skills/install', { zipBase64: zip(badEntry) })).status, 400, 'entry 越界拒绝');
  eq((await req('POST', '/api/skills/install', { zipBase64: zip({ 'index.js': 'code' }) })).status, 400, '无清单拒绝');
  eq((await install('wrong-kind', 'plugin', { kind: 'skill' })).status, 400, 'kind 不匹配拒绝');
  fs.mkdirSync(path.join(root, 'bundled', 'bundle-dir')); fs.writeFileSync(path.join(root, 'bundled', 'bundle-dir', 'skill.json'), JSON.stringify({ id: 'protected-id', kind: 'skill' }));
  eq((await install('protected-id')).status, 409, '捆绑身份不能覆盖');
  await loader.loadDir('bundled', path.join(root, 'bundled', 'bundle-dir'));
  eq((await req('POST', '/api/skills/protected-id/delete', {})).status, 403, '捆绑扩展不能卸载');
  eq((await install('fixture-skill', 'skill')).status, 200, '技能包安装'); ok(fs.existsSync(path.join(root, 'skills', 'fixture-skill', 'index.js')), '技能进入 skills 根');

  section('typed 设置、授权与显式启用');
  result = await req('POST', '/api/skills/fixture-one', { settings: { count: 4, flag: true, password: 'fixture-secret' } }); eq(result.status, 200, 'typed patch 成功'); eq(result.data.skill.settings.password, '******', '秘密设置脱敏');
  eq((await req('POST', '/api/skills/fixture-one', { settings: { count: '4' } })).status, 400, '数字字符串拒绝'); eq((await req('POST', '/api/skills/fixture-one', { settings: { count: 0 } })).status, 400, '最小值校验');
  await req('POST', '/api/skills/fixture-one', { settings: { password: '', flag: false } }); eq(config.get().skills['fixture-one'].settings.password, 'fixture-secret', '空秘密值保留'); eq(config.get().skills['fixture-one'].settings.count, 4, 'dirty patch 保留未修改字段');
  result = await req('POST', '/api/skills/fixture-one', { enabled: true }); eq(result.status, 200, '显式启用成功'); eq(globalThis.__managementTopLevel, 1, '启用才执行顶层'); eq(await registry.get('fixture-one__ping').execute(), 'old', '真实工具执行旧 helper');
  const oldFingerprint = result.data.skill.fingerprint;
  ok(permissions.setOverride('fixture-one', 'net.outbound', 'allow', { fingerprint: oldFingerprint }), '旧代码授权');
  eq((await req('POST', '/api/skills/fixture-one/delete', {})).status, 409, '运行中卸载拒绝');

  section('热更新 DTO 与授权不误解除新身份');
  fs.writeFileSync(path.join(dir, 'helper.js'), `export const value='new';`);
  result = await req('POST', '/api/skills/fixture-one/hot-reload', {}); eq(result.data.ok, true, '依赖热更新成功'); eq(result.data.status, 'active', '热更新状态正确'); eq(result.data.fingerprintChanged, true, '对比旧装载指纹'); eq(result.data.needsReauthorize, true, '代码变更提示重新授权'); eq(await registry.get('fixture-one__ping').execute(), 'new', '新 helper 真实生效');
  ok(permissions.isCurrent('fixture-one', result.data.skill.fingerprint), '热更新保留新权限身份'); eq(permissions.check('fixture-one', 'net.outbound', { fingerprint: result.data.skill.fingerprint }).decision, 'deny', '旧授权不复用');
  ok(permissions.setOverride('fixture-one', 'net.outbound', 'allow', { fingerprint: result.data.skill.fingerprint }), '可授予新身份');
  result = await req('POST', '/api/skills/fixture-one/hot-reload', {}); eq(result.data.fingerprintChanged, false, '未变化热更不提示变更'); eq(result.data.needsReauthorize, false, '未变化不要求授权');
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ ...manifest('fixture-one'), id: 'changed-identity' }));
  result = await req('POST', '/api/skills/fixture-one/hot-reload', {}); eq(result.data.ok, false, '热更新拒绝身份改动'); eq(loader.hostEntry('changed-identity'), null, '身份改动不执行新身份');
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest('fixture-one')));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default { setup(){throw new Error('fixture reload failed');} };`);
  result = await req('POST', '/api/skills/fixture-one/hot-reload', {}); eq(result.data.ok, false, '失败不能伪装成功'); eq(result.data.status, 'error', '失败 DTO 状态'); ok(result.data.error?.includes('fixture reload failed'), '失败含错误原因');

  section('卸载范围、可恢复隔离、命名空间保留与失败回滚');
  await req('POST', '/api/skills/fixture-one', { enabled: false });
  const ns = storage.namespace('fixture-one'); ns.set('history', { preserved: true });
  const update = config.update; let failOnce = true; config.update = function(patch) { if (failOnce && patch.skills?.__replace__) { failOnce = false; throw new Error('fixture config failure'); } return update.call(config, patch); };
  result = await req('POST', '/api/skills/fixture-one/delete', {}); eq(result.status, 500, '配置失败返回失败'); ok(fs.existsSync(dir), '失败恢复原目录'); ok(loader.hostEntry('fixture-one'), '失败仍保留 loader 条目'); eq(config.get().skills['fixture-one'].enabled, false, '失败保留开关'); config.update = update;
  const hostEntry = loader.hostEntry; loader.hostEntry = id => id === 'fixture-one' ? { ...hostEntry(id), dir: path.join(root, 'plugins') } : hostEntry(id);
  eq((await req('POST', '/api/skills/fixture-one/delete', {})).status, 403, '不允许删除用户根自身'); loader.hostEntry = hostEntry;
  const link = path.join(root, 'plugins', 'linked-fixture'); fs.symlinkSync(dir, link, process.platform === 'win32' ? 'junction' : 'dir');
  loader.hostEntry = id => id === 'fixture-one' ? { ...hostEntry(id), dir: link } : hostEntry(id);
  eq((await req('POST', '/api/skills/fixture-one/delete', {})).status, 403, '拒绝符号链接卸载'); ok(fs.existsSync(dir), '符号链接拒绝后目标保留'); loader.hostEntry = hostEntry; fs.unlinkSync(link);
  result = await req('POST', '/api/skills/fixture-one/delete', {}); eq(result.status, 200, '停用后卸载成功'); eq(result.data.recoverable, true, '卸载可恢复'); ok(result.data.quarantine.endsWith('.uninstalled-v1'), '隔离使用精确新后缀'); ok(fs.existsSync(path.join(root, result.data.quarantine, 'helper.js')), '代码保存在隔离区'); eq(fs.existsSync(dir), false, '目标从用户根移除'); eq(ns.get('history'), { preserved: true }, '存储命名空间保留'); eq(config.get().skills['fixture-one'], undefined, '清除配置覆盖'); eq(loader.hostEntry('fixture-one'), null, '卸载移除 loader 条目'); eq(permissions.isCurrent('fixture-one'), false, '卸载身份撤销');
  const auth = JSON.parse(fs.readFileSync(path.join(dataDir, 'plugin-authorizations.json'), 'utf8')); eq(auth.grants.some(grant => grant.pluginId === 'fixture-one'), false, '持久化授权清除');
  eq(fs.readdirSync(path.join(root, '.extension-management-v1', 'staging')).length, 0, '安装临时目录清理');

  section('共享面板真实事件行为：类型筛选、dirty patch 与取消');
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.value = ''; this.checked = false; this.files = []; this.dataset = {}; }
    append(...nodes) { this.children.push(...nodes); }
    addEventListener(event, fn) { (this.events[event] ??= []).push(fn); }
    removeEventListener(event, fn) { this.events[event] = (this.events[event] ?? []).filter(listener => listener !== fn); }
    async fire(event) { for (const fn of this.events[event] ?? []) await fn({ preventDefault() {} }); }
    replaceChildren(...nodes) { this.children = nodes; }
    remove() { this.removed = true; }
    showModal() { this.open = true; }
    reportValidity() { this.validityChecks = (this.validityChecks || 0) + 1; return this.valid !== false; }
    close() { this.open = false; void this.fire('close'); }
    click() { void this.fire(this.tag === 'input' ? 'cancel' : 'click'); }
  }
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const nodes = { '#list': new Element('section'), '#search': new Element('input') }, body = new Element('body'), calls = [];
  globalThis.document = { createElement: tag => new Element(tag), body };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.__managementUiHarness = {
    request: async (method, endpoint, payload) => { calls.push({ method, endpoint, payload }); return { ok: true, needsReauthorize: true, skill: { id: 'ui-plugin' } }; },
    $: key => nodes[key], clear: node => node.replaceChildren(),
    row: (title, detail, actions) => { const card = new Element('article'); card.title = title; card.detail = detail; card.append(...actions); return card; },
    button: (label, fn) => { const element = new Element('button'); element.textContent = label; element.addEventListener('click', fn); return element; },
    // This fixture exercises settings/authorization, not progressive deletion
    // (covered with the real component in 168/169). Never simulate one-click delete.
    destructiveButton: label => { const element = new Element('button'); element.textContent = label; element.addEventListener('click', () => { throw new Error('Use the real destructive-progress fixture for deletion'); }); return element; },
    confirmAction: async () => false, managePermissions: async () => { calls.push({ permissionDialog: true }); },
    installDisposableDialog,
  };
  try {
    const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../ui/panels/extension-manager.js'), 'utf8').replace(/^import[^\n]+\n/gm, '');
    const module = await import(`data:text/javascript;base64,${Buffer.from(`const {request,$,clear,row,button,destructiveButton,confirmAction,managePermissions,installDisposableDialog}=globalThis.__managementUiHarness;\n${source}`).toString('base64')}`);
    const uiPlugin = { id: 'ui-plugin', name: 'UI plugin', kind: 'plugin', root: 'plugins', enabled: true, loaded: true, available: true, code: 'active', fingerprint: 'fixture', configSchema: { count: { type: 'integer' }, flag: { type: 'boolean' }, password: { secret: true, type: 'string' } }, settings: { count: 2, flag: false, password: '******' } };
    module.renderExtensions([uiPlugin, { ...uiPlugin, id: 'ui-skill', name: 'UI skill', kind: 'skill' }], 'plugin', async () => {});
    eq(nodes['#list'].children.length, 1, 'plugins 面板仅显示 plugin');
    const hot = nodes['#list'].children[0].children.find(node => node.textContent === '热更新'); await hot.fire('click'); eq(calls.some(call => call.permissionDialog), false, '取消重新授权确认不打开权限窗口');
    module.settingsDialog(uiPlugin, async () => {});
    const dialog = body.children.at(-1), form = dialog.children.find(node => node.tag === 'form');
    const fields = form.children.filter(node => node.tag === 'label');
    const count = fields[0].children.find(node => node.tag === 'input'), flag = fields[1].children.find(node => node.tag === 'input'), secret = fields[2].children.find(node => node.tag === 'input');
    eq(secret.type, 'password', 'secret 输入为 password'); eq(secret.value, '', '秘密脱敏占位不写入输入值');
    count.value = '7'; await count.fire('input'); flag.checked = true; await flag.fire('change');
    const save = form.children.find(node => node.textContent === '保存修改'), callCount = calls.length;
    form.valid = false; await save.fire('click'); eq(calls.length, callCount, '原生表单校验未通过时不提交');
    form.valid = true; await save.fire('click'); eq(form.validityChecks, 2, '保存按钮调用原生表单校验');
    eq(calls.at(-1).payload, { settings: { count: 7, flag: true }, clearSecrets: [] }, '设置只提交 dirty typed 字段，不提交秘密占位或清除指令');
    eq(dialog.open, false, '设置保存完成时原生弹窗已关闭'); eq(dialog.removed, true, '设置保存完成时弹窗已同步移除');
    const callsAfterSave = calls.length; dialog.close(); await dialog.fire('close');
    eq(dialog.open, false, '重复旧关闭不会重新打开弹窗'); eq(dialog.removed, true, '重复旧关闭保留已移除状态'); eq(calls.length, callsAfterSave, '重复旧关闭不触发额外请求');
    eq(await module.pickZip(), null, 'ZIP picker cancel Promise 正常结束');
    nodes['#search'].value = ''; module.renderExtensions([uiPlugin], 'skill', async () => {}); eq(nodes['#list'].children[0].className, 'empty', 'skills 页不混入插件');
  } finally { globalThis.document = previousDocument; globalThis.window = previousWindow; delete globalThis.__managementUiHarness; }
} finally { await http.close(); loader.stopAll(); permissions.close(); delete globalThis.__managementTopLevel; fs.rmSync(root, { recursive: true, force: true }); }
summary('62-plugin-management-behavior');
