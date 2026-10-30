// The public extension editor supports structured array/object schemas. Verify
// the real MCP manifest and HTTP settings path preserve the server array.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { registerConsoleRoutes } from '../src/console/routes.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-mcp-settings-92-'));
for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, name));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.cpSync(path.resolve(import.meta.dirname, '../bundled/mcp-bridge'), path.join(root, 'bundled/mcp-bridge'), { recursive: true });
const probeDir = path.join(root, 'plugins/settings-probe'); fs.mkdirSync(probeDir);
fs.writeFileSync(path.join(probeDir, 'plugin.json'), JSON.stringify({ id: 'settings-probe', kind: 'plugin', entry: 'index.js',
  configSchema: { label: { type: 'string' }, options: { type: 'object' }, apiKey: { type: 'string', secret: true } },
  settings: { label: 'default', options: {}, apiKey: '' },
}));
fs.writeFileSync(path.join(probeDir, 'index.js'), 'export default {setup(){}};');
const log = { info() {}, warn() {}, error() {}, child() { return this; }, recent: () => [] };
const dataDir = path.join(root, 'data'), globalSecret = 'QA_ONLY_GLOBAL_SECRET', ownSecret = 'QA_ONLY_PLUGIN_SECRET';
let config, permissions, capability, registry, scheduler, loader, http, port;
async function start() {
  config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
  if (!fs.existsSync(config.file)) config.update({ server: { port: 0, token: 'mcp-settings-qa' }, api: { apiKey: globalSecret },
    skills: { 'settings-probe': { enabled: false, installedVersion: 'probe-v1', metadata: { tag: 'keep-probe' },
      settings: { label: 'old', options: { old: true }, apiKey: ownSecret } } },
  });
  permissions = createPermissions({ dataDir, log }); capability = createCapabilityRegistry({ log });
  registry = createToolRegistry({ log, permissions, capabilities: capability }); scheduler = createScheduler({ log });
  loader = createPluginLoader({ appRoot: root, log, config, permissions, registry, capabilityRegistry: capability, scheduler, storage: createStorage({ dataDir, log }) });
  http = createHttpServer({ config, log, staticDir: root });
  registerConsoleRoutes(http, { appRoot: root, dataDir, log, config, permissions, capability, registry, loader, store: {}, sessions: { listSummaries: () => [] } });
  await loader.loadAll(); port = await http.listen();
}
async function stop() {
  const closingHttp = http; http = null;
  if (closingHttp) await closingHttp.close();
  loader?.stopAll(); permissions?.close(); scheduler?.stop();
}
const request = async (method, url, body) => {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'content-type': 'application/json', 'x-console-token': 'mcp-settings-qa' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
};
function disk() {
  const saved = JSON.parse(fs.readFileSync(config.file, 'utf8'));
  const noMarker = (node) => {
    if (!node || typeof node !== 'object') return;
    assert.equal(Object.hasOwn(node, '__replace__'), false, 'replacement marker never reaches persisted config');
    for (const value of Object.values(node)) noMarker(value);
  };
  noMarker(saved); assert.equal(saved.api.apiKey, globalSecret, 'unrelated global secret remains intact');
  assert.equal(saved.skills['settings-probe'].enabled, false);
  assert.equal(saved.skills['settings-probe'].installedVersion, 'probe-v1');
  assert.deepEqual(saved.skills['settings-probe'].metadata, { tag: 'keep-probe' });
  return saved;
}
try {
  await start();
  assert.equal(Object.hasOwn(config.get().skills, 'mcp-bridge'), false, 'bundled MCP starts without a stored skill entry');
  const listed = (await request('GET', '/api/skills')).data.skills.find((entry) => entry.id === 'mcp-bridge');
  assert.equal(listed.configSchema.servers.type, 'array'); assert.equal(listed.configSchema.servers.items.type, 'object');
  assert.deepEqual(listed.settings.servers, []);
  const servers = [{ id: 'offline', command: process.execPath, args: ['offline-test.mjs'], requestTimeoutMs: 2000 },
    { id: 'removed-later', command: process.execPath, args: ['unused.mjs'] }];
  let result = await request('POST', '/api/skills/mcp-bridge', { settings: { servers } });
  assert.equal(result.status, 200); assert.deepEqual(result.data.settings.servers, servers);
  assert.deepEqual(loader.hostEntry('mcp-bridge').ctx.config.get('servers'), servers);
  assert.deepEqual(capability.consume('mcp.tools').list(), [], 'saving settings does not spawn a server during setup');
  assert.deepEqual(disk().skills['mcp-bridge'].settings.servers, servers);
  result = await request('POST', '/api/skills/mcp-bridge', { settings: { servers: JSON.stringify(servers) } });
  assert.equal(result.status, 400, 'an editor must send the parsed array, not a JSON string');
  assert.deepEqual(config.get().skills['mcp-bridge'].settings.servers, servers, 'invalid form payload does not overwrite the valid config');
  config.update({ skills: { 'mcp-bridge': { enabled: true, installedVersion: 'mcp-v1', metadata: { tag: 'keep-mcp' } } } });
  const changed = [{ id: 'offline', command: process.execPath, args: ['changed.mjs'] }];
  result = await request('POST', '/api/skills/mcp-bridge', { settings: { servers: changed } });
  assert.equal(result.status, 200); assert.deepEqual(result.data.settings.servers, changed);
  assert.equal(Object.hasOwn(config.get().skills['mcp-bridge'].settings.servers[0], 'requestTimeoutMs'), false, 'array rewrite removes old object properties');
  let saved = disk(); assert.deepEqual(saved.skills['mcp-bridge'], { enabled: true, installedVersion: 'mcp-v1', metadata: { tag: 'keep-mcp' }, settings: { servers: changed } });
  for (const apiKey of ['', '******']) {
    result = await request('POST', '/api/skills/settings-probe', { settings: { label: 'changed', options: { only: 'new' }, apiKey } });
    assert.equal(result.status, 200); assert.equal(result.data.settings.apiKey, '******');
    assert.equal(JSON.stringify(result.data).includes(ownSecret), false); assert.equal(JSON.stringify(result.data).includes(globalSecret), false);
    saved = disk(); assert.equal(saved.skills['settings-probe'].settings.apiKey, ownSecret);
    assert.deepEqual(saved.skills['settings-probe'].settings.options, { only: 'new' }, 'object rewrite removes omitted properties');
  }
  result = await request('POST', '/api/skills/settings-probe', { settings: { label: 'omitted-key' } });
  assert.equal(result.status, 200); assert.equal(disk().skills['settings-probe'].settings.apiKey, ownSecret, 'omitted secret is preserved');
  await stop(); await start();
  assert.deepEqual(loader.hostEntry('mcp-bridge').ctx.config.get('servers'), changed, 'fresh loader reads saved server array after restart');
  assert.deepEqual(capability.consume('mcp.tools').list(), [], 'restart setup still does not start an OS process');
  saved = disk(); assert.equal(saved.skills['mcp-bridge'].installedVersion, 'mcp-v1'); assert.deepEqual(saved.skills['mcp-bridge'].metadata, { tag: 'keep-mcp' });
  assert.equal(saved.skills['settings-probe'].settings.apiKey, ownSecret);
  result = await request('POST', '/api/skills/mcp-bridge', { settings: { servers: [] } });
  assert.equal(result.status, 200); assert.deepEqual(result.data.settings.servers, []);
  result = await request('POST', '/api/skills/settings-probe', { clearSecrets: ['apiKey'] });
  assert.equal(result.status, 200); assert.equal(result.data.settings.apiKey, ''); assert.equal(disk().skills['settings-probe'].settings.apiKey, '');
  await stop(); await start(); saved = disk();
  assert.deepEqual(loader.hostEntry('mcp-bridge').ctx.config.get('servers'), [], 'empty array remains empty after restart');
  assert.equal(saved.skills['settings-probe'].settings.apiKey, '', 'explicit clear remains cleared after restart');
  assert.equal(saved.skills['mcp-bridge'].enabled, true); assert.equal(saved.skills['mcp-bridge'].installedVersion, 'mcp-v1');
  assert.deepEqual(saved.skills['mcp-bridge'].metadata, { tag: 'keep-mcp' });
  console.log('✓ 92 MCP settings: first save / rewrite / property removal / empty array / invalid type / secret and metadata preservation / explicit clear / disk without markers / two fresh loader restarts; real HTTP, no OS process');
} finally {
  await stop();
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
}
