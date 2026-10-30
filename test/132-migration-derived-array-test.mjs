// Real importer, config load/save and automatic kernel migration into owned
// temporary directories. Empty bundled directories and a no-op transport are
// explicit test seams, never product defaults or a substitute for headed QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { migrateFrom04, detectMigrationSource } from '../src/kernel/migrator.js';
import { createConfig, buildDefaultConfig, sanitizeConfigForApi } from '../src/kernel/config.js';
import { createKernel } from '../src/kernel/kernel.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-migration132-'));
const source = path.join(root, 'legacy04'), target = path.join(root, 'direct-target');
const token = 'qa-only-console-132';
const legacy = {
  api: { model: 'qa-model-a', baseUrl: 'http://127.0.0.1:1/qa-unreachable/v1', apiKey: 'QA132_API_KEY', hasApiKey: true, thinking: true, stream: true },
  server: { token, hasToken: true },
  providers: [
    { id: 'p-a', name: 'Provider A', apiKey: 'QA132_PROVIDER_A', hasApiKey: true, enabled: true,
      models: [{ id: 'qa-model-a', apiKey: 'QA132_MODEL_KEY', hasApiKey: true, metadata: { modes: ['first', 'second'], grid: [[{ hasToken: false, token: 'QA132_GRID_TOKEN', count: 7 }], [], [null, false, 0]] } }],
      credentials: [{ password: 'QA132_NESTED_PASSWORD', hasPassword: true, vendor: 'keep-vendor' }],
    },
    { id: 'p-b', name: 'Provider B', apiKey: 'QA132_PROVIDER_B', hasApiKey: false, models: ['qa-model-b2', 'qa-model-b1'], enabled: false },
    { id: 'p-empty', name: 'Empty credential', apiKey: '', hasApiKey: true, models: [] },
  ],
  dshProviderKeys: { 'p-a': 'QA132_CATALOG_KEY' },
  webSearch: { enabled: false, providers: [{ id: 'search-a', apiKey: 'QA132_SEARCH_KEY', hasApiKey: true, options: [{ accessToken: 'QA132_SEARCH_TOKEN', hasAccessToken: true, enabled: false }] }] },
  persona: { botName: 'QA132 Identity', roleText: 'QA132_ROLE' },
  unknownBusiness: { matrix: [[{ hasToken: true, token: 'QA132_UNKNOWN_TOKEN', hash: 'keep-hash', haslowercase: 'keep-lowercase', hasX_y: 'keep-non-matching-key', has2: 17 }], null, [], false, 0, 'hasApiKey'], order: ['Z', 'A', 'Z'] },
  tools: { videoEnabled: false }, budget: { obsolete: true }, telemetry: { enabled: false },
};
let kernel, passed = 0;
const log = { info() {}, warn() {}, error() {} };
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); };
const snapshot = dir => {
  const entries = {};
  const walk = (current, relative = '') => { for (const item of fs.readdirSync(current, { withFileTypes: true })) {
    const file = path.join(current, item.name), name = path.join(relative, item.name);
    if (item.isDirectory()) walk(file, name);
    else { const bytes = fs.readFileSync(file); entries[name] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; }
  } };
  walk(dir); return entries;
};
const noDerived = (value, location = 'config') => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, /^has[A-Z][A-Za-z0-9]*$/, `derived flag persisted at ${location}.${key}`);
    noDerived(child, `${location}.${key}`);
  }
};
const businessPreserved = cfg => {
  assert.deepEqual(cfg.providers.map(provider => provider.id), ['p-a', 'p-b', 'p-empty']);
  assert.deepEqual(cfg.providers.map(provider => provider.apiKey), ['QA132_PROVIDER_A', 'QA132_PROVIDER_B', '']);
  assert.equal(cfg.api.apiKey, legacy.api.apiKey); assert.equal(cfg.server.token, token);
  assert.equal(cfg.providers[0].models[0].apiKey, 'QA132_MODEL_KEY'); assert.equal(cfg.providers[0].credentials[0].password, 'QA132_NESTED_PASSWORD');
  assert.deepEqual(cfg.providers[0].models[0].metadata.grid, [[{ token: 'QA132_GRID_TOKEN', count: 7 }], [], [null, false, 0]]);
  assert.deepEqual(cfg.providers[1].models, ['qa-model-b2', 'qa-model-b1']); assert.deepEqual(cfg.providers[2].models, []);
  assert.equal(cfg.providers[1].enabled, false); assert.equal(cfg.dshProviderKeys['p-a'], 'QA132_CATALOG_KEY');
  assert.deepEqual(cfg.webSearch.providers[0].options, [{ accessToken: 'QA132_SEARCH_TOKEN', enabled: false }]);
  assert.deepEqual(cfg.unknownBusiness, { matrix: [[{ token: 'QA132_UNKNOWN_TOKEN', hash: 'keep-hash', haslowercase: 'keep-lowercase', hasX_y: 'keep-non-matching-key', has2: 17 }], null, [], false, 0, 'hasApiKey'], order: ['Z', 'A', 'Z'] });
};
try {
  write(path.join(source, 'config.json'), '\uFEFF' + JSON.stringify(legacy, null, 2));
  write(path.join(source, 'messages', 'group_13201.json'), { chatKey: 'group:13201', nextLocalId: 2, messages: [{ id: 1, mid: -13201, senderId: '54321', senderName: 'QA132', ts: 1, text: 'QA132_ARCHIVE', self: false, read: true, atMe: null, media: [] }] });
  const before = snapshot(source); fs.mkdirSync(target);
  assert.equal(detectMigrationSource(target, source).eligible, true);
  const report = migrateFrom04({ source, targetDataDir: target, log });
  assert.equal(report.sections.config.ok, true); assert.deepEqual(report.errors, []);
  const migrated = json(path.join(target, 'config.json'));
  console.log(`· Imported provider array derived field present: ${Object.hasOwn(migrated.providers[0], 'hasApiKey')}`);
  noDerived(migrated); businessPreserved(migrated);
  assert.equal(Object.hasOwn(migrated.api, 'stream'), false); assert.equal(Object.hasOwn(migrated, 'budget'), false);
  assert.deepEqual(snapshot(source), before); passed++;
  console.log('✓ Actual importer removes derived keys through objects, arrays and nested arrays, preserving credentials and business values');

  const firstBytes = fs.readFileSync(path.join(target, 'config.json'));
  migrateFrom04({ source, targetDataDir: target, log });
  assert.deepEqual(fs.readFileSync(path.join(target, 'config.json')), firstBytes); assert.deepEqual(snapshot(source), before); passed++;
  console.log('✓ Repeated imports preserve array order, empty arrays, duplicate values and byte-identical source');

  const preview = path.join(root, 'dry-run-target'); fs.mkdirSync(preview);
  const previewReport = migrateFrom04({ source, targetDataDir: preview, log, dryRun: true });
  assert.equal(previewReport.sections.config.ok, true); assert.deepEqual(fs.readdirSync(preview), []); assert.deepEqual(snapshot(source), before); passed++;
  console.log('✓ Dry-run leaves both target and the original source untouched');

  const config = createConfig({ dataDir: target, defaults: buildDefaultConfig(), log }); config.load();
  noDerived(config.get()); businessPreserved(config.get()); assert.equal(config.get().api.thinkingMode, 'on');
  const publicView = sanitizeConfigForApi(config.get());
  assert.equal(publicView.providers[0].hasApiKey, true); assert.equal(publicView.providers[2].hasApiKey, false);
  assert.equal(Object.hasOwn(publicView.providers[0], 'apiKey'), false); assert.equal(config.get().providers[0].apiKey, 'QA132_PROVIDER_A');
  const providerPatch = structuredClone(config.get().providers);
  delete providerPatch[0].apiKey; providerPatch[0].hasApiKey = true; providerPatch[0].name = 'Provider A non-secret edit';
  config.update({ providers: providerPatch, persona: { customRules: 'QA132_NORMAL_SAVE' } });
  const saved = json(config.file); noDerived(saved); businessPreserved(saved); assert.equal(saved.providers[0].name, 'Provider A non-secret edit');
  assert.deepEqual(snapshot(source), before); passed++;
  console.log('✓ Real config load, API sanitization and save regenerate presence flags without persisting them or losing omitted provider credentials');

  const appRoot = path.join(root, 'empty-bundle-kernel-app'), kernelData = path.join(root, 'automatic-kernel-target');
  for (const dir of ['bundled', 'plugins', 'skills', 'ui/shell']) fs.mkdirSync(path.join(appRoot, dir), { recursive: true });
  write(path.join(appRoot, 'ui/shell/index.html'), '<!doctype html><title>QA132 owned migration fixture</title>');
  let transportsStarted = 0, transportsStopped = 0;
  kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: kernelData, QQ_AGENT_PROFILE: '107', QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: source }, headless: true,
    transport: { id: 'qa132-noop', actions: {}, start() { transportsStarted++; }, stop() { transportsStopped++; }, status: () => ({ connected: false, synthetic: true }) },
    fetchImpl: async () => { throw new Error('QA132 forbids provider/external HTTP'); }, priceUpdates: { refresh: async () => ({ ok: true, source: 'qa132-no-network' }), resolve: () => null },
  });
  kernel.log.setLevel('error');
  const port = await kernel.start(); assert.equal(transportsStarted, 1);
  assert.equal(kernel.loader.listEntries().length, 0, 'empty bundles are an explicit local test fixture, not a production change');
  noDerived(kernel.config.get()); businessPreserved(kernel.config.get()); assert.equal(kernel.config.get().api.thinkingMode, 'on');
  noDerived(json(path.join(kernelData, 'config.json')));
  const api = async (method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`, { method, headers: { 'x-console-token': token, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200); return response.json();
  };
  const uiConfig = await api(); assert.equal(uiConfig.providers[0].hasApiKey, true); assert.equal(uiConfig.providers[2].hasApiKey, false); assert.equal(Object.hasOwn(uiConfig.providers[0], 'apiKey'), false);
  await api('POST', { persona: { customRules: 'QA132_POST_MIGRATION_UI_SAVE' } });
  noDerived(json(path.join(kernelData, 'config.json'))); businessPreserved(kernel.config.get()); assert.deepEqual(snapshot(source), before);
  assert.equal(fs.existsSync(path.join(kernelData, 'qq-agent.lock')), true);
  await kernel.stop(); assert.equal(transportsStopped, 1); assert.equal(fs.existsSync(path.join(kernelData, 'qq-agent.lock')), false);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/api/config`, { signal: AbortSignal.timeout(1000) }));
  assert.deepEqual(snapshot(source), before); kernel = null; passed++;
  console.log('✓ Real kernel automatic import and local config API retain clean runtime/disk state and release HTTP/lock normally');
  console.log(`✓ 132 Migration derived-array contract: ${passed} scenarios passed; own synthetic source, no QQ or external services`);
} finally {
  await kernel?.stop();
  const absolute = path.resolve(root);
  assert.equal(path.dirname(absolute), path.resolve(os.tmpdir())); assert.ok(path.basename(absolute).startsWith('qqa-migration132-'));
  fs.rmSync(absolute, { recursive: true, force: true });
}
