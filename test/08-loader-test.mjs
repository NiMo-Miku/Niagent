// 08 · 插件装载器：清单规范化 / BOM / entry 防穿越 / 串行 / stale-but-working /
// 孤儿清扫 / 启停 / 捆绑裸 id vs 用户前缀 / hello 捆绑激活
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createPluginLoader, normalizeManifest } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { buildDefaultConfig, createConfig } from '../src/kernel/config.js';
import { Bus } from '../src/kernel/bus.js';

// 构造一个完整的 loader 环境（roots 指向临时目录，bundled 用仓库真目录）
function makeEnv({ roots }) {
  const logs = [];
  const log = {
    info: () => {}, warn: () => {}, error: (m) => logs.push(m),
    child: () => ({ info: () => {}, warn: () => {}, error: (m) => logs.push(m) }),
  };
  const bus = new Bus({ error: () => {}, warn: () => {} });
  const dir = mktmp('qqa-loader-');
  const defaults = buildDefaultConfig({ personaText: '' });
  const config = createConfig({ dataDir: dir, defaults, log });
  config.load();
  const caps = createCapabilityRegistry({ log });
  const perms = createPermissions({ log });
  const registry = createToolRegistry({ log, bus, permissions: perms, capabilities: caps });
  const scheduler = createScheduler({ log });
  const storage = createStorage({ dataDir: dir, log });
  const loader = createPluginLoader({
    log, bus, appRoot: roots, registry, capabilityRegistry: caps,
    permissions: perms, scheduler, storage, config,
  });
  caps._setActiveProbe(loader.isActive);
  return { loader, registry, caps, scheduler, config, logs, bus };

}

function writePlugin(root, id, { manifest, indexJs, manifestFile = 'skill.json', bom = false } = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const raw = JSON.stringify(manifest ?? { id });
  fs.writeFileSync(path.join(dir, manifestFile), (bom ? '\uFEFF' : '') + raw);
  if (indexJs !== undefined) fs.writeFileSync(path.join(dir, 'index.js'), indexJs);
  return dir;
}

const GOOD = `export default { setup(ctx) { ctx.registerTool({ id: 'ping', name: 'Ping', execute: async () => 'pong' }); } };`;

section('normalizeManifest（SPEC §7.3 字段全表）');
const { manifest: m1 } = normalizeManifest({}, 'fallback-id');
eq(m1.id, 'fallback-id', 'id 回落目录名');
eq(m1.version, '0.0.0', 'version 默认 0.0.0');
eq(m1.category, 'utility', 'category 回落 utility');
eq(m1.entry, 'index.js', 'entry 默认 index.js');
const { manifest: m2, problems: p2 } = normalizeManifest({ id: 'ok', apiVersion: 2 }, 'x');
eq(m2.apiVersion, 1, 'apiVersion 钳回 1');
ok(p2.some((p) => p.msg.includes('apiVersion')), 'apiVersion>1 记 problem');
const { manifest: m3 } = normalizeManifest({ id: 'x', requires: ['x', 'real'] }, 'y');
eq(m3.requires, ['real'], '自依赖剔除');
const { manifest: m4 } = normalizeManifest({ id: 'x', prompt: { when: 'W', instruction: 'I', examples: [] } }, 'y');
ok(Array.isArray(m4.prompt.sections) && m4.prompt.sections[0].content === 'I', '旧形态 prompt 适配成 sections');
const { manifest: m5 } = normalizeManifest({ id: 'x', prompt: { sections: [{ id: 's', priority: 150 }] } }, 'y');
eq(m5.prompt.sections[0].priority, 99, 'priority 钳到 99');

section('装载 / 激活 / 工具注册（捆绑裸 id，用户域带前缀——A-2）');
const root = mktmp('qqa-roots-');
fs.mkdirSync(path.join(root, 'bundled'), { recursive: true });
fs.mkdirSync(path.join(root, 'plugins'), { recursive: true });
fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
writePlugin(path.join(root, 'bundled'), 'bundled-one', { manifest: { id: 'bundled-one', kind: 'skill' }, indexJs: GOOD });
writePlugin(path.join(root, 'skills'), 'user-one', {
  manifest: { id: 'user-one', kind: 'skill' },
  indexJs: `export default { setup(ctx) { const id = ctx.registerTool({ id: 'ping', name: 'P', execute: async () => 1 }); ctx.log.info('registered ' + id); } };`,
});
const env1 = makeEnv({ roots: root });
await env1.loader.loadAll({ reason: 'test' });
eq(env1.registry.get('ping').name, 'Ping', '捆绑域裸 id 注册');
ok(env1.registry.get('user-one__ping'), '用户域带 <id>__ 前缀注册');
eq(env1.loader.isActive('bundled-one'), true, 'bundled-one active');
eq(env1.loader.isActive('user-one'), true, 'user-one active');

