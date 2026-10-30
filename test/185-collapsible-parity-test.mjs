import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createRequire} from 'node:module';
const assets = new Map([
  ['/', ['text/html', '<!doctype html><meta charset=utf-8><style>*{box-sizing:border-box}details{border:1px solid;padding:12px;width:500px}summary{height:30px}section{height:240px}</style><details data-collapsible><summary tabindex="0">展开设置 <button>独立动作</button><label><input type="checkbox">独立开关</label></summary><section><input aria-label="内容输入"></section></details><script type="module" src="/fixture.js"></script>']],
  ['/fixture.js', ['text/javascript', "import{installCollapsibles,collapsibleExpanded}from'/collapsible.js';import{installMotion}from'/motion.js';const a=installMotion();const b=installCollapsibles(document);window.logicalExpanded=collapsibleExpanded;window.dispose=()=>{a();b();};window.ready=true;"]],
  ['/collapsible.js', ['text/javascript', fs.readFileSync(new URL('../ui/panels/collapsible.js', import.meta.url), 'utf8')]],
  ['/motion.js', ['text/javascript', fs.readFileSync(new URL('../ui/panels/motion.js', import.meta.url), 'utf8')]],
]);
const server = http.createServer((req,res) => {const asset = assets.get(req.url);res.writeHead(asset ? 200 : 404, {'content-type': asset?.[0] || 'text/plain'});res.end(asset?.[1] || 'missing');});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a,b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || versions.map(v => path.join(cache,v,'chrome-win64/chrome.exe')).find(f => fs.existsSync(f));
  assert.ok(executablePath); browser = await playwright.chromium.launch({executablePath, headless: process.env.QA_HEADED !== '1'});
  const page = await browser.newPage(), base = `http://127.0.0.1:${server.address().port}`, errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(base); await page.waitForFunction(() => window.ready);
  const summary = page.locator('summary'), details = page.locator('details');
  const click = () => summary.click({position: {x: 6, y: 12}});
  const snapshot = () => details.evaluate(node => ({open: node.open, height: node.getBoundingClientRect().height, animations: node.getAnimations().length, style: node.getAttribute('style') || '', inert: node.querySelector('section').inert}));
  const settled = () => page.waitForFunction(() => !document.querySelector('details').getAnimations().length);
  const pausedClick = async time => {
    const from = await page.evaluate(time => {
      const node = document.querySelector('details'), before = node.getBoundingClientRect().height;
      node.querySelector('summary').click();
      const animation = node.getAnimations()[0];
      if (!animation) throw new Error('Expected the actual fold animation');
      if (node.getAnimations({subtree:true}).length !== 1) throw new Error('Competing mount/fold effects');
      const first = Number.parseFloat(animation.effect.getKeyframes()[0].height);
      animation.pause(); animation.currentTime = time; return {before, first};
    }, time);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(Math.abs(from.before - from.first) < 1, 'reversal starts at its current visible height');
  };
  const play = () => page.evaluate(() => document.querySelector('details').getAnimations()[0].play());
  const closed = (await snapshot()).height;
  await click(); await settled(); const expanded = (await snapshot()).height; assert.ok(expanded > closed + 200);
  await pausedClick(80);
  const mid = await snapshot(); assert.equal(mid.open, true); assert.equal(mid.inert, true); assert.ok(mid.height > closed && mid.height < expanded);
  assert.equal(await details.evaluate(node => window.logicalExpanded(node)),false,'render snapshots preserve the closing intent, not the temporary native open slot');
  await play(); await settled(); assert.equal((await snapshot()).open,false); assert.equal((await snapshot()).inert,false); assert.equal((await snapshot()).style,'');
  // Inspect real WAAPI effects at controlled times instead of racing wall time.
  await pausedClick(40); await pausedClick(30); await pausedClick(30); await play();
  await settled(); assert.equal((await snapshot()).open,true);
  // Separate trusted pointer gesture coverage, using the title itself.
  await click(); await settled(); await click(); await click(); await click();
  await settled(); assert.equal((await snapshot()).open,true);
  await page.getByRole('button',{name:'独立动作'}).click(); assert.equal((await snapshot()).open,true);
  await page.getByRole('checkbox',{name:'独立开关'}).check(); assert.equal((await snapshot()).open,true);
  assert.equal(await page.getByRole('checkbox',{name:'独立开关'}).isChecked(),true);
  await summary.focus(); await page.keyboard.press('Enter'); await settled(); assert.equal((await snapshot()).open,false);
  await page.keyboard.press('Space'); await settled(); assert.equal((await snapshot()).open,true);
  await page.emulateMedia({reducedMotion:'reduce'}); await click();
  assert.equal((await snapshot()).open,false); assert.equal((await snapshot()).animations,0);
  await page.emulateMedia({reducedMotion:'no-preference'}); await click(); await page.emulateMedia({reducedMotion:'reduce'}); await settled();
  assert.equal((await snapshot()).open,true); assert.equal((await snapshot()).style,'');
  await page.emulateMedia({reducedMotion:'no-preference'}); await click();
  await page.evaluate(() => window.dispose()); assert.equal((await snapshot()).open,false); assert.equal((await snapshot()).animations,0);
  await page.evaluate(async () => {window.dispose=(await import('/collapsible.js')).installCollapsibles(document);});
  await click();
  await page.evaluate(() => {window.removed=document.querySelector('details');window.removed.remove();});
  await page.waitForFunction(() => !window.removed.getAnimations().length);
  assert.equal(await page.evaluate(() => window.removed.querySelector('section').inert),false);
  assert.deepEqual(errors,[]); console.log('✓ 185 real browser: intermediate flow, reversal, keyboard, embedded controls, reduced motion, disposal/removal');
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve => server.close(resolve));}
