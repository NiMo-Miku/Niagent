// 308 · 插件声明式配置页：manifest configPage → 侧边栏用户面板 → 独立配置写回线路。
// 真 loader + 真 panel-adapters 路由 + 真 config 存取；无浏览器、无外部服务。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKernel } from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-configpage-308-'));
const isolation = isolateConsoleFixture(dataDir, '308');
fs.writeFileSync(path.join(isolation.appRoot, 'package.json'), JSON.stringify({ type: 'module' }));
fs.cpSync(new URL('../src', import.meta.url), path.join(isolation.appRoot, 'src'), { recursive: true });

const MANIFEST = {
  id: 'config-page', name: '配置页探针', version: '0.0.1', apiVersion: 1, kind: 'plugin',
  description: '声明式配置页测试插件', enabledByDefault: true, entry: 'index.js', permissions: ['ui.panel'],
  configPage: { title: '配置页探针' },
  configSchema: {
    greeting: { type: 'string', label: '问候', default: '你好' },
    retries: { type: 'number', label: '重试', default: 1 },
    strict: { type: 'boolean', label: '严格', default: false },
    apiKey: { type: 'string', label: '密钥', secret: true },
  },
  settings: { greeting: '你好', retries: 1, strict: false },
};
const INDEX_JS = `export default {
  setup(ctx) {
    ctx.registerTool({
      id: 'dump', name: '读取自身配置', description: '返回插件内看到的配置',
      params: { type: 'object', properties: {} }, scopes: [],
      execute: async () => ({ ok: true, greeting: ctx.config.get('greeting'), retries: ctx.config.get('retries'),
        strict: ctx.config.get('strict'), apiKey: ctx.config.get('apiKey') ?? null }),
    });
    ctx.registerTool({
      id: 'try_conflict', name: '尝试冲突注册', description: '运行时注册与声明式 configPage 同 id 的面板',
      params: { type: 'object', properties: {} }, scopes: [],
      execute: async () => {
        try { await ctx.ui.panel.register({ id: 'config-page_config', title: '冲突面板', entry: 'index.html' }); return { ok: true, conflict: '' }; }
        catch (error) { return { ok: true, conflict: String(error.message) }; }
      },
    });
  },
};`;
const pluginDir = path.join(isolation.appRoot, 'plugins', 'config-page');
fs.mkdirSync(path.join(pluginDir, 'ui'), { recursive: true });
fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(MANIFEST, null, 2));
fs.writeFileSync(path.join(pluginDir, 'index.js'), INDEX_JS);
fs.writeFileSync(path.join(pluginDir, 'ui', 'index.html'), '<!doctype html><title>config-page 308</title><h1 id="probe308">配置页探针 308</h1><script type="module" src="./probe.js"></script>');
fs.writeFileSync(path.join(pluginDir, 'ui', 'probe.js'), 'import {ctx} from "/panels/panel-client.js";\nwindow.probe308Config = () => ctx.getConfig();\n');

const token = 'configpage308-console';
const kernel = createKernel({
  appRoot: isolation.appRoot, env: isolation.env, headless: true,
  fetchImpl: (...args) => fetch(...args),
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ ok: true }), updateCheck: async () => ({ ok: true, current: '0.5.0', latest: '0.5.0', hasUpdate: false }) },
});
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false } });
kernel.loader.startWatchers = () => {};

