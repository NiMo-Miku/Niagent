// Standalone Chromium component QA. Every action only increments an in-memory
// counter; this server has no API, kernel, account, credentials or data directory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const uiRoot = path.join(root, 'ui');
const evidenceOption = process.argv.indexOf('--evidence-dir');
const evidenceDir = evidenceOption < 0 ? path.join(root, '.qa-local/destructive-ui-20261016/component') : path.resolve(process.argv[evidenceOption + 1]);
fs.mkdirSync(evidenceDir, { recursive: true });
const requests = [], errors = [], blockedRequests = [];
const result = { recordedAt: new Date().toISOString(), method: 'Independent random-port static fixture, real Chromium, virtual clock, synthetic counter actions only.', checks: [] };
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>删除进度组件独立验证</title><link rel="stylesheet" href="/panels/common.css">
<style>body{margin:0;background:var(--bg,#171916);color:var(--text,#eef0e8)}main{max-width:980px;margin:auto}.fixture{margin:16px 0;padding:18px;border:1px solid var(--line,#555);border-radius:12px;min-width:0}.fixture h2{font-size:17px}.fixture .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.target{padding:14px;margin:12px 0;min-width:0;overflow-wrap:anywhere}.target p{margin:4px 0}.fixture select{max-width:100%}.fixture button{max-width:100%}.danger-feedback{overflow-wrap:anywhere}</style>
<main><h1>删除操作进度</h1><p class="muted">合成对象与计数器；页面不连接 QQ Agent 服务。</p><div id="fixture-host"></div></main></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.push({ method: req.method, path: url.pathname });
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (!url.pathname.startsWith('/panels/')) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(uiRoot, url.pathname.slice(1)), relative = path.relative(uiRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream';
  res.setHeader('Content-Type', mime); res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const playwright = createRequire(import.meta.url)('playwright-core');
const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
const versions = fs.existsSync(cache) ? fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(name => path.join(cache, name, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
let browser, page;
async function check(name, task) {
  try { await task(); result.checks.push({ name, passed: true }); console.log('✓ 168 ' + name); }
  catch (error) {
    result.checks.push({ name, passed: false, error: error.message }); console.error('FAIL 168 ' + name + ': ' + error.message);
    await page?.screenshot({ path: path.join(evidenceDir, `failure-${result.checks.length}.png`), fullPage: true, animations: 'disabled' }).catch(() => {});
  }
}
const closeTo = (actual, expected, label, tolerance = .025) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
try {
  assert.ok(executablePath, 'An already installed local Chromium is required; this test never downloads a browser');
  browser = await playwright.chromium.launch({ executablePath, headless: process.env.QA_HEADLESS !== '0' });
  page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    blockedRequests.push(route.request().url()); return route.abort();
  });
  await page.goto(base);
  // CSS uses the native document timeline; preserve its frame boundary before
  // replacing JavaScript timers/rAF for the behavioral hold and decay checks.
  await page.evaluate(() => { window.qa168PaintFrame = window.requestAnimationFrame.bind(window); });
  await page.clock.install({ time: new Date('2026-10-16T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-16T00:01:00Z'));
  await page.evaluate(async () => {
    const api = await import('/panels/destructive-action.js');
    window.qa168 = { api, states: {}, tint: [] };
    window.addEventListener('destructive-window-progress', event => qa168.tint.push(event.detail.progress));
    qa168.clean = () => {
      for (const state of Object.values(qa168.states)) { state.controller?.dispose(); for (const controller of state.extraControllers || []) controller.dispose(); }
      api.resetDestructiveActions(); qa168.states = {}; qa168.tint = []; document.querySelector('#fixture-host').replaceChildren();
    };
    qa168.mount = (name, options = {}) => {
      const article = document.createElement('article'); article.className = 'fixture'; article.dataset.fixture = name;
      const heading = document.createElement('h2'); heading.textContent = options.title || '删除一条合成记录';
      const select = document.createElement('select'); select.innerHTML = '<option value="A">合成记录 A</option><option value="B">合成记录 B</option>';
      const targets = ['A', 'B'].map(id => {
        const target = document.createElement('section'); target.className = 'target card'; target.dataset.entity = id;
        const title = document.createElement('strong'); title.textContent = '合成记录 ' + id;
        const note = document.createElement('p'); note.textContent = '此处仅测试危险区域染色，不含真实聊天或配置。'; target.append(title, note); return target;
      });
      const actions = document.createElement('div'); actions.className = 'actions';
      const existingHint = document.createElement('small'); existingHint.id = 'existing-hint-' + name; existingHint.textContent = '已有说明';
      const state = { article, select, targets, count: 0, locked: false, fail: options.mode === 'fail-once', current: 'A', extraControllers: [] };
      const action = async () => {
        state.count++;
        if (options.lockOnAction) state.locked = true;
        if (options.mode === 'held') await new Promise(resolve => { state.release = resolve; });
        await Promise.resolve();
        if (state.fail) { state.fail = false; throw new Error('合成失败：请重试'); }
      };
      const settings = {
        ...(options.clicks === undefined ? {} : { clicks: options.clicks }),
        target: () => options.multiple ? targets : targets[state.current === 'A' ? 0 : 1],
        key: () => state.current,
        impact: () => options.impact || `将删除当前选择的合成记录 ${state.current}；此测试只增加计数，不会删除真实数据。`,
        canActivate: () => !state.locked,
        windowTint: options.windowTint === true,
      };
      let button;
      if (options.factory) button = api.destructiveButton(options.label || '删除记录', action, settings);
      else {
        button = document.createElement('button'); button.type = 'button'; button.textContent = options.label || '删除记录';
        button.setAttribute('aria-describedby', existingHint.id);
        state.controller = api.bindDestructiveAction(button, { action, ...settings });
      }
      state.button = button; button.id = 'button-' + name;
      select.addEventListener('change', () => { state.current = select.value; });
      actions.append(button); article.append(heading, select, ...targets, actions, existingHint); document.querySelector('#fixture-host').append(article);
      qa168.states[name] = state; return name;
    };
    qa168.read = name => {
      const state = qa168.states[name], button = state.button, progress = button.querySelector('.danger-progress');
      const description = button.getAttribute('aria-describedby');
      const feedback = (description || '').split(/\s+/).map(id => document.getElementById(id)).find(node => node?.classList.contains('danger-feedback'));
      return { progress: Number(button.dataset.dangerProgress || 0), clicks: Number(button.dataset.dangerClicks), count: state.count,
        disabled: button.disabled, barRole: progress?.getAttribute('role'), barNow: Number(progress?.getAttribute('aria-valuenow')),
        barMin: progress?.getAttribute('aria-valuemin'), barMax: progress?.getAttribute('aria-valuemax'),
        description, feedback: feedback?.textContent || '', error: state.article.querySelector('.danger-error')?.textContent || '',
        washes: state.targets.map(target => [...target.querySelectorAll('.danger-wash')].map(wash => ({ opacity: Number(getComputedStyle(wash).opacity), color: getComputedStyle(wash).backgroundColor, image: getComputedStyle(wash).backgroundImage }))) };
    };
  });
  const mount = async (name, options = {}) => { await page.evaluate(() => qa168.clean()); await page.evaluate(({ name, options }) => qa168.mount(name, options), { name, options }); };
  const click = (name, times = 1) => page.evaluate(({ name, times }) => { for (let i = 0; i < times; i++) qa168.states[name].button.click(); }, { name, times });
  const read = name => page.evaluate(name => qa168.read(name), name);
  const settle = () => page.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); });
  const settleCss = name => page.evaluate(async name => {
    const state = qa168.states[name], virtualStart = performance.now(), pending = new Map();
    const feedback = (state.button.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)).find(node => node?.classList.contains('danger-feedback'));
    const roots = [state.article, feedback].filter(Boolean);
    let cancelled = 0;
    const capture = () => {
      for (const node of roots) {
        node.getBoundingClientRect(); getComputedStyle(node).opacity;
        for (const animation of node.getAnimations({ subtree: true })) {
          if (pending.has(animation)) continue;
          // Capture both promises together: removing/disposal cancels a CSS
          // transition and rejects finished even if ready has not resolved.
          pending.set(animation, Promise.all([animation.ready, animation.finished]).catch(error => {
            if (error?.name !== 'AbortError') throw error;
            cancelled++;
          }));
        }
      }
    };
    capture();
    await new Promise(window.qa168PaintFrame);
    capture();
    await Promise.all(pending.values());
    return { captured: pending.size, cancelled, virtualStart, virtualEnd: performance.now() };
  }, name);

  await check('default two-click threshold, accessible inline impact and progress', async () => {
    await mount('default', { factory: true }); await click('default');
    await page.clock.runFor(180);
    result.cssPaintWait = await settleCss('default');
    assert.equal(result.cssPaintWait.virtualEnd, result.cssPaintWait.virtualStart, 'Native CSS completion does not advance the paused 500ms behavioral hold');
    const half = await read('default'); closeTo(half.progress, .5, 'first click'); assert.equal(half.clicks, 2); assert.equal(half.count, 0);
    assert.equal(await page.getByRole('button', { name: '删除记录', exact: true }).count(), 1, 'Progressbar insertion preserves the button accessible name');
    assert.equal(half.barRole, 'progressbar'); closeTo(half.barNow, 50, 'accessible progress', 1); assert.equal(half.barMin, '0'); assert.equal(half.barMax, '100');
    assert.match(half.feedback, /合成记录 A/); assert.ok(half.description);
    assert.equal(await page.evaluate(() => document.querySelectorAll('dialog').length), 0, 'No confirmation dialog is introduced');
    const described = await page.evaluate(() => {
      const button = qa168.states.default.button;
      return button.getAttribute('aria-describedby').split(/\s+/).some(id => document.getElementById(id)?.classList.contains('danger-feedback'));
    });
    assert.equal(described, true, 'Impact description is attached to its button');
    assert.equal(await page.evaluate(() => {
      const id = qa168.states.default.button.getAttribute('aria-describedby').split(/\s+/).find(id => document.getElementById(id)?.classList.contains('danger-feedback'));
      return getComputedStyle(document.getElementById(id)).pointerEvents;
    }), 'none', 'Inline feedback cannot block nearby controls');
    assert.ok(half.washes[0].some(wash => wash.opacity > 0)); assert.equal(half.washes[1].length, 0);
    await click('default'); await settle(); assert.equal((await read('default')).count, 1);
  });

  await check('500ms hold then constant linear decay, with fresh clicks required after decay', async () => {
    await mount('decay'); await click('decay');
    await page.clock.runFor(499); closeTo((await read('decay')).progress, .5, '499ms hold', .002);
    await page.clock.runFor(251); closeTo((await read('decay')).progress, .5 - 250 / 1500, '750ms linear sample');
    await page.clock.runFor(250); closeTo((await read('decay')).progress, .5 - 500 / 1500, '1000ms linear sample');
    await click('decay'); const resumed = await read('decay'); assert.equal(resumed.count, 0); closeTo(resumed.progress, 2 / 3, 'decay plus one click');
    await page.clock.runFor(500); closeTo((await read('decay')).progress, resumed.progress, 'a new click restarts 500ms hold', .005);
    await page.clock.runFor(1600); closeTo((await read('decay')).progress, 0, 'decay reaches zero', .002);
    await click('decay'); closeTo((await read('decay')).progress, .5, 'fresh accumulation'); assert.equal((await read('decay')).count, 0);
    await click('decay'); await settle(); assert.equal((await read('decay')).count, 1);
  });

  await check('all configured thresholds from two through six execute only at 100%', async () => {
    for (let clicks = 2; clicks <= 6; clicks++) {
      await mount('threshold', { clicks }); await click('threshold', clicks - 1);
      const before = await read('threshold'); assert.equal(before.count, 0); assert.equal(before.clicks, clicks); closeTo(before.progress, (clicks - 1) / clicks, `${clicks}-click threshold`);
      await click('threshold'); await settle(); assert.equal((await read('threshold')).count, 1, `${clicks} clicks perform exactly one action`);
    }
  });

  await check('pending async action rejects repeat dispatch and honors a permanent disabled lock', async () => {
    await mount('pending', { mode: 'held' }); await click('pending', 2);
    assert.equal((await read('pending')).disabled, true); assert.equal((await read('pending')).count, 1);
    await page.evaluate(() => { const state = qa168.states.pending; for (let i = 0; i < 20; i++) state.button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await page.clock.runFor(3000); assert.equal((await read('pending')).count, 1);
    await page.evaluate(() => qa168.states.pending.release()); await settle(); assert.equal((await read('pending')).disabled, false);
    await mount('locked', { mode: 'held', lockOnAction: true }); await click('locked', 2);
    await page.evaluate(() => qa168.states.locked.release()); await settle(); assert.equal((await read('locked')).disabled, true);
    await page.evaluate(() => qa168.states.locked.button.dispatchEvent(new MouseEvent('click', { bubbles: true }))); assert.equal((await read('locked')).count, 1);
  });

  await check('failed async action shows its error and allows a fresh complete retry', async () => {
    await mount('failure', { mode: 'fail-once' }); await click('failure', 2); await settle();
    const failed = await read('failure'); assert.equal(failed.count, 1); assert.equal(failed.disabled, false); closeTo(failed.progress, 0, 'failure clears old progress'); assert.match(failed.error, /合成失败/);
    await click('failure'); assert.equal((await read('failure')).count, 1); await click('failure'); await settle(); assert.equal((await read('failure')).count, 2);
  });

  await check('held Enter repeat cannot accumulate additional clicks', async () => {
    await mount('keyboard', { clicks: 3 }); await page.locator('#button-keyboard').focus();
    await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    const held = await read('keyboard'); assert.equal(held.count, 0); closeTo(held.progress, 1 / 3, 'one physical Enter press');
    await page.keyboard.press('Enter'); closeTo((await read('keyboard')).progress, 2 / 3, 'second physical Enter press');
    await page.keyboard.press('Enter'); await settle(); assert.equal((await read('keyboard')).count, 1);
    await mount('space', { clicks: 3 }); await page.locator('#button-space').focus();
    await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
    closeTo((await read('space')).progress, 1 / 3, 'one physical Space press'); assert.equal((await read('space')).count, 0);
  });

  await check('dynamic selection and logical key replace the old target and progress', async () => {
    await mount('selection'); await click('selection');
    await page.selectOption('[data-fixture=selection] select', 'B'); await click('selection');
    await page.waitForTimeout(180);
    const changed = await read('selection'); closeTo(changed.progress, .5, 'new target starts from first click'); assert.equal(changed.count, 0);
    assert.ok(changed.washes[0].every(wash => wash.opacity === 0), 'Old target loses its wash'); assert.ok(changed.washes[1].some(wash => wash.opacity > 0)); assert.match(changed.feedback, /合成记录 B/);
    await page.selectOption('[data-fixture=selection] select', 'A'); await click('selection'); assert.equal((await read('selection')).count, 0); closeTo((await read('selection')).progress, .5, 'returning to prior key has no retained progress');
    await click('selection'); await settle(); assert.equal((await read('selection')).count, 1);
    await mount('multiple', { multiple: true, clicks: 4 }); await click('multiple');
    await page.waitForTimeout(180);
    assert.ok((await read('multiple')).washes.every(washes => washes.some(wash => wash.opacity > 0)), 'Every dynamically resolved affected element receives a wash');
  });

  await check('redrawn targets keep the current progress and shared targets retain positioning until the last reset', async () => {
    await mount('redraw'); await click('redraw');
    await page.evaluate(() => {
      const state = qa168.states.redraw, old = state.targets[0], replacement = old.cloneNode(true);
      replacement.querySelectorAll('.danger-wash').forEach(node => node.remove()); replacement.style.position = '';
      old.replaceWith(replacement); state.retiredTarget = old; state.targets[0] = replacement;
    });
    await settle(); await page.waitForTimeout(180); closeTo((await read('redraw')).progress, .5, 'redraw retains logical progress');
    assert.ok((await read('redraw')).washes[0].some(wash => wash.opacity > 0), 'A replacement DOM target is painted without another click');
    assert.equal(await page.evaluate(() => qa168.states.redraw.retiredTarget.querySelectorAll('.danger-wash').length), 0, 'Retired target loses its overlay');
    await mount('shared');
    await page.evaluate(() => {
      const state = qa168.states.shared; state.targets[0].style.position = 'static';
      const second = document.createElement('button'); second.textContent = '另一个删除入口'; state.article.querySelector('.actions').append(second);
      const controller = qa168.api.bindDestructiveAction(second, { action: () => { state.count++; }, target: () => state.targets[0], impact: '共享合成目标', clicks: 2 });
      state.extraControllers.push(controller); state.sharedButton = second; state.button.click(); second.click();
    });
    assert.equal((await read('shared')).washes[0].length, 2);
    await page.evaluate(() => qa168.states.shared.controller.reset());
    assert.equal((await read('shared')).washes[0].length, 1); assert.equal(await page.evaluate(() => qa168.states.shared.targets[0].style.position), 'relative', 'Remaining wash keeps its containing block');
    await page.evaluate(() => qa168.states.shared.extraControllers[0].reset());
    assert.equal((await read('shared')).washes[0].length, 0); assert.equal(await page.evaluate(() => qa168.states.shared.targets[0].style.position), 'static', 'Last reset restores the original position');
  });

  await check('Escape, visibility, pagehide and explicit reset clear progress and window tint', async () => {
    for (const trigger of ['escape', 'visibility', 'pagehide', 'reset', 'global-reset']) {
      await mount('lifecycle', { windowTint: true }); await click('lifecycle');
      if (trigger === 'escape') await page.keyboard.press('Escape');
      else await page.evaluate(trigger => {
        if (trigger === 'visibility') {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; delete document.hidden;
        } else if (trigger === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide'));
        else if (trigger === 'reset') qa168.states.lifecycle.controller.reset();
        else qa168.api.resetDestructiveActions();
      }, trigger);
      const state = await read('lifecycle'); closeTo(state.progress, 0, trigger + ' resets progress', .001); assert.equal(state.count, 0); assert.ok(state.washes.flat().every(wash => wash.opacity === 0));
      const tint = await page.evaluate(() => qa168.tint); assert.ok(tint.some(value => value > 0)); assert.equal(tint.at(-1), 0, trigger + ' clears document window tint');
    }
  });

  await check('detaching or disposing a button removes stale state and restores existing descriptions', async () => {
    await mount('detach', { windowTint: true }); await click('detach');
    await page.evaluate(() => qa168.states.detach.article.remove()); await settle(); await page.clock.runFor(32);
    closeTo((await read('detach')).progress, 0, 'detached state', .001); assert.equal(await page.evaluate(() => qa168.tint.at(-1)), 0);
    await mount('dispose', { windowTint: true }); await click('dispose');
    const disposingPaint = settleCss('dispose');
    await page.evaluate(() => { qa168.states.dispose.controller.dispose(); qa168.states.dispose.controller.dispose(); qa168.states.dispose.button.click(); });
    result.disposePaintWait = await disposingPaint;
    assert.equal(result.disposePaintWait.virtualEnd, result.disposePaintWait.virtualStart, 'Disposal ends the CSS wait without advancing behavioral time');
    const disposed = await read('dispose'); closeTo(disposed.progress, 0, 'disposed state', .001); assert.equal(disposed.count, 0); assert.equal(disposed.description, 'existing-hint-dispose');
    assert.equal(await page.evaluate(() => qa168.states.dispose.article.querySelectorAll('.danger-feedback,.danger-wash').length), 0);
    assert.equal(await page.evaluate(() => qa168.tint.at(-1)), 0);
  });

  await check('theme danger color controls the wash and progress remains visible on narrow screens', async () => {
    await page.setViewportSize({ width: 360, height: 780 });
    await mount('theme', { clicks: 6, multiple: true, title: '重置全部合成数据', label: '重置全部合成数据', impact: '将清空合成聊天、记忆、密钥与设置。先建立原数据备份，再提交重置申请；完整清理在下次启动时执行。此测试只修改内存计数器。' });
    await page.evaluate(() => document.documentElement.style.setProperty('--bad', '#c43222')); await click('theme', 2);
    await page.waitForTimeout(180);
    const first = await read('theme'); const firstPaint = JSON.stringify(first.washes);
    const firstBarColor = await page.locator('#button-theme .danger-progress').evaluate(node => getComputedStyle(node).backgroundColor);
    await page.screenshot({ path: path.join(evidenceDir, 'narrow-red-progress.png'), fullPage: true, animations: 'disabled' });
    await page.evaluate(() => document.documentElement.style.setProperty('--bad', '#a043d2'));
    const secondPaint = JSON.stringify((await read('theme')).washes); assert.notEqual(firstPaint, secondPaint, 'Target paint consumes the current theme danger variable');
    assert.notEqual(await page.locator('#button-theme .danger-progress').evaluate(node => getComputedStyle(node).backgroundColor), firstBarColor, 'Progressbar consumes the same danger variable');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal page overflow at 360px');
    assert.equal(await page.locator('.danger-feedback').evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; }), true, 'Feedback remains inside the narrow viewport');
    assert.ok(first.washes.flat().some(wash => wash.opacity > 0)); closeTo((await read('theme')).progress, 1 / 3, 'screenshot does not alter logical progress');
    await page.screenshot({ path: path.join(evidenceDir, 'narrow-custom-danger-progress.png'), fullPage: true, animations: 'disabled' });
    await page.evaluate(() => document.documentElement.style.removeProperty('--bad')); await page.setViewportSize({ width: 1100, height: 850 });
  });

  await check('reduced motion keeps accumulation, holding, decay and inline impact intact', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await mount('reduce', { clicks: 4, multiple: true }); await click('reduce', 2);
    closeTo((await read('reduce')).progress, .5, 'reduced-motion accumulation'); assert.equal((await read('reduce')).count, 0);
    await page.clock.runFor(499); closeTo((await read('reduce')).progress, .5, 'reduced-motion hold', .002);
    await page.clock.runFor(251); closeTo((await read('reduce')).progress, 1 / 3, 'reduced-motion linear decay');
    const state = await read('reduce'); assert.match(state.feedback, /合成记录/); assert.ok(state.washes.flat().some(wash => wash.opacity > 0));
    await page.screenshot({ path: path.join(evidenceDir, 'reduced-motion-progress.png'), fullPage: true, animations: 'disabled' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await check('component is isolated from live services and has no uncaught browser errors', async () => {
    assert.deepEqual(errors, []); assert.deepEqual(blockedRequests, []); assert.ok(requests.every(request => request.method === 'GET' || request.method === 'HEAD'));
    assert.ok(requests.every(request => !request.path.startsWith('/api/'))); assert.notEqual(server.address().port, 15967);
    result.requests = requests; result.browserErrors = errors;
  });
} catch (error) {
  result.fatal = error.message; throw error;
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  result.passed = !result.fatal && result.checks.length > 0 && result.checks.every(check => check.passed); fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(result, null, 2));
}
assert.equal(result.passed, true, 'Destructive component QA failed; see ' + path.join(evidenceDir, 'report.json'));
console.log(`✓ 168 ${result.checks.length} checks; evidence: ${evidenceDir}`);
