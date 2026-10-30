// Real Chromium, live requestAnimationFrame samples and a random-port static
// fixture. No kernel, account, process adapter or production console is started.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..'), uiRoot = path.join(root, 'ui');
const evidenceOption = process.argv.indexOf('--evidence-dir');
const evidenceDir = evidenceOption < 0 ? path.join(root, '.qa-local/visual-interactions180') : path.resolve(process.argv[evidenceOption + 1]);
const headed = process.argv.includes('--headed') || process.env.QA_HEADLESS === '0';
fs.mkdirSync(evidenceDir, { recursive: true });
const errors = [], outbound = [], requests = [], checks = [], evidence = {};
const streams = new Set();
const ids = ['sessions', 'chats', 'memory', 'usage', 'skills', 'plugins', 'logs', 'settings'];
const manifest = { panels: ids.map((id, index) => ({ id, kind: 'bundled', title: `合成面板 ${index + 1}`, description: '视觉回归合成面板', entry: 'qa180.html', permissions: [], api: [] })) };
const frameHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/panels/common.css"><main><h2>合成面板</h2><label>未保存草稿<input id="draft" value="synthetic-180-draft"></label><p>仅验证 iframe 身份与草稿保留。</p></main><script type="module">import '/panels/panel-client.js';</script></html>`;
const componentHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/panels/common.css"><style>body{margin:0;background:var(--bg);color:var(--text)}main{max-width:760px;margin:auto}.qa-row{box-sizing:border-box;min-height:92px;padding:16px;border:1px solid var(--line);margin:0 0 12px;position:relative}.qa-row h2{margin:0 0 8px;font-size:15px}.qa-row button{margin-right:12px}#rows{display:block}#result{margin-top:16px}</style><main><h1>合成删除视觉回归</h1><div id="rows"></div><p id="result" role="status"></p></main></html>`;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://fixture.invalid').pathname;
  requests.push({ method: req.method, pathname });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  if (pathname === '/api/panels') return json(manifest);
  if (pathname === '/api/status') return json({ paused: false, onebot: { connected: false }, sessions: { active: 0 } });
  if (pathname === '/api/config') return json({ ui: { refreshMs: 60000 }, api: { baseUrl: 'http://fixture.invalid/synthetic', model: 'synthetic-180' } });
  if (pathname === '/api/permissions/pending') return json({ requests: [] });
  if (pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    res.write('event: hello\ndata: {}\n\n'); streams.add(res); req.on('close', () => streams.delete(res)); return;
  }
  if (pathname === '/component') { res.setHeader('Content-Type', mime['.html']); res.end(componentHtml); return; }
  if (/^\/panels\/[a-z]+\/qa180\.html$/.test(pathname)) { res.setHeader('Content-Type', mime['.html']); res.end(frameHtml); return; }
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const relativePath = pathname === '/' ? 'shell/index.html' : pathname.startsWith('/panels/') ? pathname.slice(1) : `shell/${pathname.slice(1)}`;
  const file = path.resolve(uiRoot, relativePath), relative = path.relative(uiRoot, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const playwright = createRequire(import.meta.url)('playwright-core');
const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
const versions = fs.existsSync(cache) ? fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(name => path.join(cache, name, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
let browser, page;
const near = (actual, expected, label, tolerance = .6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} differs from ${expected} by more than ${tolerance}px`);
async function check(name, action) {
  try { await action(); checks.push({ name, passed: true }); console.log('✓ 180 ' + name); }
  catch (error) {
    checks.push({ name, passed: false, error: error.message }); console.error('FAIL 180 ' + name + ': ' + error.message);
    await page?.screenshot({ path: path.join(evidenceDir, `failure-${checks.length}.png`), fullPage: true }).catch(() => {});
  }
}

async function shell({ width = 1360, side = 'left', reducedMotion = 'no-preference' } = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/?token=synthetic-180-token`);
  await page.locator('#nav button').last().waitFor();
  await page.frameLocator('#panel-host iframe').locator('#draft').waitFor();
  await page.evaluate(async side => {
    document.body.dataset.sidebar = side;
    await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 450));
    window.qa180Frame = document.querySelector('#panel-host iframe');
  }, side);
  await page.frameLocator('#panel-host iframe').locator('#draft').fill('unsaved-180-retained');
}

