// 视觉验收截图：真实内核 + 真实 Chromium，截外壳与设置页各分区。
// 用法：NODE_PATH=<managed workspace>/node_modules node scripts/_shot-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, '.shots');
fs.mkdirSync(outDir, { recursive: true });

let playwright = null;
for (const name of ['playwright', 'playwright-core']) {
  try { playwright = createRequire(import.meta.url)(name); break; } catch { /* 探测本机模块 */ }
}
if (!playwright) { console.log('! 无 Playwright'); process.exit(1); }

const kernel = createKernel({ env: { ...process.env, QQ_AGENT_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-shot-')), QQ_AGENT_PORT: '0' }, headless: true });
kernel.config.update({ server: { port: 0, token: 'shot-token' } });
const port = await kernel.start();
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
  browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(executablePath) ? { executablePath } : {}) });
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 940 }, deviceScaleFactor: 1 })).newPage();
  const shoot = async (name) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); console.log(`  ${name}.png`); };

  await page.goto(`${base}/?token=shot-token`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#nav button').length >= 8, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shoot('01-shell');

  await page.locator('#nav button[data-panel="settings"]').click();
  await page.waitForFunction(() => document.querySelector('#panel-host iframe')?.src.includes('/panels/settings/'), null, { timeout: 15000 });
  await page.waitForTimeout(3500);
  await shoot('02-settings-models');

  const frame = page.frameLocator('#panel-host iframe');
  const pick = async (sid) => {
    await frame.locator(`#settings-sidebar a[data-target="${sid}"]`).evaluate((a) => { a.click(); return true; });
    await page.waitForTimeout(320);
  };
  await pick('wake'); await shoot('03-settings-wake');
  await pick('security'); await shoot('04-settings-security');
  await pick('access'); await shoot('05-settings-access');

  // 筛选态
  await frame.locator('#settings-filter').fill('表情');
  await page.waitForTimeout(420);
  await shoot('06-settings-filter');
  await frame.locator('#settings-filter').fill('');
  await page.waitForTimeout(300);

  await page.locator('#nav button[data-panel="skills"]').click();
  await page.waitForTimeout(3000);
  await shoot('07-skills');
  await page.locator('#nav button[data-panel="usage"]').click();
  await page.waitForTimeout(3000);
  await shoot('08-usage');
  await page.locator('#nav button[data-panel="community"]').click();
  await page.waitForTimeout(3000);
  await shoot('09-community');

  // 浅色主题
  await frame.locator('#settings-sidebar a[data-target="uikit"]').evaluate((a) => { a.click(); return true; }).catch(() => {});
  await page.waitForTimeout(400);
} finally {
  await browser?.close().catch(() => {});
  kernel.stop().catch(() => {});
}
console.log(`\n✓ 截图输出到 ${outDir}`);
