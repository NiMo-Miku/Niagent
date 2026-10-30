// 70 · 布局溢出回归：设置页在真实窗口尺寸下不得溢出视口。
//
// 起因：用户实机截图（Electron 窗口约 1080×700）显示设置项溢出窗口。
// 已定位三个叠加原因：
//   1) .settings-aside 写了 max-height:88vh —— 窄窗口下把 1100px 的通道条
//      内容压进 ~700px 盒子，而 grid 子项没有独立滚动上下文，内容直接溢出
//      并把右侧分区挤出视口；
//   2) .settings-sidebar 设overflow-y:auto 产生第二个滚动上下文，与 sticky 打架；
//   3) 响应式断点定在 900px，但 Electron 最小窗口 960 减去 shell 侧栏 232 后
//      内容区只有 728 —— 断点根本没触发，244px 导航把内容压到无法阅读。
//
// 低矮与高窗口都需要横向不溢出；13分区可通过独立滚动逐个真实点击，
// 无须把所有入口压成首屏三列。保留可读字号、点击区域与实际切换检查。
import assert from 'node:assert/strict';
import {settingsEditor} from './settings-navigation.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'ui/panels/manifest.json'), 'utf8'));
const SECTION_COUNT = 9;

let playwright = null;
for (const name of ['playwright', 'playwright-core']) {
  try { playwright = createRequire(import.meta.url)(name); break; } catch { /* 只探测本机已有模块 */ }
}

let kernel;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-overflow-'));
// Real default UI/routes and the formal source consumers stay under test.
// No loader extension is required by this fixture's business contract.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA70 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA70 external DNS disabled'); };
const routeOwnedPage = (page, base) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); return route.abort();
});
function assertOffline() {
  assert.equal(isolatedOutbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'browser requested only its exact owned console origin');
}