async function sampleRail(toggles = [0], duration = 500) {
  return page.evaluate(({ toggles, duration }) => new Promise(resolve => {
    const started = performance.now(), frames = [];
    let nextToggle = 0;
    function read(time) {
      const rail = document.querySelector('.rail').getBoundingClientRect(), right = document.body.dataset.sidebar === 'right';
      const point = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { anchor: right ? rail.right - (box.left + box.width / 2) : box.left + box.width / 2 - rail.left, y: box.top + box.height / 2 - rail.top };
      };
      return { time: time - started, width: rail.width, side: right ? 'right' : 'left',
        frameRetained: document.querySelector('#panel-host iframe') === window.qa180Frame,
        logo: point('#brand-emblem svg'), footer: point('#ready-onebot .readiness-icon'),
        rows: [...document.querySelectorAll('#nav button')].map(node => {
          const box = node.getBoundingClientRect(), icon = node.querySelector('.nav-icon').getBoundingClientRect();
          return { id: node.dataset.panel, y: box.top - rail.top, height: box.height, anchor: right ? rail.right - (icon.left + icon.width / 2) : icon.left + icon.width / 2 - rail.left };
        }), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    }
    frames.push(read(started));
    function tick(time) {
      while (nextToggle < toggles.length && time - started >= toggles[nextToggle]) { document.querySelector('#brand-emblem').click(); nextToggle++; }
      frames.push(read(time));
      if (time - started < duration) requestAnimationFrame(tick); else resolve(frames);
    }
    requestAnimationFrame(tick);
  }), { toggles, duration });
}

function stableRail(frames, label, { animated = true } = {}) {
  assert.ok(frames.length >= 5, `${label}: enough live animation frames`);
  const first = frames[0];
  assert.equal(first.rows.length, ids.length, `${label}: every synthetic navigation row is measured`);
  const widths = frames.map(frame => frame.width), min = Math.min(...widths), max = Math.max(...widths);
  assert.ok(max - min > 40, `${label}: rail actually changes width`);
  if (animated) assert.ok(new Set(widths.filter(width => width > min + 2 && width < max - 2).map(width => width.toFixed(1))).size >= 3, `${label}: at least three actual intermediate widths`);
  for (const frame of frames) {
    assert.ok(frame.frameRetained, `${label}: iframe retained during each animation frame`);
    assert.equal(frame.overflow, false, `${label}: no horizontal viewport overflow`);
    near(frame.logo.anchor, first.logo.anchor, `${label} logo x`);
    near(frame.logo.y, first.logo.y, `${label} logo y`);
    near(frame.footer.anchor, first.footer.anchor, `${label} footer icon x`);
    near(frame.footer.y, first.footer.y, `${label} footer icon y`);
    for (const [index, row] of frame.rows.entries()) {
      near(row.height, 46, `${label} ${row.id} row height`, .1);
      near(row.y, first.rows[index].y, `${label} ${row.id} row y`, .2);
      near(row.anchor, first.rows[index].anchor, `${label} ${row.id} icon anchor`);
    }
  }
}