section('SDK owner 边界（unregisterTool 不能删除其他插件工具）');
const ownerRoot = mktmp('qqa-owner-roots-');
for (const kind of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(ownerRoot, kind), { recursive: true });
writePlugin(path.join(ownerRoot, 'skills'), 'owner-a', { manifest: { id: 'owner-a' }, indexJs: `export default { setup(ctx) { globalThis.__ownerCtx = ctx; ctx.registerTool({ id: 'owned', name: 'Owned', execute: async () => 'a' }); } };` });
writePlugin(path.join(ownerRoot, 'skills'), 'owner-b', { manifest: { id: 'owner-b' }, indexJs: `export default { setup(ctx) { ctx.registerTool({ id: 'other', name: 'Other', execute: async () => 'b' }); } };` });
const ownerEnv = makeEnv({ roots: ownerRoot });
await ownerEnv.loader.loadAll({ reason: 'owner-boundary' });
eq(globalThis.__ownerCtx.unregisterTool('owner-b__other'), false, 'owner 不能删除其他插件工具');
ok(ownerEnv.registry.get('owner-b__other'), '其他插件工具仍保留');

section('BOM 清单剥离（Windows 编辑器默认写 BOM）');
writePlugin(path.join(root, 'skills'), 'bom-one', {
  manifest: { id: 'bom-one' }, indexJs: GOOD, bom: true,
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'bom-one'));
eq(env1.loader.isActive('bom-one'), true, 'BOM 清单正常装载');

section('entry 防穿越（安全拒绝：path.relative + realpath，即使旧实例在跑也不沿用）');
writePlugin(path.join(root, 'skills'), 'evil', {
  manifest: { id: 'evil', entry: '../../evil.js' },
  indexJs: GOOD,
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'evil'));
const evilEntry = env1.loader.listEntries().find((e) => e.id === 'evil');
eq(evilEntry.status, 'error', '越界 entry 拒绝装载');
ok(evilEntry.loadError.includes('越界') || evilEntry.loadError.includes('穿越') || evilEntry.loadError.includes('不存在'), `拒绝原因：${evilEntry.loadError}`);

section('stale-but-working（新版本 setup 抛错 → 沿用旧实例）');
writePlugin(path.join(root, 'skills'), 'user-one', {
  manifest: { id: 'user-one' },
  indexJs: `export default { setup() { throw new Error('new version boom'); } };`,
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'user-one'));
const u1 = env1.loader.listEntries().find((e) => e.id === 'user-one');
eq(u1.status, 'active', 'user-one 仍 active（旧实例沿用）');
ok(u1.loadError && u1.loadError.includes('boom'), `loadError 记录新版本失败原因：${u1.loadError}`);
ok(env1.registry.get('user-one__ping'), '旧实例的工具还在');

section('孤儿工具清扫（新版注册后，上一版独有工具对账清理）');
writePlugin(path.join(root, 'skills'), 'user-one', {
  manifest: { id: 'user-one' },
  indexJs: `export default { setup(ctx) { ctx.registerTool({ id: 'newtool', name: 'N', execute: async () => 1 }); } };`,
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'user-one'));
eq(env1.registry.get('user-one__newtool') != null, true, '新工具注册');
eq(env1.registry.get('user-one__ping'), undefined, '旧版独有工具被清扫');

section('清单级错误（新清单非法 → 沿用旧实例；首次遇到 → error 条目可见）');
writePlugin(path.join(root, 'skills'), 'user-one', {
  manifest: { id: 'user-one', apiVersion: 99 },
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'user-one'));
const u2 = env1.loader.listEntries().find((e) => e.id === 'user-one');
eq(u2.status, 'active', '新清单非法沿用旧实例');
writePlugin(path.join(root, 'skills'), 'fresh-bad', { manifest: { id: 'fresh-bad', apiVersion: 99 }, indexJs: GOOD });
await env1.loader.loadDir('skills', path.join(root, 'skills', 'fresh-bad'));
const fb = env1.loader.listEntries().find((e) => e.id === 'fresh-bad');
eq(fb.status, 'error', '首次装载非法清单 → error');
eq(fb.loadError.includes('apiVersion'), true, '错误指明 apiVersion');

