import {settingsSection,settingsSave,settingsEditor} from './settings-navigation.mjs';
// Production kernel/catalog/usage + real isolated Chromium. Synthetic model HTTP only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import {isSettingsSaveRequest,settingsSavePatch} from './settings-save-observation.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-cache-vision133-'));
// The real imported default kernel/UI is under test; no installed extension
// belongs in this regression's temporary application root.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA133 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA133 external DNS disabled'); };
const routeOwnedPage = (page, base, onBlocked = () => {}) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); onBlocked(url); return route.abort();
});
function assertOffline() {
  assert.equal(isolatedOutbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'all browser pages used only their owned console origin');
}

const requests = [], errors = []; let secondScan = false;
const modelServer = http.createServer(async (req, res) => {
  assert.equal(req.method, 'POST'); assert.match(req.url, /^\/[ab]\/v1\/chat\/completions$/);
  let raw = ''; for await (const part of req) raw += part;
  const body = JSON.parse(raw); requests.push({ path: req.url, body });
  assert.equal(body.messages[0].content[1].type, 'image_url');
  const status = body.model === 'text-only' ? 400 : req.url.startsWith('/b/') && !secondScan ? 503 : 200;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(status === 200 ? { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 8, completion_tokens: 1 } } : { error: { message: status === 400 ? 'image input unsupported' : 'synthetic temporary failure' } }));
});
await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve));
const modelBase = `http://127.0.0.1:${modelServer.address().port}`; ownedOrigins.add(modelBase);
const kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') },
  transport: { id: 'offline133', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  fetchImpl: async (url, options) => { assert.equal(new URL(url).origin, modelBase, 'Only this local synthetic model server is permitted'); return fetch(url, options); },
});
kernel.config.update({ server: { token: 'synthetic133' }, telemetry: { enabled: false }, proactive: { enabled: false }, ui: { showVision: true, refreshMs: 1000 },
  providers: [{ id: 'provider-a', displayName: 'Synthetic A', baseURL: `${modelBase}/a/v1`, models: ['shared-model', 'text-only'] }, { id: 'provider-b', displayName: 'Synthetic B', baseURL: `${modelBase}/b/v1`, models: [{ id: 'shared-model' }] }],
});
kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
let browser;
try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
  assert.notEqual(port, 15967); assert.deepEqual(kernel.loader.listEntries(), []);
  const api = async (method, route, body) => {
    const response = await fetch(base + route, { method, headers: { 'x-console-token': 'synthetic133', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `${route}: HTTP ${response.status}`); return response.json();
  };
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(v => path.join(cache, v, 'chrome-win64/chrome.exe')).find(f => fs.existsSync(f)), headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await routeOwnedPage(page, base);
  page.on('pageerror', e => errors.push(e.message)); await page.clock.install();
  await page.goto(`${base}/?token=synthetic133`);
  assert.equal(await page.locator('#cache-hit-rate').count(), 1, 'F085 has a real topbar consumer');
  await page.waitForFunction(() => document.querySelector('#cache-hit-rate').textContent === '今日缓存命中 0.0%');
  assert.equal((await api('GET', '/api/status')).cacheHitRate, 0);
  async function expectRate(rate, cached, prompt) {
    const status = await api('GET', '/api/status'); assert.equal(status.cacheHitRate, rate);
    assert.equal(status.usage.cachedTokens, cached); assert.equal(status.usage.promptTokens, prompt);
    await page.clock.runFor(1000);
    await page.waitForFunction(expected => document.querySelector('#cache-hit-rate').textContent === expected, `今日缓存命中 ${(rate * 100).toFixed(1)}%`);
    assert.match(await page.locator('#cache-hit-rate').getAttribute('title'), new RegExp(`${cached} / 总输入 ${prompt} Tokens`));
  }
  console.log('· Topbar reads real today usage, including live deltas without duplicating completed usage');
  const first = kernel.sessions.create('group:133', { trigger: 'synthetic usage' });
  kernel.sessions.update(first, { usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedTokens: 40, calls: 1 } });
  await expectRate(.4, 40, 100);
  kernel.sessions.finish(first.id, 'done'); await expectRate(.4, 40, 100);
  const second = kernel.sessions.create('group:133', { trigger: 'second synthetic usage' });
  kernel.sessions.update(second, { usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, cachedTokens: 100, calls: 1 } });
  await expectRate(.7, 140, 200);
  kernel.orchestrator.pause(); kernel.bus.emit('status', { paused: true });
  await page.waitForFunction(() => document.querySelector('#pause-btn').textContent === '恢复运行');
  assert.equal(await page.locator('#cache-hit-rate').textContent(), '今日缓存命中 70.0%');
  kernel.sessions.finish(second.id, 'done'); await expectRate(.7, 140, 200);

  await page.locator('#nav button[data-panel=settings]').click();
  const frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  const badge = (provider, model) => frame.locator(`.model-vision-badge[data-provider-id="${provider}"][data-model-id="${model}"]`);
  assert.equal(await frame.locator('.model-vision-badge').count(), 3);
  for (const [provider, model] of [['provider-a', 'shared-model'], ['provider-a', 'text-only'], ['provider-b', 'shared-model']]) assert.equal(await badge(provider, model).getAttribute('data-verdict'), 'unknown');
  assert.equal(requests.length, 0, 'Reading badges does not perform a billed model scan');
  console.log('· Explicit scan uses real local HTTP and SSE updates provider/model-specific three-state badges');
  await settingsEditor(frame,'model-config');
  assert.equal(await frame.getByRole('button', {name:'扫描视觉能力',exact:true}).count(),0,'the compact configuration no longer exposes a scan action');
  assert.equal((await api('POST','/api/vision/scan',{})).started,true);
  await settingsEditor(frame,'model-manager');
  await badge('provider-a', 'shared-model').filter({ hasText: '✓' }).waitFor();
  await badge('provider-a', 'text-only').filter({ hasText: '✗' }).waitFor();
  assert.equal(await badge('provider-b', 'shared-model').getAttribute('data-verdict'), 'unknown');
  assert.match(await badge('provider-b', 'shared-model').getAttribute('title'), /HTTP 503/);
  assert.equal(requests.length, 3); assert.equal((await api('GET', '/api/vision/results')).scanning, false);
  assert.equal(await frame.locator('#fetched-models').isHidden(),true,'the removed raw model-list control is not exposed');

  console.log('· showVision immediately hides/restores badges; save/reload keeps the choice');
  await settingsSection(frame,'interface');
  const showVision = frame.locator('#field-ui-showVision');
  const offSave = page.waitForResponse(r => isSettingsSaveRequest(r.request()) && settingsSavePatch(r.request())?.ui?.showVision === false);
  offSave.catch(() => {});
  await frame.locator('label[data-path="ui.showVision"]').click(); assert.equal(await showVision.isChecked(), false);
  assert.equal(await frame.locator('.model-vision-badge:not([hidden])').count(), 0);
  assert.equal(await frame.locator('option.model-vision-option').evaluateAll(options => options.some(o => /[✓✗？]/.test(o.textContent))), false);
  await settingsSave(frame); assert.equal((await offSave).status(), 200); await frame.locator('#status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).ui.showVision, false);

  // A scan completion updates only badge data, leaving unrelated focused input intact.
  await settingsSection(frame,'persona');
  await frame.locator('#field-persona-botName').fill('QA-133-PENDING'); secondScan = true;
  await api('POST', '/api/vision/scan', {});
  await badge('provider-b', 'shared-model').filter({ hasText: '✓' }).waitFor({ state: 'attached' });
  assert.equal(await frame.locator('#field-persona-botName').inputValue(), 'QA-133-PENDING');
  assert.equal(await frame.locator('.model-vision-badge:not([hidden])').count(), 0); assert.equal(requests.length, 6);
  await settingsSection(frame,'interface');
  const onSave = page.waitForResponse(r => isSettingsSaveRequest(r.request()) && settingsSavePatch(r.request())?.ui?.showVision === true);
  onSave.catch(() => {});
  await frame.locator('label[data-path="ui.showVision"]').click(); assert.equal(await showVision.isChecked(), true); assert.equal(await frame.locator('.model-vision-badge:not([hidden])').count(), 3);
  await settingsSave(frame); assert.equal((await onSave).status(), 200); await frame.locator('#status').filter({ hasText: '已保存' }).waitFor();
  await page.reload(); await page.locator('#nav button[data-panel=settings]').click(); await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  assert.equal(await frame.locator('.model-vision-badge:not([hidden])').count(), 3);
  assert.equal(await badge('provider-b', 'shared-model').getAttribute('data-verdict'), 'vision');
  assert.equal(await page.locator('#cache-hit-rate').textContent(), '今日缓存命中 70.0%'); assert.equal(requests.length, 6);
  await page.setViewportSize({ width: 520, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.runtime-controls')].some(el => { const b = el.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth + 1; })), false);
  assert.deepEqual(errors, []);
  console.log('✓ 133 real cache statistics, vision catalog/scans, showVision persistence, partial SSE and narrow layout passed');
} finally {
  await browser?.close(); await kernel.stop(); modelServer.closeAllConnections(); await new Promise(resolve => modelServer.close(resolve));
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); fs.rmSync(dataDir, { recursive: true, force: true });
  assertOffline(); assert.deepEqual(kernel.loader.listEntries(), []);
}