async function component({ mode = 'success', clicks = 2, reducedMotion = 'no-preference' } = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(base + '/component');
  await page.evaluate(async ({ mode, clicks }) => {
    const api = await import('/panels/destructive-action.js');
    const { destructiveRefresh } = await import('/panels/destructive-layout.js');
    const host = document.querySelector('#rows');
    const rows = ['A', 'B', 'C'].map(key => {
      const row = document.createElement('article'); row.className = 'qa-row'; row.dataset.motionKey = key;
      const title = document.createElement('h2'); title.textContent = `合成对象 ${key}`;
      const note = document.createElement('span'); note.textContent = `合成对象 ${key} 的独立内容`;
      row.append(title, note); host.append(row); return row;
    });
    const state = window.qa180 = { api, host, rows, calls: 0, refreshes: 0, finished: false, release: null };
    const button = document.createElement('button'); button.textContent = '删除合成对象'; button.id = 'delete-180'; rows[0].append(button);
    state.button = button;
    state.controller = api.bindDestructiveAction(button, {
      clicks, target: () => rows[0], key: () => 'synthetic-A', impact: '删除当前合成对象 A。',
      ...(mode === 'early-remove' ? {} : { layoutMotion: false }),
      action: async () => {
        state.calls++;
        if (mode === 'held') await new Promise(resolve => { state.release = resolve; });
        if (mode === 'fail') throw new Error('合成删除失败：对象仍然保留');
        if (mode === 'early-remove') {
          rows[0].remove();
          await new Promise(resolve => { state.release = resolve; });
          state.finished = true; return;
        }
        await destructiveRefresh(rows[0], () => { state.refreshes++; rows[0].remove(); }, { container: host });
        state.finished = true;
      },
    });
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    state.initialNextY = rows[1].getBoundingClientRect().top;
    state.initialSurvivorStyles = rows.slice(1).map(node => {
      const style = getComputedStyle(node);
      return { inline: node.getAttribute('style') || '', inert: node.inert,
        opacity: style.opacity, transform: style.transform, translate: style.translate,
        filter: style.filter, clipPath: style.clipPath, willChange: style.willChange };
    });
  }, { mode, clicks });
}

async function sampleDeletion({ clicks = [], releaseAt = null, duration = 450 } = {}) {
  return page.evaluate(({ clicks, releaseAt, duration }) => new Promise(resolve => {
    const started = performance.now(), frames = [], state = window.qa180;
    let nextClick = 0, released = false;
    const visibleHints = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), found = [];
      let text;
      while ((text = walker.nextNode())) {
        if (!/再点击|剩余.{0,8}次|0[.．]5\s*秒|停止点击/.test(text.textContent)) continue;
        let element = text.parentElement, visible = true;
        while (element && element !== document.body) {
          const style = getComputedStyle(element), box = element.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || box.width <= 2 || box.height <= 2 || style.clipPath !== 'none' || element.hidden) { visible = false; break; }
          element = element.parentElement;
        }
        if (visible) found.push(text.textContent);
      }
      return found;
    };
    function read(time) {
      const row = state.rows[0], next = state.rows[1], box = row.getBoundingClientRect(), nextBox = next.getBoundingClientRect();
      const track = state.button.querySelector('.danger-progress'), matrix = track ? getComputedStyle(track).transform : 'none';
      const visual = matrix === 'none' ? (track ? 1 : 0) : new DOMMatrixReadOnly(matrix).a;
      const wash = row.querySelector('.danger-wash'), layers = [...row.querySelectorAll('.danger-wash,.danger-motion,.danger-motion *')];
      const decoration = [];
      for (const layer of layers) for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(layer, pseudo);
        decoration.push({ image: style.backgroundImage, clip: style.clipPath, filter: style.filter, opacity: Number(style.opacity), transform: style.transform, content: style.content });
      }
      const style = getComputedStyle(row);
      const ghost = document.querySelector('.danger-removal-ghost'), ghostStyle = ghost && getComputedStyle(ghost);
      const survivorStylesClean = state.rows.slice(1).every((node, index) => {
        const current = getComputedStyle(node), initial = state.initialSurvivorStyles[index];
        return (node.getAttribute('style') || '') === initial.inline && node.inert === initial.inert &&
          ['opacity', 'transform', 'translate', 'filter', 'clipPath', 'willChange'].every(key => current[key] === initial[key]);
      });
      return { time: time - started, logical: Number(state.button.dataset.dangerProgress || 0), visual,
        washOpacity: wash ? Number(getComputedStyle(wash).opacity) : 0, decoration,
        calls: state.calls, refreshes: state.refreshes, finished: state.finished,
        connected: row.isConnected, opacity: Number(style.opacity), transform: style.transform, filter: style.filter,
        rowY: box.top, nextY: nextBox.top, nextOpacity: Number(getComputedStyle(next).opacity),
        siblingRetained: document.querySelector('[data-motion-key="B"]') === next,
        initialNextY: state.initialNextY, ghostCount: document.querySelectorAll('.danger-removal-ghost').length,
        ghostOpacity: ghostStyle ? Number(ghostStyle.opacity) : null,
        ghostClip: ghostStyle?.clipPath, ghostPointerEvents: ghostStyle?.pointerEvents,
        ghostInert: ghost ? ghost.inert || [...ghost.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].every(node => node.disabled || node.tabIndex < 0) : null,
        visibleHints: visibleHints(), error: document.querySelector('.danger-error')?.textContent || '',
        survivorStylesClean,
        decorativeNodeCount: document.querySelectorAll('.danger-removal-ghost,.danger-exit-fragments,.danger-wash,.danger-feedback,.danger-progress').length,
        pausedAnimationCount: document.getAnimations().filter(animation => animation.playState === 'paused').length,
        animationCount: document.getAnimations().filter(animation => animation.playState === 'running').length };
    }
    frames.push(read(started));
    function tick(time) {
      while (nextClick < clicks.length && time - started >= clicks[nextClick]) { state.button.click(); nextClick++; }
      if (!released && releaseAt !== null && time - started >= releaseAt && state.release) { released = true; state.release(); }
      frames.push(read(time));
      if (time - started < duration) requestAnimationFrame(tick); else resolve(frames);
    }
    requestAnimationFrame(tick);
  }), { clicks, releaseAt, duration });
}