let base = '';
const api = async (method, pathname, body) => {
  const response = await fetch(`${base}${pathname}`, {
    method, headers: { 'x-console-token': token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
let port = 0, failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  port = await kernel.start();
  base = isolation.allowOrigin(`http://127.0.0.1:${port}`);

  const dumpTool = 'config-page__dump';

  // 授权 ui.panel（走真实授权路由，含指纹确认）
  const auth = await api('GET', '/api/plugins/config-page/permissions');
  assert.equal(auth.status, 200, JSON.stringify(auth));
  const grant = await api('POST', '/api/plugins/config-page/permissions', { scope: 'ui.panel', value: 'allow', fingerprint: auth.body.fingerprint, confirm: true });
  check('授权: ui.panel 经真实授权路由放行', grant.status === 200, JSON.stringify(grant.body).slice(0, 120));

  const list = await api('GET', '/api/panels');
  const panel = (list.body?.panels ?? []).find((p) => p.id === 'config-page_config');
  check('列出: 声明式 configPage 出现在 /api/panels', Boolean(panel), JSON.stringify(list.body?.panels?.map((p) => p.id)));
  check('列出: kind=user 且绑定 ownerId/代际', panel?.kind === 'user' && panel?.ownerId === 'config-page' && /^[a-f0-9-]{36}$/.test(panel?.generation ?? ''), JSON.stringify(panel).slice(0, 120));
  check('标题: 未显式给 title 时回退插件名', panel?.title === '配置页探针', String(panel?.title));

  const page = await fetch(`${base}/panels/u/config-page_config/${panel.generation}/index.html`, { headers: { 'x-console-token': token } });
  const pageText = await page.text();
  check('资产: 配置页 HTML 由专属代际路径伺服', page.status === 200 && pageText.includes('配置页探针 308'), String(page.status));
  const traversal = await fetch(`${base}/panels/u/config-page_config/${panel.generation}/..%2Findex.js`, { headers: { 'x-console-token': token } });
  check('资产: 路径穿越被拒', traversal.status !== 200, String(traversal.status));

  const read = await api('POST', '/api/panels/config-page_config/config', { generation: panel.generation, key: 'greeting' });
  check('读取: ctx.getConfig 命中 settings 默认值', read.status === 200 && read.body === '你好', JSON.stringify(read.body));

  const save = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { greeting: '新值', retries: 3, strict: true, apiKey: 'sk-secret-308' } });
  check('写回: 合法补丁保存成功', save.status === 200 && save.body?.ok === true, JSON.stringify(save.body).slice(0, 120));
  check('写回: 密钥读回视图只有 hasApiKey', save.body?.config?.apiKey === undefined && save.body?.config?.hasApiKey === true, JSON.stringify(save.body?.config));
  const dumped = await api('POST', '/api/panels/config-page_config/call', { generation: panel.generation, tool: dumpTool, args: {} });
  check('写回: 插件内 ctx.config 立即可见新值(含密钥原文)', dumped.body?.result?.greeting === '新值' && dumped.body?.result?.apiKey === 'sk-secret-308' && dumped.body?.result?.retries === 3 && dumped.body?.result?.strict === true, JSON.stringify(dumped.body?.result));

  const keep = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { hasApiKey: true } });
  const dumpedKeep = await api('POST', '/api/panels/config-page_config/call', { generation: panel.generation, tool: dumpTool, args: {} });
  check('密钥: hasApiKey:true 保留现值', keep.status === 200 && dumpedKeep.body?.result?.apiKey === 'sk-secret-308', JSON.stringify(dumpedKeep.body?.result));
  const clear = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { hasApiKey: false } });
  const dumpedClear = await api('POST', '/api/panels/config-page_config/call', { generation: panel.generation, tool: dumpTool, args: {} });
  check('密钥: hasApiKey:false 清除现值', clear.status === 200 && dumpedClear.body?.result?.apiKey === null, JSON.stringify(dumpedClear.body?.result));

  const bad1 = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { unknown: 'x' } });
  const bad2 = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { retries: 'abc' } });
  const bad3 = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { greeting: 123 } });
  const bad4 = await api('POST', '/api/panels/config-page_config/config/save', { generation: panel.generation, patch: { apiKey: '' } });
  check('校验: 未声明键/错类型/空密钥全部拒绝', [bad1, bad2, bad3, bad4].every((r) => r.status === 400), [bad1, bad2, bad3, bad4].map((r) => r.status).join(','));

  const stale = await api('POST', '/api/panels/config-page_config/config/save', { generation: '00000000-0000-4000-8000-000000000000', patch: { greeting: 'x' } });
  check('安全: 代际不匹配拒绝写回', stale.status === 403, String(stale.status));

  const conflict = await api('POST', '/api/panels/config-page_config/call', { generation: panel.generation, tool: 'config-page__try_conflict', args: {} });
  check('冲突: 运行时注册同 id 被判重复(声明式占位生效)', conflict.status === 200 && /重复/.test(conflict.body?.result?.conflict ?? ''), JSON.stringify(conflict.body?.result));
} finally {
  await kernel.stop().catch(() => {});
  try { isolation.restore?.(); } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `✗ 308：${failed} 项失败` : '✓ 308：声明式配置页端到端全部通过');
process.exit(failed ? 1 : 0);
