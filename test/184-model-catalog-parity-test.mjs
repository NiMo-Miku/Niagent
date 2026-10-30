import {settingsEditor,settingsProvider} from './settings-navigation.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createKernel} from '../src/kernel/kernel.js';
import {createConfig, buildDefaultConfig} from '../src/kernel/config.js';
import {retainModelMetadata, retainModelNames, modelLabel} from '../ui/panels/settings/model-catalog-data.js';
assert.deepEqual(retainModelMetadata([{id: 'rich', vision: true}, 'plain'], ['rich', 'new', 'rich']), [{id: 'rich', vision: true}, 'new']);
assert.deepEqual(retainModelNames({rich: 'Readable', obsolete: 'Old'}, ['rich']), {rich: 'Readable'});
assert.equal(modelLabel({modelNames: {rich: '<label>'}}, {id: 'rich', name: 'Object'}), '<label>');
assert.equal(modelLabel({modelNames: []}, {id: 'rich', name: 'Object'}), 'Object');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-parity184-')), appRoot = path.join(dir, 'application');
fs.mkdirSync(appRoot); fs.cpSync(path.resolve('ui'), path.join(appRoot, 'ui'), {recursive: true});
for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, folder));
let outbound = 0, browser;
const kernel = createKernel({appRoot, headless: true, env: {QQ_AGENT_DATA_DIR: dir, QQ_AGENT_MIGRATE_FROM: path.join(dir, 'absent')},
  transport: {id: 'inert184', start() {}, stop() {}, status: () => ({connected: false}), actions: {}},
  fetchImpl: async () => { ++outbound; throw new Error('No remote traffic'); },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: {syncGlobalBlocklist: async () => ({ok: true, ids: []})}});
kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
kernel.config.update({server: {port: 0, token: 'synthetic184'}, telemetry: {enabled: false},
  api: {provider: 'qa', baseUrl: 'http://example.invalid/v1', model: 'rich'},
  providers: [{id: 'qa', displayName: 'Parity', baseUrl: 'http://example.invalid/v1', models: [{id: 'rich', name: 'Rich', vision: true, contextLimit: 128000}, 'plain'], modelNames: {rich: '显示名称', plain: '普通模型'}}], dshProviderKeys: {qa: 'synthetic-secret184'}});
try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`;
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a,b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || versions.map(v => path.join(cache, v, 'chrome-win64/chrome.exe')).find(f => fs.existsSync(f));
  assert.ok(executablePath);
  browser = await playwright.chromium.launch({executablePath, headless: process.env.QA_HEADED !== '1'});
  const page = await browser.newPage({viewport: {width: 1360, height: 900}}), errors = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(base); await page.locator('#nav button[data-panel=settings]').click();
  const frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#status').filter({hasText: '配置已读取'}).waitFor();
  const card = () => frame.locator('#provider-list > article').filter({hasText: 'Parity'});
  const initial = await fetch(base + '/api/providers', {headers: {'x-console-token': 'synthetic184'}}).then(r => r.json());
  assert.equal(initial.providers[0].modelNames.rich, '显示名称');
  await settingsEditor(frame,'model-manager');
  await card().locator('.model-catalog-item[data-model-id=rich]').filter({hasText:'显示名称'}).waitFor();
  // Editing only a provider name must not erase rich model objects/labels.
  await card().getByRole('textbox',{name:'渠道名称',exact:true}).fill('Parity Edited');await card().locator('.provider-model-head h4').click();
  await card().locator('.provider-save-status').filter({hasText:'已保存'}).waitFor();
  assert.equal(kernel.config.get().providers[0].models[0].vision, true);
  assert.equal(kernel.config.get().providers[0].modelNames.rich, '显示名称');
  const manager=card();await manager.getByRole('button',{name:'添加模型',exact:true}).click();
  const form = frame.locator('dialog').filter({has: frame.locator('input[name=id]')});
  await form.locator('input[name=id]').fill('manual'); await form.locator('input[name=name]').fill('<b>手动模型</b>');
  await form.getByRole('button', {name: '保存', exact: true}).click();
  await form.waitFor({state: 'detached'});
  await manager.locator('.model-catalog-item[data-model-id=manual]').filter({hasText: '<b>手动模型</b>'}).waitFor();
  assert.equal(await manager.locator('b').count(), 0, 'model labels are text, not markup');
  await manager.getByRole('searchbox', {name: '筛选模型', exact: true}).fill('手动');
  assert.equal(await manager.locator('.model-catalog-item:visible').count(), 1);
  const named = manager.locator('.model-catalog-item[data-model-id=manual]');
  await named.getByRole('button', {name:'编辑模型 manual',exact:true}).click();
  const rename=frame.locator('dialog').filter({has:frame.getByRole('heading',{name:'编辑模型',exact:true})});await rename.locator('input[name=name]').fill('重命名模型');
  await rename.getByRole('button', {name: '保存', exact: true}).click();await rename.waitFor({state:'detached'});
  await manager.getByRole('searchbox').fill('');
  await manager.locator('.model-catalog-item[data-model-id=manual]').filter({hasText: '重命名模型'}).waitFor();
  await manager.locator('.model-catalog-item[data-model-id=plain]').getByRole('button', {name:'删除模型',exact:true}).click({clickCount: 2});
  await manager.locator('.model-catalog-item[data-model-id=plain]').waitFor({state: 'detached'});
  await frame.locator('dialog[data-settings-editor=model-manager] .settings-dialog-head button').click();
  const disk = createConfig({dataDir: dir, defaults: buildDefaultConfig(), log: {info() {}, warn() {}}}); disk.load();
  const provider = disk.get().providers[0];
  assert.equal(provider.models.find(m => m.id === 'rich').contextLimit, 128000);
  assert.equal(provider.modelNames.manual, '重命名模型');
  assert.equal(Object.hasOwn(provider.modelNames, 'plain'), false);
  assert.equal(provider.models.some(m => (typeof m === 'string' ? m : m.id) === 'plain'), false);
  assert.equal(disk.get().api.model, 'rich'); assert.equal(disk.get().dshProviderKeys.qa, 'synthetic-secret184');
  await page.reload(); await page.locator('#nav button[data-panel=settings]').click();
  await frame.locator('#status').filter({hasText: '配置已读取'}).waitFor();
  await settingsEditor(frame,'model-manager');
  await settingsProvider(frame,'qa');
  await manager.locator('.model-catalog-item[data-model-id=manual]').filter({hasText: '重命名模型'}).waitFor();
  assert.equal(await manager.locator('.model-catalog-item[data-model-id=plain]').count(), 0);
  assert.equal(outbound, 0); assert.deepEqual(errors, []);
  console.log('✓ 184 real isolated UI: manual model, names, search, metadata, deletion, disk reload, no outbound');
} finally {
  await browser?.close(); await kernel.stop();
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, {recursive: true, force: true});
}