function smoothProgress(frames, expected, label) {
  assert.ok(frames.every(frame => frame.calls === 0), `${label}: progress does not dispatch the action early`);
  assert.ok(frames.every(frame => frame.visibleHints.length === 0), `${label}: no visible remaining-click or 0.5-second instructions`);
  assert.ok(new Set(frames.filter(frame => frame.visual > .001 && frame.visual < expected - .001).map(frame => frame.visual.toFixed(4))).size >= 3, `${label}: visible bar fills through multiple actual intermediate values`);
  near(frames.at(-1).visual, expected, `${label} final visible progress`, .035);
  const washTarget = expected * .46;
  assert.ok(new Set(frames.filter(frame => frame.washOpacity > .001 && frame.washOpacity < washTarget - .001).map(frame => frame.washOpacity.toFixed(4))).size >= 3, `${label}: first target wash fades through multiple actual intermediate opacities`);
  near(frames.at(-1).washOpacity, washTarget, `${label} final wash opacity`, .015);
  for (let index = 1; index < frames.length; index++) {
    assert.ok(frames[index].visual >= frames[index - 1].visual - .02, `${label}: visible filling is monotonic`);
    assert.ok(frames[index].washOpacity >= frames[index - 1].washOpacity - .01, `${label}: first target wash grows monotonically`);
  }
}

function cancelledLayout(frames, label) {
  for (const frame of frames) {
    assert.equal(frame.ghostCount, 0, `${label}: no ghost remains`);
    assert.equal(frame.pausedAnimationCount, 0, `${label}: no paused animation remains`);
    assert.equal(frame.animationCount, 0, `${label}: no decorative animation remains`);
    assert.equal(frame.decorativeNodeCount, 0, `${label}: no decorative DOM remains`);
    assert.equal(frame.survivorStylesClean, true, `${label}: surviving row styles and interaction state are restored`);
    assert.equal(frame.siblingRetained, true, `${label}: surviving row identity is retained`);
    assert.equal(frame.calls, 1, `${label}: cancellation does not repeat the business action`);
  }
}