section('禁用 = 回到无插件行为（硬约束 C-ext-02）');
// 前序测试把 user-one 的磁盘清单改坏过（apiVersion:99）——先写回好清单再测启停
writePlugin(path.join(root, 'skills'), 'user-one', { manifest: { id: 'user-one' }, indexJs: GOOD });
await env1.loader.setEnabled('user-one', false);
eq(env1.loader.isActive('user-one'), false, '禁用后 inactive');
eq(env1.registry.get('user-one__newtool'), undefined, '工具被摘除');
eq(env1.config.get().skills['user-one'].enabled, false, '开关写进 config.skills');
await env1.loader.setEnabled('user-one', true);
eq(env1.loader.isActive('user-one'), true, '重新启用激活');

section('pruneMissing（目录删除 → 卸载；失败条目不算已删除）');
fs.rmSync(path.join(root, 'skills', 'bom-one'), { recursive: true, force: true });
env1.loader.pruneMissing();
eq(env1.loader.isLoaded('bom-one'), false, '目录没了 → 卸载');
ok(env1.loader.isLoaded('fresh-bad'), '失败条目（error）不被 prune（不算已删除）');

section('hooks / prompt 片段 / promptSections 排序');
writePlugin(path.join(root, 'skills'), 'hooked', {
  manifest: { id: 'hooked', prompt: { sections: [{ id: 's1', content: 'A', priority: 30 }] } },
  indexJs: `export default { setup(ctx) {
    ctx.hooks.on('before-tool', () => ({ block: false }));
    ctx.prompt.add({ id: 's2', render: () => 'B', priority: 90 });
  } };`,
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'hooked'));
const hooks = env1.loader.hooksOf('before-tool');
eq(hooks.length, 1, 'hook 注册成功');
const secs = env1.loader.promptSections();
const s2 = secs.find((s) => s.id === 's2');
const s1 = secs.find((s) => s.id === 's1');
ok(s2 && s1 && secs.indexOf(s2) < secs.indexOf(s1), 'priority 90 排在 30 前面（降序）');

section('仓库 hello 捆绑插件（SDK 活样例；默认停用）');
const envHello = makeEnv({ roots: root });
// 把仓库 bundled/hello 链接进临时 roots
fs.cpSync(path.resolve(import.meta.dirname, '..', 'bundled', 'hello'), path.join(root, 'bundled', 'hello-copy-into'), { recursive: true });
fs.renameSync(path.join(root, 'bundled', 'hello-copy-into'), path.join(root, 'bundled', 'hello'));
await envHello.loader.loadAll({ reason: 'test' });
const helloEntry = envHello.loader.listEntries().find((e) => e.id === 'hello');
eq(helloEntry.status, 'disabled', 'hello 默认停用（enabledByDefault:false）');
await envHello.loader.setEnabled('hello', true);
const hello2 = envHello.loader.listEntries().find((e) => e.id === 'hello');
eq(hello2.status, 'active', '启用后激活');
ok(envHello.registry.get('hello_say'), '捆绑裸 id hello_say 注册');
const r = await envHello.registry.invoke('hello_say', { name: '测试' }, {});
eq(r.ok, true, 'hello_say 可调用');
eq(r.result.text, '你好，测试', '返回问候语（settings 默认 greeting=你好）');

section('configSchema 声明过滤（schema 外的键读不到——DSH §4.2）');
writePlugin(path.join(root, 'skills'), 'cfg-reader', {
  manifest: { id: 'cfg-reader', configSchema: { visible: { type: 'string' } }, settings: { visible: 'V', hidden: 'H' } },
  indexJs: `export default { setup(ctx) {
    globalThis.__cfgTest = { visible: ctx.config.get('visible'), hidden: ctx.config.get('hidden') };
  } };`,
});
await env1.loader.loadDir('skills', path.join(root, 'skills', 'cfg-reader'));
eq(globalThis.__cfgTest.visible, 'V', '声明过的键可读');
eq(globalThis.__cfgTest.hidden, undefined, '未声明的键读不到');

summary('08-loader');
