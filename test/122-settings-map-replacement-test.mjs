import {settingsSave,settingsSection,settingsControl} from './settings-navigation.mjs';
// Real temporary kernel and settings iframe; never reads or writes the headed QA data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { FormState } from '../ui/panels/settings/form-state.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-map122-'));
const appRoot=path.join(dataDir,'application');fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname,'../ui'),path.join(appRoot,'ui'),{recursive:true});
// This test edits configuration maps; it invokes no extension tools/services.
// The real kernel/default routes are imported above. Only their browser assets
// are required under appRoot, so installed or bundled extensions stay absent.
for(const directory of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,directory));
let outbound=0;const blockedRequests=[];
const token = 'map122-local-token';
const kernel = createKernel({ appRoot,env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent') }, headless: true,
  transport: { id: 'inert-map122', start() {}, stop() {}, status: () => ({ connected: false }), actions: {} },
  fetchImpl:async()=>{outbound++;throw new Error('QA122 external traffic disabled');},
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) } });
kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
let browser, page, frame, base;
const errors = [], posts = [], rawPuts = [], rawReceipts = [];
const definitions = [
  { field: 'personaByChat', section: 'persona', initial: { '10001': { roleText: 'REMOVE', customRules: 'REMOVE RULE' }, '10002': { roleText: 'KEEP', participation: 'high' } }, next: { '10002': { roleText: 'NEW' } } },
  { field: 'store.groupSliderPos', section: 'wake', initial: { '10001': 20, '10002': 30 }, next: { '10002': 0 } },
  { field: 'store.groupPeakPos', section: 'wake', initial: { '10001': { peak: 10, valley: 90 }, '10002': { peak: 30, valley: 40 } }, next: { '10002': { peak: 0 } } },
  { field: 'commandMute.active', section: 'wake', initial: { '10001': 0, '10002': 12345 }, next: { '10002': 0 } },
  { field: 'blocklist', section: 'access', initial: { '10001': ['20001'], '10002': ['20002'] }, next: { '10002': [] } },
  { field: 'api.modelPrices', section: 'prices', initial: { 'remove-model': { in: 1, out: 2 }, 'keep-model': { in: 3, out: 4, cached: 5 } }, next: { 'keep-model': { in: 0, out: 0 } } },
];
const readPath = (value, field) => field.split('.').reduce((node, key) => node?.[key], value);
const patchFor = (field, value) => {
  const patch = {}; let node = patch; const parts = field.split('.');
  for (const key of parts.slice(0, -1)) node = node[key] = {};
  node[parts.at(-1)] = value; return patch;
};
const disk = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
async function request(method, route, body) {
  const response = await fetch(`${base}${route}`, { method, headers: { 'x-console-token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, 200, `${method} ${route}`); return response.json();
}
async function select(section) {
  await settingsSection(frame,section);
}
async function input(field) {
  return settingsControl(frame,`[data-config-path="${field}"]`);
}
async function save(field) {
  if (field === 'blocklist') {
    const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/blocklist-raw'&&value.request().method()==='PUT');
    await frame.getByRole('button', {name:'保存原始名单',exact:true}).click();
    const receipt=await response,body=await receipt.json();assert.equal(receipt.status(),200,JSON.stringify(body));
    // A configUpdated rebuild may replace the transient success notice with a
    // clean authoritative read. A dirty read is deliberately not accepted.
    await frame.locator('[data-blocklist-raw] [role=status]').filter({hasText:/原始名单已保存|原始本机名单已读取/}).waitFor();
    rawReceipts.push({request:receipt.request().postDataJSON(),status:receipt.status(),confirmed:body.fields.blocklist,statusText:await frame.locator('[data-blocklist-raw] [role=status]').textContent(),input:await frame.locator('[data-raw-field=blocklist]').inputValue()});
    return;
  }
  await settingsSave(frame);
  await frame.locator('#status').filter({ hasText: '已保存' }).waitFor();
}
try {
  kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false },
    persona: { botName: 'QA-122-BASE', roleText: 'UNCHANGED GLOBAL ROLE' }, api: { apiKey: 'keep-122-secret', temperature: 0.37 },
    store: { historyCount: 122, contextSliderPos: 100 }, tools: { enabled: true, overrides: { 'mcp.literal.id': false, keep: true } },
    memberNotes: { '20001': 'KEEP NOTE' }, extensions: { providers: { 'example.service': 'keep-owner' } } });
  for (const definition of definitions) kernel.config.update(patchFor(definition.field, { __replace__: definition.initial }));
  const port = await kernel.start(); base = `http://127.0.0.1:${port}`;
  assert.notEqual(port,15967);assert.deepEqual(kernel.loader.listEntries(),[],'map editors require no extension dependency closure');
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(value => /^chromium-\d+$/.test(value)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(value => path.join(cache, value, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file)), headless: true });
  page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => {
    if (req.method() === 'POST' && ['/api/config','/api/config/lifecycle'].includes(new URL(req.url()).pathname)) {
      const body=req.postDataJSON();posts.push(new URL(req.url()).pathname.endsWith('/lifecycle')?body.patch:body);
    }
    if (req.method() === 'PUT' && new URL(req.url()).pathname === '/api/blocklist-raw') rawPuts.push(req.postDataJSON());
  });
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();blockedRequests.push(route.request().url());return route.abort();});
  await page.goto(`${base}/?token=${token}`);
  await page.locator('#nav button[data-panel=settings]').click();
  frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();

  console.log('· Real configUpdated rebuilds preserve opened/closed advanced groups and the selected section');
  await select('wake');
  const advanced = frame.locator('details[data-settings-group="wake-per-group"]');
  const timing = frame.locator('details[data-settings-group="wake-timing"]');
  assert.equal(await advanced.evaluate(node => node.open), false);
  await advanced.locator('summary').click();
  async function refreshAdvanced(expectedOpen, suffix) {
    await frame.locator('#fields').evaluate(fields => { window.qa122OldEditor = fields.querySelector('[data-config-path="store.groupPeakPos"]'); });
    await frame.locator('#save').focus();
    const reply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/config' && response.request().method() === 'GET');
    kernel.config.update({ persona: { botName: `QA-122-REFRESH-${suffix}` } });
    kernel.bus.emit('status', { configUpdated: true });
    await reply;
    await frame.locator('#fields').evaluate(() => new Promise((resolve, reject) => {
      const deadline = performance.now() + 5000;
      const check = () => {
        if (!window.qa122OldEditor.isConnected) return resolve();
        if (performance.now() > deadline) return reject(new Error('the changed authoritative configuration did not rebuild the idle form'));
        requestAnimationFrame(check);
      };
      check();
    }));
    assert.equal(await advanced.evaluate(node => node.open), expectedOpen);
    assert.equal(await timing.evaluate(node => node.open), false, 'unopened groups must remain closed');
    assert.equal(await frame.locator('#section-chat').isVisible(), true);
    assert.equal(await frame.locator('#field-persona-botName').inputValue(), `QA-122-REFRESH-${suffix}`);
  }
  await refreshAdvanced(true, 'OPEN');
  await advanced.locator('summary').click();
  await refreshAdvanced(false, 'CLOSED');
  assert.equal(posts.length, 0, 'presentation state and authoritative reads do not save configuration');

  for (const definition of definitions) {
    console.log(`· Actual JSON editor replaces ${definition.field}: delete key/nested value, then clear {}`);
    await select(definition.section); const control = await input(definition.field);
    await control.fill(JSON.stringify(definition.next)); await save(definition.field);
    assert.deepEqual(readPath(disk(), definition.field), definition.next, `${definition.field}: removed keys must not survive a whole JSON edit`);
    if (definition.field === 'blocklist') assert.deepEqual(rawPuts.at(-1).patch.blocklist, definition.next);
    else assert.deepEqual(readPath(posts.at(-1), definition.field), { __replace__: definition.next });
    await control.fill('{}'); await save(definition.field);
    assert.deepEqual(readPath(disk(), definition.field), {}, `${definition.field}: explicit empty map must clear old entries`);
    if (definition.field === 'blocklist') assert.deepEqual(rawPuts.at(-1).patch.blocklist, {});
  }

  console.log('· JSON arrays retain their whole-array contract and reject object shapes');
  await select('models'); const fallbackModels = await input('api.fallbackModels');
  const fallback = [{ provider: 'local', model: 'first' }, { model: 'second' }];
  await fallbackModels.fill(JSON.stringify(fallback)); await save();
  assert.deepEqual(disk().api.fallbackModels, fallback); assert.deepEqual(posts.at(-1).api.fallbackModels, fallback);
  await fallbackModels.fill('{}'); assert.equal(await fallbackModels.getAttribute('aria-invalid'), 'true');
  await fallbackModels.fill('[]'); await save(); assert.deepEqual(disk().api.fallbackModels, []);

  console.log('· Invalid map shapes and invalid JSON cannot replace a valid map');
  await select('persona'); const personaMap = await input('personaByChat');
  await personaMap.fill('{"10001":{"roleText":"SHAPE GUARD KEEP"}}'); await save();
  for (const invalid of ['', '  ', 'null', '[]', '42', '"value"', '{', '{"__proto__":{}}', '{"__replace__":{}}', '{"10001":{"__replace__":{}}}', '{"10001":{"apiKey":"hidden"}}']) {
    const before = disk(), count = posts.length;
    await personaMap.fill(invalid);
    assert.equal(await personaMap.getAttribute('aria-invalid'), 'true', `reject map input ${invalid}`);
    await settingsSave(frame);
    assert.deepEqual(disk(), before); assert.equal(posts.length, count);
  }
  await personaMap.fill('{}'); await save();

  console.log('· An older save acknowledgement preserves newer same-map and other-field input');
  let release, entered, first = false;
  const blocked = new Promise(resolve => release = resolve), posted = new Promise(resolve => entered = resolve);
  await page.route('**/api/config**', async route => {
    if (route.request().method() === 'POST' && !first) {
      first = true; const response = await route.fetch(); entered(); await blocked; await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await personaMap.fill('{"10001":{"roleText":"OLD IN FLIGHT"}}');
    await settingsSave(frame); await posted;
    await personaMap.fill('{"10002":{"roleText":"NEW IN FLIGHT","customRules":"KEEP NEW RULE"}}');
    await frame.locator('#field-persona-botName').fill('QA-122-NEWER-NAME');
    release(); await frame.locator('#status').filter({ hasText: '已保存' }).waitFor();
    assert.deepEqual(disk().personaByChat, { '10002': { roleText: 'NEW IN FLIGHT', customRules: 'KEEP NEW RULE' } });
    assert.equal(disk().persona.botName, 'QA-122-NEWER-NAME');
    assert.equal(await personaMap.inputValue(), '{"10002":{"roleText":"NEW IN FLIGHT","customRules":"KEEP NEW RULE"}}');
    assert.equal(await frame.locator('#field-persona-botName').inputValue(), 'QA-122-NEWER-NAME');
  } finally { release(); await page.unroute('**/api/config**'); }

  console.log('· Ordinary config patches still merge, explicit map replacements preserve other paths and secrets');
  await request('POST', '/api/config', { personaByChat: { '10003': { roleText: 'PATCH ADD' } }, tools: { overrides: { 'send_message': false } } });
  assert.ok(disk().personaByChat['10002']); assert.ok(disk().personaByChat['10003']);
  assert.equal(disk().tools.overrides['mcp.literal.id'], false); assert.equal(disk().tools.overrides.keep, true);
  const form = new FormState(await request('GET', '/api/config'));
  form.set('tools.overrides', { 'mcp.literal.id': true }, { replace: true });
  form.set('extensions.providers', {}, { replace: true });
  await request('POST', '/api/config', form.snapshot().patch);
  assert.deepEqual(disk().tools.overrides, { 'mcp.literal.id': true }); assert.deepEqual(disk().extensions.providers, {});
  assert.equal(disk().tools.enabled, true); assert.equal(disk().extensions.hotReload, true);
  assert.equal(disk().api.apiKey, 'keep-122-secret'); assert.equal(disk().api.temperature, 0.37);
  assert.equal(disk().persona.roleText, 'UNCHANGED GLOBAL ROLE'); assert.equal(disk().store.historyCount, 122);
  assert.deepEqual(disk().memberNotes, { '20001': 'KEEP NOTE' });
  assert.equal(JSON.stringify(disk()).includes('__replace__'), false);
  const restored = createConfig({ dataDir, defaults: buildDefaultConfig(), log: { warn() {}, error() {} } }).load();
  assert.deepEqual(restored.personaByChat, disk().personaByChat); assert.deepEqual(restored.api.modelPrices, {});
  assert.deepEqual(restored.tools.overrides, { 'mcp.literal.id': true });
  assert.deepEqual(errors, []);
  assert.deepEqual(kernel.loader.listEntries(),[]);assert.equal(outbound,0);assert.deepEqual(blockedRequests,[]);
  const evidence=path.resolve(import.meta.dirname,'../.qa-local/v04-parity-20261016/blocklist242');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'legacy122-result.json'),JSON.stringify({execution:'passed',rawReceipts,rawPuts,ordinaryPatches:posts.length,outbound,blockedRequests,errors},null,2));
  console.log('✓ 122 six actual map editors delete/clear, reject invalid shapes, preserve newer input and compatible patches passed');
} finally {
  await browser?.close(); await kernel.stop();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); fs.rmSync(dataDir, { recursive: true, force: true });
}