function exitAndReflow(frames, { earlyRemoval = false } = {}) {
  assert.equal(frames.at(-1).calls, 1, 'Exactly one synthetic action');
  assert.equal(frames.at(-1).refreshes, earlyRemoval ? 0 : 1, 'Synthetic refresh count matches the chosen ownership path');
  assert.equal(frames.at(-1).finished, true);
  assert.ok(frames.every(frame => frame.siblingRetained), 'Reflow preserves surviving DOM node identities');
  const exit = frames.filter(frame => earlyRemoval
    ? frame.ghostCount === 1 && frame.ghostOpacity > .02 && frame.ghostOpacity < .98
    : frame.connected && frame.opacity > .02 && frame.opacity < .98);
  assert.ok(exit.length >= 2, 'Successful deletion has visible fault-exit intermediate frames before removal');
  if (!earlyRemoval) assert.ok(frames.filter(frame => frame.connected).every(frame => frame.refreshes === 0), 'The refresh follows the visible exit');
  const first = frames[0].nextY, last = frames.at(-1).nextY;
  assert.ok(first - last > 70, 'A surviving row actually moves into the deleted row space');
  const reflow = frames.filter(frame => !frame.connected && frame.ghostCount === 0 && frame.nextY > last + 1 && frame.nextY < first - 1);
  assert.ok(new Set(reflow.map(frame => frame.nextY.toFixed(1))).size >= 3, 'The surviving row occupies multiple intermediate positions');
  let largestJump = 0;
  for (let index = 1; index < frames.length; index++) largestJump = Math.max(largestJump, Math.abs(frames[index].nextY - frames[index - 1].nextY));
  assert.ok(largestJump < (first - last) * .7, 'The list closes the gap smoothly instead of jumping directly to the final layout');
  near(frames.at(-1).nextOpacity, 1, 'Surviving row final opacity', .01);
  assert.equal(frames.at(-1).ghostCount, 0, 'The completed transition leaves no removal ghost');
}

