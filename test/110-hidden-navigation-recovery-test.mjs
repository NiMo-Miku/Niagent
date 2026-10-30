import {settingsSection,settingsSave} from './settings-navigation.mjs';
// Hidden preference survives reload; recovering navigation must not rewrite it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { isSettingsSaveRequest } from './settings-save-observation.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-nav110-')), token = 'nav110-console';
// This fixture uses the actual default UI and imported kernel consumers, with
// no bundled or installed extensions. Data and migration roots are temporary.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let outbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  outbound++; throw new Error('QA110 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA110 external DNS disabled'); };
const routeOwnedPage = (page, base) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); return route.abort();
});
function assertOffline() {
  assert.equal(outbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'the browser requested only its owned console origin');
}

const kernel = createKernel({
  appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') }, headless: true,
  fetchImpl: async () => { outbound++; throw new Error('QA110 external traffic disabled'); },
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
});
kernel.loader.startWatchers = () => {};
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, ui: { uikit: { mode: 'dark', dark: { sidebar: 'hidden' } } } });
let browser;
try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
  assert.notEqual(port, 15967); assert.deepEqual(kernel.loader.listEntries(), []);
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(version => path.join(cache, version, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  browser = await playwright.chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } }), errors = [], writes = [];
  await routeOwnedPage(page, base);
  // Commit fonts and the scrolled surface before sending synthetic mouse input
  // into a newly revealed overlay or opaque iframe. This uses actual frames.
  const painted = surface => surface.locator('body').evaluate(async body => {
    const doc=body.ownerDocument,view=doc.defaultView;
    await doc.fonts.ready;
    await new Promise(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(resolve)));
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (isSettingsSaveRequest(request)) writes.push(request.postData()); });
  // Reload gets a fresh credential through the same interface as Electron's
  // preload. The real main-process authorization boundaries are covered by 97.
  await page.addInitScript(value => { window.qqAgentShell = { getConsoleToken: async () => value }; }, token);
  await page.goto(`${base}/?token=${token}`);
  await page.waitForFunction(() => document.body.dataset.sidebar === 'hidden' && document.querySelectorAll('#nav button').length > 0);
  assert.equal(await page.locator('#nav button:visible').count(), 0);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.sidebar === 'hidden' && document.querySelectorAll('#nav button').length > 0);
  assert.equal(await page.locator('#nav button:visible').count(), 0);
  console.log('· Reload preserves hidden navigation while exposing a keyboard-accessible recovery entry');
  assert.equal(await page.getByRole('button', { name: '显示导航', exact: true }).count(), 1, 'a hidden navigation preference cannot strand the user after F5');
  const trigger = page.locator('#navigation-toggle');
  await trigger.focus();await page.keyboard.press('Enter');
  const navCount = await page.locator('#nav button').count();
  assert.equal(await page.locator('#nav button:visible').count(), navCount);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#nav button.active')), true);
  fs.mkdirSync(path.resolve('.shots'), { recursive: true });
  await page.screenshot({ path: path.resolve('.shots/nav-110-temporary.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#nav button:visible').count(), 0);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await trigger.evaluate(button => button === document.activeElement), true, 'Escape returns focus to the recovery entry');
  await trigger.click();
  await painted(page);
  const dismiss=page.locator('#navigation-dismiss');
  await dismiss.click();
  assert.equal(await page.locator('#nav button:visible').count(),0,'the visual dismiss control also closes temporary navigation');
  assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  assert.equal(await trigger.evaluate(button=>button===document.activeElement),true,'visual dismiss restores the same keyboard focus');

  console.log('· Temporary navigation opens settings without posting a preference change');
  await trigger.click();
  await painted(page);
  await page.locator('#nav button[data-panel=settings]').press('Enter');
  const frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  await painted(frame);
  assert.equal(await page.locator('#nav button:visible').count(), 0, 'choosing a panel closes the temporary navigation');
  assert.equal(await trigger.evaluate(button => button === document.activeElement), true);
  assert.equal(kernel.config.get().ui.uikit.dark.sidebar, 'hidden');
  assert.deepEqual(writes, [], 'opening, Escape, visual dismiss and panel selection do not write config');
  await frame.locator('#settings-sidebar a[data-target=desktop]').scrollIntoViewIfNeeded();
  await painted(frame);
  await settingsSection(frame,'uikit');
  assert.equal(await frame.locator('#field-uikit-sidebar').inputValue(), 'hidden');

  console.log('· The temporary entry remains usable in a narrower browser and after another reload');
  await page.setViewportSize({ width: 520, height: 900 });
  await trigger.click();
  await painted(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 960, height: 640 });
  await page.reload();
  await trigger.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#nav button:visible').count(), 0, 'temporary visibility is not stored across refreshes');
  await trigger.click();
  await painted(page);
  await page.locator('#nav button[data-panel=settings]').scrollIntoViewIfNeeded();
  await painted(page);
  await page.locator('#nav button[data-panel=settings]').click();
  await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  await painted(frame);
  await frame.locator('#settings-sidebar a[data-target=desktop]').scrollIntoViewIfNeeded();
  await painted(frame);
  await settingsSection(frame,'uikit');
  await frame.locator('#field-uikit-sidebar').selectOption('left');
  await settingsSave(frame);
  await page.waitForFunction(() => document.body.dataset.sidebar === 'left');
  assert.equal(kernel.config.get().ui.uikit.dark.sidebar, 'left', 'only the explicit settings action changes the preference');
  assert.equal(await trigger.isVisible(), false);
  assert.equal(await page.locator('#nav button:visible').count(), navCount);
  assert.deepEqual(errors, []);
  console.log('✓ 110 Hidden preference reload recovery, temporary visibility, Escape/focus and explicit restoration passed');
} finally {
  await browser?.close();await kernel.stop();
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('qqa-nav110-'));
  fs.rmSync(dataDir, { recursive: true, force: true });
  assertOffline(); assert.deepEqual(kernel.loader.listEntries(), []);
}
