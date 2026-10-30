import fs from 'node:fs';
import path from 'node:path';
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { buildDefaultConfig, createConfig } from '../src/kernel/config.js';
import { Bus } from '../src/kernel/bus.js';

const root = mktmp('qqa-m4-loader-');
for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, name), { recursive: true });
const dataDir = mktmp('qqa-m4-data-');
const log = { info() {}, warn() {}, error() {}, child() { return this; } };
const bus = new Bus(log); const caps = createCapabilityRegistry({ log }); const perms = createPermissions({ log });
const registry = createToolRegistry({ log, bus, permissions: perms, capabilities: caps });
const scheduler = createScheduler({ log }); const storage = createStorage({ dataDir, log });
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log }); config.load();
const fetchCalls = [];
caps.register('compat04.http', 'kernel', {
  fetchFor: async (url, init, detail) => { fetchCalls.push({ url, init, detail }); return new Response(null, { status: 204, headers: { 'x-fixture': 'ok' } }); },
});
const loader = createPluginLoader({
  log, bus, appRoot: root, registry, capabilityRegistry: caps, permissions: perms, scheduler, storage, config,
});
caps._setActiveProbe(loader.isActive);
// 管理员对 fixture 首次 setup 网络请求显式同意一次；清单本身不提供授权。
perms.onAsk((request) => {
  if (request.pluginId === 'legacy-fixture' && request.scope === 'net.outbound') perms.resolveAsk(request.id, 'once');
});

function plugin(rootKind, id, manifest, source) {
  const dir = path.join(root, rootKind, id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, ...manifest }));
  fs.writeFileSync(path.join(dir, 'index.js'), source); return dir;
}

plugin('bundled', 'compat-04', { kind: 'plugin' }, `export default { setup(ctx) { ctx.registerCapability('compat-04.createSkillApi', async ({targetCtx, legacy}) => { const response = await targetCtx.capability('compat04.http').fetchFor('https://example.test/', {}, {pluginId: targetCtx.id, kind: 'user'}); globalThis.__legacyFetchStatus = response.status; targetCtx.registerTool({id:'legacy_ping', name:'Legacy Ping', execute: legacy.ping}); }); } };`);
plugin('skills', 'legacy-fixture', { kind: 'skill', compat: '04', permissions: ['net.outbound'] }, `export default { ping() { return 'pong'; } };`);

section('legacy marker 自动交给 compat-04');
await loader.loadAll({ reason: 'm4-fixture' });
eq(loader.isActive('compat-04'), true, 'compat-04 active');
eq(loader.isActive('legacy-fixture'), true, 'legacy fixture active');
const tool = registry.get('legacy-fixture__legacy_ping');
ok(Boolean(tool), 'legacy tool registered');
eq(tool?.ownerId, 'legacy-fixture', 'legacy tool owner tracked');
const legacyApi = loader.listEntries().find((entry) => entry.id === 'legacy-fixture');
eq(Boolean(legacyApi), true, 'legacy entry 可见');
eq(fetchCalls.length, 1, '旧 API fetch 走真实 compat adapter');
eq(fetchCalls[0]?.detail?.authorized, true, '旧 API HTTP 经过目标插件的授权门');
eq(fetchCalls[0]?.detail?.pluginId, 'legacy-fixture', '旧 API HTTP 绑定目标插件身份');


section('缺 compat provider 时 fail-closed');
const root2 = mktmp('qqa-m4-no-compat-');
for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root2, name), { recursive: true });
const loader2 = createPluginLoader({ log, bus, appRoot: root2, registry: createToolRegistry({ log, bus, permissions: perms, capabilities: caps }), capabilityRegistry: caps, permissions: perms, scheduler, storage, config });
caps._setActiveProbe(loader2.isActive);
const legacyDir = path.join(root2, 'skills', 'legacy-only'); fs.mkdirSync(legacyDir, { recursive: true });
fs.writeFileSync(path.join(legacyDir, 'skill.json'), JSON.stringify({ id: 'legacy-only', apiVersion: 0 }));
fs.writeFileSync(path.join(legacyDir, 'index.js'), `export default { ping() { return 'pong'; } };`);
await loader2.loadAll({ reason: 'm4-no-compat' });
eq(loader2.listEntries().find((entry) => entry.id === 'legacy-only')?.status, 'error', '缺 compat provider 时不激活');

summary('44-m4-loader-assembly');
