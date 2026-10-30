import {settingsEditor} from './settings-navigation.mjs';
// Real HTTP, local model endpoint and production settings UI; all data and
// browsers are isolated. No existing QA providers are migrated or removed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-provider119-'));
const isolation = isolateConsoleFixture(dataDir, '119');
const calls = [], remoteModels = [{ id: 'qa-remote', vendorOnly: 'not a host configuration field' }];
const modelServer = http.createServer((req, res) => {
  calls.push({ pathname: req.url, method: req.method, authorization: req.headers.authorization });
  res.setHeader('content-type', 'application/json');
  if (req.url.endsWith('/models')) res.end(JSON.stringify({ data: remoteModels }));
  else { res.writeHead(404); res.end('{}'); }
});
await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${modelServer.address().port}/v1`;
isolation.allowOrigin(endpoint);
const token = 'provider119', kernel = createKernel({ appRoot:isolation.appRoot,env:isolation.env,headless:true,
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) } });
let browser;
kernel.loader.startWatchers=()=>{};
try {
  kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false },
    api: { provider: 'existing', baseUrl: endpoint, model: 'qa-manual' },
    providers: [
      { id: 'existing', displayName: 'Existing', baseURL: `${endpoint}/`, models: ['qa-manual', { id: 'qa-shared', name: 'Old label', contextLimit: 100, vision: true }], modelNames: { 'qa-manual': 'Manual' }, anthropicOrigin: true },
      { id: 'already-duplicate', displayName: 'Pre-existing duplicate', baseUrl: endpoint, models: ['qa-duplicate'], marker: 'retain' },
      { id: 'other', displayName: 'Other', baseUrl: 'https://other.example.invalid/v1', models: ['qa-other'] },
    ], dshProviderKeys: { existing: 'qa-original-key', other: 'qa-other-key' } });
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`;
  isolation.allowOrigin(base);isolation.assertEmpty(kernel);
  const request = async (method, pathname, body) => {
    const response = await fetch(base + pathname, { method, headers: { 'x-console-token': token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  const byId = id => kernel.config.get().providers.find(p => p.id === id);
  const ids = rows => rows.map(m => typeof m === 'string' ? m : m.id);
  const duplicateBefore = structuredClone(byId('already-duplicate'));

  console.log('· Canonical endpoint upsert preserves identity, credentials, existing metadata and prior duplicates');
  let response = await request('POST', '/api/providers', { baseUrl: `${endpoint}///`, displayName: 'Updated', apiKey: '',
    models: [{ id: 'qa-shared', contextLimit: 200, outputLimit: 32 }, 'qa-new', { id: 'qa-new', name: 'New label' }], modelNames: { 'qa-new': 'Readable new' } });
  assert.equal(response.status, 200); assert.equal(response.data.provider.id, 'existing');
  assert.equal(kernel.config.get().providers.length, 3); assert.deepEqual(byId('already-duplicate'), duplicateBefore);
  assert.equal(byId('existing').displayName, 'Updated'); assert.equal(byId('existing').anthropicOrigin, true);
  assert.deepEqual(ids(byId('existing').models), ['qa-manual', 'qa-shared', 'qa-new']);
  assert.deepEqual(byId('existing').models[1], { id: 'qa-shared', name: 'Old label', contextLimit: 200, vision: true, outputLimit: 32 });
  assert.deepEqual(byId('existing').models[2], { id: 'qa-new', name: 'New label' });
  assert.deepEqual(byId('existing').modelNames, { 'qa-manual': 'Manual', 'qa-new': 'Readable new' });
  assert.equal(kernel.config.get().dshProviderKeys.existing, 'qa-original-key');
  assert.equal(kernel.config.get().api.provider, 'existing'); assert.equal(kernel.config.get().api.model, 'qa-manual');
  for (const key of [undefined, '', '******', ' ****** ']) {
    response = await request('POST', '/api/providers', { baseUrl: `${endpoint}/`, ...(key === undefined ? {} : { apiKey: key }), models: ['qa-shared'] });
    assert.equal(response.data.provider.id, 'existing'); assert.equal(kernel.config.get().dshProviderKeys.existing, 'qa-original-key');
    assert.equal(byId('existing').displayName, 'Updated');
  }
  response = await request('POST', '/api/providers', { baseUrl: endpoint, apiKey: 'qa-replaced-key', models: [] });
  assert.equal(response.status, 200); assert.equal(kernel.config.get().dshProviderKeys.existing, 'qa-replaced-key');
  assert.deepEqual(ids(byId('existing').models), ['qa-manual', 'qa-shared', 'qa-new']);
  assert.equal(byId('existing').apiKey, undefined);

  console.log('· Model append merges string/object IDs and metadata while preserving ordering and selection');
  response = await request('POST', '/api/providers/models', { providerId: 'existing', models: ['qa-new', { model: 'qa-alias', name: 'Alias' }, { id: 'qa-shared', outputLimit: 64 }], modelNames: { 'qa-alias': 'Readable alias' } });
  assert.equal(response.status, 200); assert.deepEqual(ids(byId('existing').models), ['qa-manual', 'qa-shared', 'qa-new', 'qa-alias']);
  assert.equal(byId('existing').models[1].contextLimit, 200); assert.equal(byId('existing').models[1].outputLimit, 64);
  assert.equal(byId('existing').models[2].name, 'New label'); assert.equal(byId('existing').models[3].name, 'Alias');
  assert.deepEqual(byId('existing').modelNames, { 'qa-manual': 'Manual', 'qa-new': 'Readable new', 'qa-alias': 'Readable alias' });
  const beforeEmpty = structuredClone(byId('existing'));
  await request('POST', '/api/providers/models', { providerId: 'existing', models: [] }); assert.deepEqual(byId('existing'), beforeEmpty);
  assert.equal((await request('POST', '/api/providers/models', { providerId: 'missing', models: ['x'] })).status, 404);
  assert.equal(kernel.config.get().dshProviderKeys.other, 'qa-other-key');

  console.log('· Pull endpoints are read-only; append occurs only on the explicit POST/models write');
  const beforePull = JSON.stringify(kernel.config.get().providers);
  response = await request('POST', '/api/providers/fetch-models', { providerId: 'existing' });
  assert.deepEqual(response.data.models, [{ id: 'qa-remote' }]); assert.equal(JSON.stringify(kernel.config.get().providers), beforePull);
  assert.equal(calls.at(-1).pathname, '/v1/models'); assert.equal(calls.at(-1).authorization, 'Bearer qa-replaced-key');
  response = await request('GET', '/api/models'); assert.deepEqual(response.data.models, [{ id: 'qa-remote' }]);
  assert.equal(JSON.stringify(kernel.config.get().providers), beforePull);
  await request('POST', '/api/providers/models', { providerId: 'existing', models: response.data.models });
  assert.deepEqual(ids(byId('existing').models), ['qa-manual', 'qa-shared', 'qa-new', 'qa-alias', 'qa-remote']);
  const safe = (await request('GET', '/api/providers')).data.providers.find(p => p.id === 'existing');
  assert.equal(safe.apiKey, ''); assert.equal(safe.hasKey, true); assert.equal(JSON.stringify(safe).includes('qa-replaced-key'), false);
  assert.deepEqual(safe.models, byId('existing').models); assert.deepEqual(safe.modelNames, byId('existing').modelNames);
  const disk = createConfig({ dataDir, defaults: buildDefaultConfig(), log: { info() {}, warn() {} } }); disk.load();
  assert.deepEqual(disk.get().providers, kernel.config.get().providers); assert.equal(disk.get().dshProviderKeys.existing, 'qa-replaced-key');

  console.log('· Real settings: same-endpoint Add updates its card; Pull retains manual models; Edit explicitly replaces');
  const playwright = createRequire(import.meta.url)('playwright-core'), cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(v => path.join(cache, v, 'chrome-win64/chrome.exe')).find(f => fs.existsSync(f)), headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } }), errors = [];
  await isolation.bindPage(page,base);await page.emulateMedia({reducedMotion:'reduce'});
  page.setDefaultTimeout(8000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?token=${token}`); await page.locator('#nav button[data-panel=settings]').click();
  const frame = page.frameLocator('#panel-host iframe'); await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  // Startup may validly guide this fixture to access (no chats allowed). Select
  // the models section explicitly rather than racing that first navigation.
  await settingsEditor(frame,'model-manager');
  await frame.locator('#section-models').waitFor({ state: 'visible' });
  await frame.locator('[data-settings-open=provider-add]').click();
  await frame.locator('#provider-name').fill('UI Updated'); await frame.locator('#provider-base').fill(`${endpoint}/`);
  const modelsBeforeAdd=structuredClone(byId('existing').models);
  await frame.locator('dialog[data-settings-editor=provider-add]').getByRole('button',{name:'添加渠道',exact:true}).click();
  const card = frame.locator('#provider-list article.list-item').filter({ hasText: 'UI Updated' }); await card.waitFor();
  assert.equal(kernel.config.get().providers.length, 3); assert.equal(byId('existing').displayName, 'UI Updated');
  assert.equal(kernel.config.get().dshProviderKeys.existing, 'qa-replaced-key');
  assert.deepEqual(byId('existing').models,modelsBeforeAdd,'adding a channel without model fields preserves the existing catalogue');
  await card.getByRole('button',{name:'添加模型',exact:true}).click();
  const modelEntry=frame.locator('dialog').filter({has:frame.locator('input[name=id]')});await modelEntry.locator('[name=id]').fill('qa-ui-manual');await modelEntry.getByRole('button',{name:'保存',exact:true}).click();await modelEntry.waitFor({state:'detached'});
  assert.ok(ids(byId('existing').models).includes('qa-ui-manual'));
  await card.getByRole('button', { name: '拉取模型', exact: true }).click();
  const discovery = frame.locator('dialog.model-discovery');
  const existingRemote = discovery.locator('label[data-model-id="qa-remote"] input');
  await existingRemote.waitFor(); assert.equal(await existingRemote.isDisabled(), true);
  await discovery.getByRole('button', {name: '取消', exact: true}).click();
  assert.ok(ids(byId('existing').models).includes('qa-ui-manual'));
  assert.equal(ids(byId('existing').models).filter(id => id === 'qa-remote').length, 1);
  assert.equal(byId('existing').models.find(m => m?.id === 'qa-shared').name, 'Old label');
  // Replace the directory through the new per-row controls rather than the
  // removed bulk editor entry; each removal retains its own two-click action.
  for(const id of ids(byId('existing').models)){await card.locator('.model-catalog-item').filter({has:frame.locator('[title="'+id+'"]')}).getByRole('button',{name:'删除模型',exact:true}).click({clickCount:2});await card.locator('.model-catalog-item[data-model-id="'+id+'"]').waitFor({state:'detached'});}
  await card.getByRole('button',{name:'添加模型',exact:true}).click();const manual=frame.locator('dialog').filter({has:frame.locator('input[name=id]')});await manual.locator('[name=id]').fill('qa-explicit-only');await manual.getByRole('button',{name:'保存',exact:true}).click();await manual.waitFor({state:'detached'});
  assert.deepEqual(byId('existing').models,[{id:'qa-explicit-only',name:'qa-explicit-only'}]); assert.equal(kernel.config.get().dshProviderKeys.existing, 'qa-replaced-key');
  assert.deepEqual(byId('already-duplicate'), duplicateBefore); assert.equal(kernel.config.get().providers.length, 3);
  const replay = createConfig({ dataDir, defaults: buildDefaultConfig(), log: { info() {}, warn() {} } }); replay.load();
  assert.deepEqual(replay.get().providers.find(p=>p.id==='existing').models,[{id:'qa-explicit-only',name:'qa-explicit-only'}]);
  console.log('· Host case/default ports canonicalize; different endpoint paths stay distinct; colliding explicit IDs are rejected');
  response = await request('POST', '/api/providers', { id: 'canonical-host', baseUrl: 'http://EXAMPLE.invalid:80/catalog/', models: ['one'] });
  assert.equal(response.status, 200);
  response = await request('POST', '/api/providers', { baseUrl: 'http://example.invalid/catalog', models: ['two'] });
  assert.equal(response.data.provider.id, 'canonical-host'); assert.deepEqual(byId('canonical-host').models, ['one', 'two']);
  response = await request('POST', '/api/providers', { baseUrl: 'http://example.invalid/other', models: ['distinct'] });
  assert.equal(response.status, 200); assert.notEqual(response.data.provider.id, 'canonical-host');
  const beforeConflict = structuredClone(kernel.config.get().providers);
  response = await request('POST', '/api/providers', { id: 'canonical-host', baseUrl: 'http://another.example.invalid/v1', models: ['wrong'] });
  assert.equal(response.status, 400); assert.deepEqual(kernel.config.get().providers, beforeConflict);
  assert.deepEqual(errors, []);
  console.log('✓ 119 canonical upsert, model append/metadata/key precedence, read-only pull and actual UI replacement passed');
} finally {
  await browser?.close(); await kernel.stop(); modelServer.closeAllConnections(); await new Promise(resolve => modelServer.close(resolve));isolation.assertEmpty(kernel);isolation.restore();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); fs.rmSync(dataDir, { recursive: true, force: true });
}
