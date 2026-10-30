// Validate the generated packages in a separate temporary app, never the active QA app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractZipSafely } from '../../../bundled/market/client.js';
import { createMcpProcessAdapter } from '../../../bundled/mcp-bridge/adapter.js';
import { createPluginLoader } from '../../../src/kernel/plugin-loader.js';
import { createConfig, buildDefaultConfig } from '../../../src/kernel/config.js';
import { createPermissions } from '../../../src/kernel/permissions.js';
import { createToolRegistry } from '../../../src/kernel/tools.js';
import { createCapabilityRegistry } from '../../../src/kernel/capability.js';
import { createScheduler } from '../../../src/kernel/scheduler.js';
import { createStorage } from '../../../src/kernel/storage.js';
import { createSdkAccess } from '../../../src/kernel/sdk-services.js';
import { createPanelAdapters } from '../../../src/console/panel-adapters.js';
import { createServiceHost } from '../../../src/kernel/service-host.js';
import { safeFetch } from '../../../src/kernel/safe-fetch.js';
import { Bus } from '../../../src/kernel/bus.js';

const outputDir = path.resolve(process.argv[2] ?? '.qa-local/headed-20261011/extension-fixtures');
const fixture = JSON.parse(fs.readFileSync(path.join(outputDir, 'fixture-manifest.json'), 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-headed-extensions-'));
const log = { info() {}, warn() {}, error() {}, child() { return this; } };
for (const dir of ['bundled', 'plugins', 'skills', 'extract']) fs.mkdirSync(path.join(root, dir));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.cpSync(path.resolve(import.meta.dirname, '../../../bundled/compat-04'), path.join(root, 'bundled/compat-04'), { recursive: true });
const dataDir = path.join(root, 'data'), bus = new Bus(log);
const config = createConfig({ dataDir, log, defaults: buildDefaultConfig() }); config.load();
const permissions = createPermissions({ dataDir, log, bus });
permissions.onAsk((ask) => permissions.resolveAsk(ask.id, 'deny'));
const capabilities = createCapabilityRegistry({ log, selection: () => config.get().qaSelection ?? {} });
const registry = createToolRegistry({ log, permissions, bus, capabilities });
const scheduler = createScheduler({ log });
let loader;
const deliveries = [];
const sdk = createSdkAccess({ config, permissions, loaderOf: () => loader, bus,
  facets: { 'data.messages': { recent: (chatKey) => [{ chatKey, text: '合成本地消息' }] } },
});
loader = createPluginLoader({ appRoot: root, log, config, permissions, registry, capabilityRegistry: capabilities, scheduler, bus,
  storage: createStorage({ dataDir, log }), sdkHost: { ...sdk,
    fetch: (url, init) => safeFetch(url, { ...init, allowPrivate: true, expectBinary: true }),
    send: (chatKey, segments) => { deliveries.push({ chatKey, segments }); return [{ msgId: deliveries.length }]; },
  },
});
const panels = createPanelAdapters({ loader, permissions, registry, config, log });
const serviceReceipts = new Map();
const services = createServiceHost({ capability: capabilities, config, bus, log,
  authorize: async (name, candidate, { recheck } = {}) => {
    const entry = loader.hostEntry(candidate.ownerId);
    for (const scope of capabilities.options(name, candidate.ownerId)?.scopes ?? []) {
      const key = candidate.ownerId + '\0' + scope;
      if (recheck) { if (!serviceReceipts.get(key)?.isValid()) return false; }
      else {
        const receipt = await permissions.checkAsync(candidate.ownerId, scope, { fingerprint: entry?.fingerprint });
        if (receipt.decision !== 'allow') return false;
        serviceReceipts.set(key, receipt);
      }
    }
    return true;
  },
});
const adapter = createMcpProcessAdapter({ log, requestTimeoutMs: 300 });
const grant = (id, scope) => assert.equal(permissions.setOverride(id, scope, 'allow', { fingerprint: loader.hostEntry(id).fingerprint }), true);
const invoke = async (id, args = {}) => {
  const result = await registry.invoke(id, args); assert.equal(result.ok, true, result.error); return result.result;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  for (const item of fixture.packages.filter((item) => path.basename(item.zipPath) !== 'qa-panel-v2.zip')) {
    const stage = extractZipSafely(fs.readFileSync(item.zipPath), path.join(root, 'extract'));
    fs.cpSync(stage, path.join(root, item.kind === 'skill' ? 'skills' : 'plugins', item.id), { recursive: true });
  }
  const traversal = fixture.invalid.find((item) => item.zipPath.endsWith('bad-traversal.zip'));
  assert.throws(() => extractZipSafely(fs.readFileSync(traversal.zipPath), path.join(root, 'extract')), /路径|非法|越界/);
  assert.equal(fs.existsSync(path.join(root, 'qa-escape.txt')), false);
  await loader.loadAll();
  for (const id of ['qa-panel', 'qa-skill', 'qa-provider-a', 'qa-provider-b', 'qa-legacy']) assert.equal(loader.isActive(id), true, id + ' must load');
  assert.equal((await invoke('qa-panel__echo', { text: 'fixture' })).version, 'v1');
  assert.equal((await invoke('qa-skill__echo', { text: 'fixture' })).owner, 'qa-skill');
  assert.equal((await invoke('qa-legacy__echo', { text: 'fixture' })).legacy, true);
  assert.ok(loader.promptSections().some((section) => section.id === 'qa-skill-context'));
  assert.deepEqual(panels.listPanels(), []);
  grant('qa-panel', 'ui.panel');
  let panel = panels.listPanels()[0]; assert.equal(panel.id, 'qa_panel');
  assert.equal(panels.getConfig(panel.id, panel.generation).hasApiKey, true);
  assert.equal(panels.getConfig(panel.id, panel.generation).apiKey, undefined);
  assert.equal((await panels.call(panel.id, panel.generation, 'qa-panel__echo', { text: 'panel' })).result.text, 'panel');
  assert.equal((await registry.invoke('qa-panel__send', { chatKey: fixture.chatKey })).ok, false);
  grant('qa-panel', 'qq.send'); grant('qa-panel', 'data.sessions.read'); grant('qa-panel', 'net.outbound');
  await invoke('qa-panel__send', { chatKey: fixture.chatKey, text: 'local only' }); assert.equal(deliveries.length, 1);
  assert.equal((await invoke('qa-panel__read', { chatKey: fixture.chatKey }))[0].text, '合成本地消息');
  assert.equal((await invoke('qa-panel__fetch')).status, 200);
  assert.equal((await registry.invoke('qa-panel__raw', {})).ok, false);
  await services.start(); assert.equal(services.get('web.search'), undefined);
  grant('qa-provider-a', 'net.outbound'); grant('qa-provider-b', 'net.outbound');
  await services.refresh(); assert.equal((await services.get('web.search').search('test')).provider, 'qa-provider-a');
  config.update({ qaSelection: { 'web.search': 'qa-provider-b', 'qa.color': 'qa-provider-b' } });
  await services.refresh(); assert.equal((await services.get('web.search').search('test')).provider, 'qa-provider-b');
  assert.equal((await invoke('qa-panel__provider')).owner, 'qa-provider-b');
  await loader.setEnabled('qa-provider-b', false); await services.refresh();
  assert.equal((await services.get('web.search').search('test')).provider, 'qa-provider-a');
  const oldGeneration = panel.generation;
  fs.copyFileSync(fixture.hotReload.source, path.join(root, 'plugins/qa-panel/index.js'));
  await loader.loadDir('plugins', path.join(root, 'plugins/qa-panel'));
  assert.equal((await invoke('qa-panel__echo', {})).version, 'v2');
  assert.throws(() => panels.getConfig(panel.id, oldGeneration), /未授权|重载/);
  grant('qa-panel', 'ui.panel'); panel = panels.listPanels()[0]; assert.notEqual(panel.generation, oldGeneration);
  await loader.setEnabled('qa-panel', false); assert.deepEqual(panels.listPanels(), []);
  const namespace = createStorage({ dataDir, log }).namespace('qa-panel'); const ticks = namespace.get('ticks');
  await pause(1100); assert.equal(namespace.get('ticks'), ticks, 'disabled scheduler does not keep ticking');
  console.log('✓ Offline ZIP / real loader: tools, panel authorization, secrets, sends, HTTP, store, provider switch, hot reload, stop');

  for (const mode of ['normal', 'malformed', 'hang']) {
    const handle = adapter.startServer({ command: process.execPath, args: [fixture.mcpServerPath, mode], requestTimeoutMs: 300 });
    try {
      assert.equal((await handle.request('initialize', {})).serverInfo.name, 'Offline QA MCP');
      if (mode === 'normal') {
        assert.equal((await handle.request('tools/list', {})).tools[0].name, 'qa_echo');
        assert.equal((await handle.request('tools/call', { name: 'qa_echo', arguments: { text: 'stdio' } })).content[0].text, 'MCP 离线回声：stdio');
      } else await assert.rejects(handle.request('tools/list', {}), mode === 'hang' ? /timeout/ : /protocol/);
    } finally { handle.stop(); }
  }
  console.log('✓ Actual local Node stdio MCP: initialize / list / call, invalid JSON and bounded timeout');
} finally {
  adapter.stopAll(); await services.stop(); loader.stopAll(); permissions.close(); scheduler.stop();
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
}