try {
  assert.ok(executablePath, 'An installed local Chromium is required; no browser download is attempted');
  browser = await playwright.chromium.launch({ executablePath, headless: !headed });
  page = await browser.newPage({ viewport: { width: 1360, height: 900 }, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push('Unexpected dialog: ' + dialog.message()); void dialog.dismiss(); });
  await page.route('**/*', route => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    outbound.push(route.request().url()); return route.abort();
  });
  await page.addInitScript(() => { if (window === top) localStorage.removeItem('qq-agent.sidebar-collapsed'); });

  await check('left rail retains every icon anchor and 46px row through collapse and expansion', async () => {
    await shell();
    const collapsing = sampleRail();
    if (headed) {
      await page.waitForFunction(() => { const width = document.querySelector('.rail').getBoundingClientRect().width; return width > 80 && width < 210; });
      await page.screenshot({ path: path.join(evidenceDir, 'sidebar-collapse-mid.png') });
    }
    evidence.leftCollapse = await collapsing; stableRail(evidence.leftCollapse, 'left collapse');
    evidence.leftExpand = await sampleRail(); stableRail(evidence.leftExpand, 'left expand');
    assert.equal(await page.frameLocator('#panel-host iframe').locator('#draft').inputValue(), 'unsaved-180-retained');
  });
  await check('rapid reversal preserves icon anchors, intermediate widths and the same iframe', async () => {
    await shell();
    evidence.reversal = await sampleRail([0, 75, 145, 215], 650); stableRail(evidence.reversal, 'rapid reversal');
    assert.equal(await page.locator('body').getAttribute('data-rail-collapsed'), 'false');
  });
  await check('right rail mirrors stable edge anchors throughout both directions', async () => {
    await shell({ side: 'right' });
    evidence.rightCollapse = await sampleRail(); stableRail(evidence.rightCollapse, 'right collapse');
    evidence.rightExpand = await sampleRail(); stableRail(evidence.rightExpand, 'right expand');
  });
  await check('narrow view keeps 46px rows, icon anchors and the active iframe during expansion', async () => {
    await shell({ width: 520 });
    assert.equal(await page.locator('body').getAttribute('data-rail-collapsed'), 'true');
    evidence.narrowExpand = await sampleRail(); stableRail(evidence.narrowExpand, 'narrow expand');
    evidence.narrowCollapse = await sampleRail(); stableRail(evidence.narrowCollapse, 'narrow collapse');
  });
  await check('reduced motion reaches the same geometry without an animated rail transition', async () => {
    await shell({ reducedMotion: 'reduce' });
    evidence.reduced = await sampleRail([0], 120); stableRail(evidence.reduced, 'reduced motion', { animated: false });
    const middle = evidence.reduced.slice(2).filter(frame => Math.abs(frame.width - evidence.reduced.at(-1).width) > .5);
    assert.equal(middle.length, 0, 'Reduced motion settles by the second frame');
  });

  await check('deletion progress paints smooth intermediate frames and omits visible click-count instructions', async () => {
    await component();
    evidence.progress = await sampleDeletion({ clicks: [0], duration: 350 });
    smoothProgress(evidence.progress, .5, 'first click');
    if (headed) await page.screenshot({ path: path.join(evidenceDir, 'deletion-progress-half.png') });
    evidence.decay = await sampleDeletion({ duration: 1100 });
    assert.ok(new Set(evidence.decay.filter(frame => frame.visual > .01 && frame.visual < .48).map(frame => frame.visual.toFixed(3))).size >= 8, 'Visible decay includes multiple actual intermediate values');
    for (let index = 1; index < evidence.decay.length; index++) assert.ok(evidence.decay[index].visual <= evidence.decay[index - 1].visual + .02, 'Visible decay stays monotonic');
  });
  await check('higher progress strengthens a layered fault-block treatment on the affected object', async () => {
    await component({ clicks: 6 });
    evidence.faultLow = await sampleDeletion({ clicks: [0], duration: 180 });
    evidence.faultHigh = await sampleDeletion({ clicks: [0, 160, 320, 480], duration: 660 });
    const high = evidence.faultHigh.at(-1), low = evidence.faultLow.at(-1);
    assert.ok(high.logical > .8 && low.logical < .2);
    assert.ok(high.washOpacity > low.washOpacity + .05, 'Fault overlay strength rises with progress');
    assert.ok(high.decoration.some(layer => layer.image !== 'none' || layer.clip !== 'none' || layer.filter !== 'none'), 'Fault treatment contains patterned, clipped or filtered layers rather than only a flat wash');
    assert.ok(evidence.faultHigh.every(frame => frame.calls === 0));
  });
  await check('pending action keeps the object, then success visibly exits it before smoothly closing the list gap', async () => {
    await component({ mode: 'held' });
    await page.evaluate(() => { qa180.button.click(); qa180.button.click(); });
    evidence.pending = await sampleDeletion({ duration: 180 });
    assert.ok(evidence.pending.every(frame => frame.connected && frame.calls === 1 && frame.refreshes === 0 && frame.opacity === 1));
    // 540ms exit + 240ms FLIP also cross async rendering frames. Keep the
    // intermediate-motion assertions, with room for headed screenshot work.
    const succeeding = sampleDeletion({ releaseAt: 0, duration: 1100 });
    if (headed) {
      await page.waitForFunction(() => { const opacity = Number(getComputedStyle(qa180.rows[0]).opacity); return qa180.rows[0].isConnected && opacity < .85 && opacity > .08; });
      await page.screenshot({ path: path.join(evidenceDir, 'deletion-exit-mid.png') });
      await page.waitForFunction(() => { const y = qa180.rows[1].getBoundingClientRect().top; return !qa180.rows[0].isConnected && y < qa180.initialNextY - 5 && y > qa180.initialNextY - 95; });
      await page.screenshot({ path: path.join(evidenceDir, 'deletion-reflow-mid.png') });
    }
    evidence.success = await succeeding;
    exitAndReflow(evidence.success);
  });
  await check('an early external DOM removal holds an inert visual placeholder until success, then exits and closes the gap', async () => {
    await component({ mode: 'early-remove' });
    await page.evaluate(() => { qa180.button.click(); qa180.button.click(); });
    evidence.earlyPending = await sampleDeletion({ duration: 180 });
    const held = evidence.earlyPending.filter(frame => frame.time >= 32);
    assert.ok(held.length >= 3);
    for (const frame of held) {
      assert.equal(frame.calls, 1); assert.equal(frame.finished, false);
      assert.equal(frame.ghostCount, 1, 'One visual placeholder covers an early external removal');
      assert.equal(frame.ghostPointerEvents, 'none'); assert.equal(frame.ghostInert, true);
      near(frame.ghostOpacity, 1, 'The pending placeholder remains visible', .01);
      near(frame.nextY, frame.initialNextY, 'The next row waits for confirmed success', .8);
    }
    if (headed) await page.screenshot({ path: path.join(evidenceDir, 'early-removal-pending.png') });
    evidence.earlySuccess = await sampleDeletion({ releaseAt: 0, duration: 850 });
    exitAndReflow(evidence.earlySuccess, { earlyRemoval: true });
  });
  for (const method of ['dispose', 'global-reset']) await check(`${method} cancels an early-removal placeholder and paused layout even before the business reply`, async () => {
    await component({ mode: 'early-remove' });
    await page.evaluate(() => { qa180.button.click(); qa180.button.click(); });
    evidence[method + 'Pending'] = await sampleDeletion({ duration: 100 });
    const pending = evidence[method + 'Pending'].at(-1);
    assert.equal(pending.ghostCount, 1, 'Cancellation starts with a real pending placeholder');
    assert.ok(pending.pausedAnimationCount > 0, 'Cancellation starts with a real paused layout animation');
    await page.evaluate(method => { if (method === 'dispose') qa180.controller.dispose(); else qa180.api.resetDestructiveActions(); }, method);
    evidence[method + 'Cancelled'] = await sampleDeletion({ duration: 120 });
    cancelledLayout(evidence[method + 'Cancelled'], method + ' pending cancellation');
    evidence[method + 'Released'] = await sampleDeletion({ releaseAt: 0, duration: 300 });
    cancelledLayout(evidence[method + 'Released'], method + ' after reply');
    assert.equal(evidence[method + 'Released'].at(-1).finished, true, 'The synthetic business reply still resolves after visual cancellation');
  });
  await check('failed deletion retains its object and its neighbors without running removal or reflow', async () => {
    await component({ mode: 'fail' });
    evidence.failure = await sampleDeletion({ clicks: [0, 90], duration: 600 });
    assert.equal(evidence.failure.at(-1).calls, 1);
    assert.ok(evidence.failure.every(frame => frame.connected && frame.siblingRetained && frame.refreshes === 0));
    assert.ok(evidence.failure.at(-1).nextY >= evidence.failure[0].nextY - .1, 'Failure does not close the retained object space; an inline error may add height');
    near(evidence.failure.at(-1).opacity, 1, 'Failure preserves target opacity', .01);
    assert.match(evidence.failure.at(-1).error, /合成删除失败/);
    if (headed) await page.screenshot({ path: path.join(evidenceDir, 'deletion-failure-preserved.png') });
  });
  await check('reduced motion performs the same successful deletion and list update without decorative delays', async () => {
    await component({ reducedMotion: 'reduce' });
    await page.evaluate(() => qa180.button.click());
    evidence.reducedDelete = await sampleDeletion({ clicks: [0], duration: 160 });
    assert.equal(evidence.reducedDelete.at(-1).finished, true);
    assert.equal(evidence.reducedDelete.at(-1).calls, 1);
    assert.equal(evidence.reducedDelete.at(-1).refreshes, 1);
    assert.ok(evidence.reducedDelete.filter(frame => frame.time >= 65).every(frame => !frame.connected && frame.animationCount === 0), 'Reduced motion does not retain a hidden animation wait');
  });
  await check('browser boundary remains synthetic and local', async () => {
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    assert.ok(requests.every(request => request.method === 'GET' || request.method === 'HEAD'));
    assert.ok(requests.every(request => !/launch|reset-data|test-send/.test(request.pathname)));
  });
} finally {
  await browser?.close();
  for (const stream of streams) stream.end();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify({ recordedAt: new Date().toISOString(), headed, checks, errors, outbound, requests, evidence }, null, 2));
}
assert.ok(checks.every(check => check.passed), `Visual interaction failures: ${checks.filter(check => !check.passed).map(check => check.name).join('; ')}`);