const outDir = path.join(ROOT, '.shots');
fs.mkdirSync(outDir, { recursive: true });
try {
  kernel = createKernel({ appRoot,
    env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') },
    fetchImpl: async () => { isolatedOutbound++; throw new Error('QA70 external traffic disabled'); }, headless: true,
    transport: { id: 'fixture', connected: false, selfId: '', actions: {}, start: async () => {}, stop: async () => {} },
    priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  });
  kernel.loader.startWatchers = () => {};
  kernel.config.update({ server: { port: 0, token: 'overflow-70-token' }, telemetry: { enabled: false } });
  const port = await kernel.start();
  const base = `http://127.0.0.1:${port}`;
  ownedOrigins.add(base); assert.notEqual(port, 15967); assert.deepEqual(kernel.loader.listEntries(), []);

  if (!playwright) {
    console.log('· 未发现本地 Playwright，跳过真实浏览器断言');
    process.exit(0);
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(fs.existsSync(executablePath) ? { executablePath } : {}),
  });

  // BrowserWindow 的最小尺寸包含原生边框；另测扣除边框后的较低内容区。
  const SIZES = [
    { name: '960x640-min', width: 960, height: 640 },
    { name: '960x600-content', width: 960, height: 600 },
    { name: '1080x700-user', width: 1080, height: 700 },
    { name: '1360x860-default', width: 1360, height: 860 },
    { name: '1360x1100-tall', width: 1360, height: 1100 },
  ];

  try {
    for (const size of SIZES) {
      console.log(`=== ${size.name} ===`);
      const page = await (await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 })).newPage();
      await routeOwnedPage(page, base);
      await page.goto(`${base}/?token=overflow-70-token`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((n) => document.querySelectorAll('#nav button').length === n, manifest.panels.length, { timeout: 20000 });
      await page.locator('#nav button[data-panel="settings"]').click();
      await page.waitForFunction(() => document.querySelector('#panel-host iframe')?.src.includes('/panels/settings/'), null, { timeout: 15000 });
      await page.waitForTimeout(3500);
      const frame = page.frameLocator('#panel-host iframe');
      // 配置读取完成才继续，避免测到半渲染状态
      await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor({ state: 'visible', timeout: 20000 });

      const m = await frame.locator('body').evaluate((body) => {
        const doc = body.ownerDocument;
        const vw = doc.documentElement.clientWidth;
        const vh = doc.documentElement.clientHeight;
        const nav = doc.querySelector('#settings-sidebar');
        const links = [...nav.querySelectorAll('a[data-target]')];
        const boxes = links.map((a) => {
          const r = a.getBoundingClientRect();
          return { id: a.dataset.target, top: r.top, bottom: r.bottom, right: r.right, w: r.width, h: r.height };
        });
        const leds = links.map((a) => a.querySelector('.led')).filter(Boolean);
        const aside = nav.closest('.settings-aside');
        // 越过视口右边界的元素（横向溢出的直接证据）
        const rightOverflow = [...doc.querySelectorAll('main *')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > vw + 1;
        }).map((el) => ({ cls: String(el.className || el.tagName).slice(0, 40), over: Math.round(el.getBoundingClientRect().right - vw) }));
        return {
          vw, vh,
          innerWidth: doc.defaultView.innerWidth,
          overflowX: Math.max(doc.body.scrollWidth, doc.documentElement.scrollWidth) - vw,
          linkCount: boxes.length,
          anyRightOverflow: boxes.some((b) => b.right > vw + 1),
          minLinkWidth: Math.round(Math.min(...boxes.map((b) => b.w))),
          minLinkHeight: Math.min(...boxes.map((b) => b.h)),
          minTitleFont: Math.min(...links.map(a => Number.parseFloat(getComputedStyle(a.querySelector('.channel-title')).fontSize))),
          allInFirstScreen: boxes.every((b) => b.top >= 0 && b.bottom <= vh),
          maxBottom: Math.round(Math.max(...boxes.map((b) => b.bottom))),
          navColumns: getComputedStyle(nav).gridTemplateColumns.split(' ').length,
          ledVisible: leds.filter((l) => {
            const r = l.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(l).display !== 'none';
          }).length,
          // Independent scrolling is valid; clicks below prove no entry is stranded.
          asideClipped: aside.scrollHeight - aside.clientHeight > 2,
          asideH: Math.round(aside.getBoundingClientRect().height),
          // 内容区必须在侧栏右侧可见（宽屏双列时）
          contentVisible: (() => {
            const c = doc.querySelector('.settings-content');
            if (!c) return false;
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.left < vw && r.right <= vw + 1;
          })(),
          rightOverflow: rightOverflow.slice(0, 5),
        };
      });
      console.log('  ', JSON.stringify(m));

      assert.equal(m.overflowX, 0, `${size.name} 无横向溢出`);
      assert.equal(m.anyRightOverflow, false, `${size.name} 通道项不越过右边界`);
      assert.deepEqual(m.rightOverflow, [], `${size.name} 没有任何元素越过右边界`);
      assert.equal(m.linkCount, SECTION_COUNT, `${size.name} 13 个分区通道都在`);
      assert.ok(m.minLinkWidth >= 110, `${size.name} 通道项最小宽度可读（实际 ${m.minLinkWidth}px）`);
      assert.ok(m.minLinkHeight >= 26, `${size.name} 导航保留点击区域（实际 ${m.minLinkHeight}px）`);
      assert.ok(m.minTitleFont >= 12, `${size.name} 导航标题保留可读字号`);
      assert.equal(m.ledVisible, SECTION_COUNT, `${size.name} 13 枚状态灯都可见`);
      assert.equal(m.contentVisible, true, `${size.name} 内容区在视口内可见`);
      await page.screenshot({ path: path.join(outDir, `overflow-fix-${size.name}.png`) });
      for (const id of await frame.locator('#settings-sidebar a[data-target]').evaluateAll(links => links.map(link => link.dataset.target))) {
          const link = frame.locator(`#settings-sidebar a[data-target="${id}"]`);
          await link.scrollIntoViewIfNeeded();
          await link.click();
          await frame.locator(`#section-${id}`).waitFor({ state: 'visible' });
          assert.equal(await frame.locator('.settings-section:not([hidden])').count(), 1, `${size.name} ${id} 能实际切换到唯一分区`);
          assert.ok((await link.getAttribute('class') || '').split(/\s+/).includes('is-active'), `${size.name} ${id} 有当前分区状态`);
      }
      await settingsEditor(frame,'prompt-preview');
      assert.equal(await frame.getByRole('button', {name:'生成预览',exact:true}).isVisible(), true, `${size.name} 侧栏/内容滚动不会截断页面底部预览`);
      await page.close();
      console.log(`✓ ${size.name} 通过`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
} finally {
  await kernel?.stop();
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('qqa-overflow-'));
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* 清理失败不影响结论 */ }
  assertOffline(); if (kernel) assert.deepEqual(kernel.loader.listEntries(), []);
}
console.log('\n✓ 70 布局溢出回归：全部通过');
