// Actual editor/theme/shell CSS, decoded screenshot pixels and the real config
// store. Isolated headless Chromium only; no live QA state or native window.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';

const root = path.resolve(import.meta.dirname, '..'), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-crop111-'));
const log = { info() {}, warn() {}, error() {} };
let config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
function crc32(bytes) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function pngChunk(name, data) { const type = Buffer.from(name), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); type.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([type, data])), data.length + 8); return out; }
const width = 800, height = 450, raw = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const colors = [[214, 64, 64], [61, 186, 101], [40, 117, 210], [243, 207, 48]];
  let color = colors[(y >= 225 ? 2 : 0) + (x >= 400 ? 1 : 0)];
  if (x % 50 < 2 || y % 50 < 2) color = [15, 15, 15];
  if (Math.abs(x - 400) < 3 || Math.abs(y - 225) < 3) color = [255, 255, 255];
  const i = y * (width * 3 + 1) + 1 + x * 3; color.forEach((v, c) => { raw[i + c] = v; });
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
const imageUrl = '/ui/backgrounds/grid.png';
config.update({ ui: { uikit: { mode: 'dark', dark: { bgImage: imageUrl, bgOpacity: 1, bgBlur: 0, bgZoom: 1, bgRotate: 0, bgOffsetX: 0, bgOffsetY: 0 } } } });
const files = {
  '/panels/theme.js': ['ui/panels/theme.js', 'text/javascript'],
  '/panels/settings/bg-editor.js': ['ui/panels/settings/bg-editor.js', 'text/javascript'],
  '/panels/destructive-action.js': ['ui/panels/destructive-action.js', 'text/javascript'],
  '/panels/destructive-layout.js': ['ui/panels/destructive-layout.js', 'text/javascript'],
  '/panels/destructive-motion.js': ['ui/panels/destructive-motion.js', 'text/javascript'],
  '/panels/destructive-snapshot.js': ['ui/panels/destructive-snapshot.js', 'text/javascript'],
  '/panels/vendor/gsap-3.13.0.min.js': ['ui/panels/vendor/gsap-3.13.0.min.js', 'text/javascript'],
  '/panels/vendor/gsap-runtime.js': ['ui/panels/vendor/gsap-runtime.js', 'text/javascript'],
  '/common.css': ['ui/panels/common.css', 'text/css'], '/shell.css': ['ui/shell/style.css', 'text/css'],
  '/design-system.css': ['ui/panels/design-system.css', 'text/css'],
  '/panels/design-system.css': ['ui/panels/design-system.css', 'text/css'],
  '/icon-motion.css': ['ui/panels/icon-motion.css', 'text/css'],
  '/destructive-action.css': ['ui/panels/destructive-action.css', 'text/css'],
  '/panels/icon-motion.css': ['ui/panels/icon-motion.css', 'text/css'],
  '/panels/destructive-action.css': ['ui/panels/destructive-action.css', 'text/css'],
  '/assets/endfield/archive.png': ['ui/panels/assets/endfield/archive.png', 'image/png'],
  '/assets/endfield/emblem.png': ['ui/panels/assets/endfield/emblem.png', 'image/png'],
  '/panels/assets/endfield/archive.png': ['ui/panels/assets/endfield/archive.png', 'image/png'],
  '/panels/assets/endfield/emblem.png': ['ui/panels/assets/endfield/emblem.png', 'image/png'],
};
const editorHtml = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/common.css">
<style>.bg-editor{display:block}.bg-stage{width:800px;height:450px;border:0;border-radius:0}</style><div id="mount"></div>
<script type="module">import{createBackgroundEditor}from'/panels/settings/bg-editor.js';
const values=await(await fetch('/state')).json();window.pending=Promise.resolve();
const editor=createBackgroundEditor({getImage:()=>values.bgImage,getValues:()=>values,onChange:patch=>{Object.assign(values,patch);editor.refresh();window.pending=window.pending.then(()=>fetch('/state',{method:'POST',body:JSON.stringify(patch)}));},onUpload(){},onClear(){}});
document.querySelector('#mount').append(editor.element);window.editor=editor;window.values=values;
window.setValues=patch=>{Object.assign(values,patch);editor.refresh();};editor.refresh();await document.querySelector('.bg-stage-img').decode();window.ready=true;</script>`;
const hostHtml = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/shell.css"><script type="module">
import{writeTheme,DEFAULT_THEME}from'/panels/theme.js';window.setValues=patch=>writeTheme({...DEFAULT_THEME,bgImage:'${imageUrl}',bgOpacity:1,bgBlur:0,bgZoom:1,bgRotate:0,bgOffsetX:0,bgOffsetY:0,...patch},{persist:false});
setValues(await(await fetch('/state')).json());const image=new Image();image.src='${imageUrl}';await image.decode();window.ready=true;</script>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local').pathname;
  if (url === '/state') {
    if (req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); config.update({ ui: { uikit: { dark: JSON.parse(Buffer.concat(chunks).toString()) } } }); }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(config.get().ui.uikit.dark)); return;
  }
  if (url === imageUrl) { res.setHeader('content-type', 'image/png'); res.end(png); return; }
  if (url === '/host' || url === '/editor') { res.setHeader('content-type', 'text/html'); res.end(url === '/host' ? hostHtml : editorHtml); return; }
  const file = files[url]; if (!file) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', file[1]); res.end(fs.readFileSync(path.join(root, file[0])));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Decode the real Chromium screenshot, rather than inspecting implementation
// strings or merely asserting that configuration numbers changed.
function pixels(png) {
  const data = []; let w, h, channels;
  for (let p = 8; p < png.length;) { const n = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8), chunk = png.subarray(p + 8, p + 8 + n); if (type === 'IHDR') { w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4); assert.equal(chunk[8], 8); channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0; assert.ok(channels); } if (type === 'IDAT') data.push(chunk); p += n + 12; }
  const input = zlib.inflateSync(Buffer.concat(data)), stride = w * channels, output = Buffer.alloc(stride * h); let from = 0;
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < h; y++) { const filter = input[from++]; for (let x = 0; x < stride; x++) { const i = y * stride + x, a = x >= channels ? output[i - channels] : 0, b = y ? output[i - stride] : 0, c = y && x >= channels ? output[i - stride - channels] : 0; output[i] = (input[from++] + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0)) & 255; } }
  return { width: w, height: h, at: (x, y) => [...output.subarray((y * w + x) * channels, (y * w + x) * channels + 3)] };
}
let browser;
try {
  const playwright = createRequire(import.meta.url)('playwright-core'), cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(v => path.join(cache, v, 'chrome-win64/chrome.exe')).find(f => fs.existsSync(f));
  browser = await playwright.chromium.launch({ executablePath, headless: true });
  const editor = await browser.newPage({ viewport: { width, height: 700 } }), host = await browser.newPage({ viewport: { width, height } });
  const errors = [], browserDiagnostics = [];
  const observe = (page, label) => {
    page.on('pageerror', error => { errors.push(error.message); browserDiagnostics.push(`${label} pageerror: ${error.message}`); });
    page.on('requestfailed', request => { const detail = `${label} requestfailed: ${request.url()} ${request.failure()?.errorText}`; errors.push(detail); browserDiagnostics.push(detail); });
    page.on('response', response => { if (response.status() >= 400) browserDiagnostics.push(`${label} HTTP ${response.status()}: ${response.url()}`); });
  };
  const ready = async (page, url, label) => {
    observe(page, label);
    try { await page.goto(url); await page.waitForFunction(() => window.ready); }
    catch (error) { throw new Error(`${label} readiness failed: ${error.message}\n${browserDiagnostics.join('\n')}`, { cause: error }); }
  };
  const base = `http://127.0.0.1:${server.address().port}`;
  await ready(editor, `${base}/editor`, 'editor');
  await ready(host, `${base}/host`, 'host');
  const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  console.log('· 20/57/100% range changes only the 16:9 frame, not the source image');
  for (const percent of [57, 20, 100]) {
    await editor.locator('#bg-zoom').fill(String(percent)); await editor.locator('#bg-zoom').dispatchEvent('input'); await paint(editor);
    const geometry = await editor.locator('.bg-stage').evaluate(stage => { const image = stage.querySelector('img').getBoundingClientRect(), crop = stage.querySelector('.bg-crop').getBoundingClientRect(); return { imageW: image.width, imageH: image.height, cropW: crop.width, cropH: crop.height }; });
    assert.equal(geometry.imageW, width, 'changing range must not scale the source image'); assert.equal(geometry.imageH, height);
    assert.ok(Math.abs(geometry.cropW - width * percent / 100) < 1); assert.ok(Math.abs(geometry.cropW / geometry.cropH - 16 / 9) < .005);
  }
  async function checkRoi(values) {
    await editor.evaluate(v => setValues(v), values); await paint(editor);
    const previewPoints = await editor.evaluate(async ({ values, width, height, imageUrl }) => {
      const image = new Image(); image.src = imageUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const c = canvas.getContext('2d'); c.fillStyle = getComputedStyle(document.querySelector('.bg-stage')).backgroundColor; c.fillRect(0, 0, width, height);
      c.translate(width / 2, height / 2); c.rotate(values.bgRotate * Math.PI / 180); c.drawImage(image, -width / 2, -height / 2, width, height);
      const cx = width * (.5 + values.bgOffsetX / 100), cy = height * (.5 + values.bgOffsetY / 100), z = values.bgZoom, out = [];
      const stageBox = document.querySelector('.bg-stage').getBoundingClientRect();
      const controls = [...document.querySelectorAll('.bg-crop-size,.bg-rotate-dial,.bg-crop-handle')].map(n => n.getBoundingClientRect()).filter(b => b.width && b.height);
      for (let y = Math.ceil(cy - height * z / 2 + 10); y < cy + height * z / 2 - 10; y += 13) for (let x = Math.ceil(cx - width * z / 2 + 10); x < cx + width * z / 2 - 10; x += 17) {
        if (Math.abs(x - cx) < 4) continue; // visible crop guide, not image content
        if (controls.some(b => x + stageBox.x >= b.left - 4 && x + stageBox.x <= b.right + 4 && y + stageBox.y >= b.top - 4 && y + stageBox.y <= b.bottom + 4)) continue;
        const rgb = [...c.getImageData(x, y, 1, 1).data].slice(0, 3), near = c.getImageData(x - 1, y - 1, 3, 3).data;
        if ([...near].every((v, i) => i % 4 === 3 || Math.abs(v - rgb[i % 4]) <= 10)) out.push({ x, y, rgb });
      } return out;
    }, { values, width, height, imageUrl });
    assert.ok(previewPoints.length >= 12, 'the actual selected preview must contain meaningful reference samples');
    const preview = pixels(await editor.locator('.bg-stage').screenshot());
    const previewMisses = previewPoints.filter(p => preview.at(p.x, p.y).some((v, i) => Math.abs(v - p.rgb[i]) > 18)).map(p => ({ ...p, actual: preview.at(p.x, p.y) }));
    assert.equal(previewMisses.length, 0, `selected editor pixels differ from rotated source: ${JSON.stringify(previewMisses.slice(0, 3))}`);
    await host.evaluate(v => setValues(v), values); await paint(host);
    const style = await host.evaluate(() => { const s = getComputedStyle(document.body, '::before'); return { transform: s.transform, width: s.width, height: s.height, display: s.display }; });
    assert.equal(style.display, 'block'); const matrix = style.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    assert.ok(Math.abs(Math.hypot(matrix[0], matrix[1]) - 1 / values.bgZoom) < .0001, 'host expands the selected ROI by its inverse width');
    // Independent reference: rotate into the original 800x450 plane, extract
    // the requested rectangle, then enlarge it to the whole output viewport.
    const expected = await host.evaluate(async ({ values, width, height, imageUrl }) => {
      const image = new Image(); image.src = imageUrl; await image.decode();
      const source = document.createElement('canvas'); source.width = width; source.height = height;
      const s = source.getContext('2d'); s.translate(width / 2, height / 2); s.rotate(values.bgRotate * Math.PI / 180); s.drawImage(image, -width / 2, -height / 2, width, height);
      const output = document.createElement('canvas'); output.width = width; output.height = height; const o = output.getContext('2d');
      o.fillStyle = getComputedStyle(document.body).backgroundColor; o.fillRect(0, 0, width, height);
      const z = values.bgZoom, x = width * (.5 + values.bgOffsetX / 100 - z / 2), y = height * (.5 + values.bgOffsetY / 100 - z / 2);
      o.drawImage(source, x, y, width * z, height * z, 0, 0, width, height);
      // CSS composites rotation/scale in one pass; the independent canvas
      // reference takes two passes. Compare flat pixels, not grid-edge aliasing.
      const out = []; for (let y = 19; y < height; y += 41) for (let x = 17; x < width; x += 47) {
        const rgb = [...o.getImageData(x, y, 1, 1).data].slice(0, 3), near = o.getImageData(x - 1, y - 1, 3, 3).data;
        if ([...near].every((v, i) => i % 4 === 3 || Math.abs(v - rgb[i % 4]) <= 10)) out.push({ x, y, rgb });
      } return out;
    }, { values, width, height, imageUrl });
    const shot = await host.screenshot(), actual = pixels(shot), misses = expected.filter(p => actual.at(p.x, p.y).some((v, i) => Math.abs(v - p.rgb[i]) > 18));
    assert.ok(expected.length >= 100, 'the pixel comparison must include substantial flat image coverage');
    assert.equal(misses.length, 0, `ROI ${JSON.stringify(values)} has ${misses.length}/${expected.length} wrong flat pixels: ${JSON.stringify(misses.slice(0, 3))}`);
    console.log(`  ROI ${values.bgZoom}, ${values.bgRotate}°, offset ${values.bgOffsetX}/${values.bgOffsetY}: preview ${previewPoints.length}/${previewPoints.length}, host ${expected.length}/${expected.length} reference pixels match`);
    return shot;
  }
  console.log('· Actual host screenshot pixels match source ROI, including rotations and translated selections');
  for (const z of [1, .57, .2, .5704]) for (const angle of [0, 90, 45]) await checkRoi({ bgZoom: z, bgRotate: angle, bgOffsetX: 0, bgOffsetY: 0 });
  const center = await checkRoi({ bgZoom: .57, bgRotate: 90, bgOffsetX: 0, bgOffsetY: 0 });
  const moved = await checkRoi({ bgZoom: .57, bgRotate: 90, bgOffsetX: 15, bgOffsetY: -12 });
  assert.equal(center.equals(moved), false, 'moving the selection changes actual output pixels');
  await checkRoi({ bgZoom: .2, bgRotate: 0, bgOffsetX: -35, bgOffsetY: 30 });

  console.log('· Selection stays in bounds; saving keeps existing fields and replays the same pixels');
  await editor.evaluate(() => setValues({ bgZoom: .57, bgRotate: 0, bgOffsetX: 0, bgOffsetY: 0 }));
  await editor.getByRole('button', { name: '90°', exact: true }).click();
  await editor.locator('#bg-offset-x').fill('15'); await editor.locator('#bg-offset-x').dispatchEvent('input');
  await editor.locator('#bg-offset-y').fill('-12'); await editor.locator('#bg-offset-y').dispatchEvent('input');
  await editor.evaluate(() => window.pending);
  const saved = config.get().ui.uikit.dark; assert.equal(saved.bgZoom, .57); assert.equal(saved.bgRotate, 90); assert.equal(saved.bgOffsetX, 15); assert.equal(saved.bgOffsetY, -12);
  assert.deepEqual(Object.keys(saved).sort(), ['bgImage', 'bgOpacity', 'bgBlur', 'bgZoom', 'bgRotate', 'bgOffsetX', 'bgOffsetY'].sort());
  config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
  assert.deepEqual(config.get().ui.uikit.dark, saved);
  const replay = await browser.newPage({ viewport: { width, height } }); await ready(replay, `${base}/host`, 'replay'); await paint(replay);
  assert.equal((await replay.screenshot()).equals(moved), true, 'disk reload and fresh document reproduce exactly the saved ROI');
  await editor.evaluate(() => setValues({ bgZoom: .2, bgOffsetX: 0, bgOffsetY: 0 }));
  await editor.locator('#bg-offset-x').fill('50'); await editor.locator('#bg-offset-x').dispatchEvent('input');
  assert.equal(await editor.locator('#bg-offset-x').inputValue(), '40', '20% selection stops at the edge');
  await editor.locator('#bg-zoom').fill('100'); await editor.locator('#bg-zoom').dispatchEvent('input');
  assert.equal(await editor.locator('#bg-offset-x').inputValue(), '0', 'whole-image selection is centered');
  await editor.evaluate(() => window.pending); assert.deepEqual(errors, []);
  console.log('✓ 111 real crop geometry, host pixels, movement, rotation and persistence passed');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); fs.rmSync(dataDir, { recursive: true, force: true });
}
