// 72 · 外壳视觉语言实测（原生 CDP，不依赖 playwright 模块）
//
// 为什么需要它：69/70/71 走 Playwright，本机没有 playwright 包时会整段跳过，
// 于是"外壳到底长什么样"长期没人验。63 号证明了 CDP 直连本地 Chromium 可行，
// 这里验证主题化外壳的可达导航、真实换色、图标继承与零未捕获异常，
// 不锁定一次设计稿的精确配色、圆角、品牌字形或装饰性玻璃模糊。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ...['chromium-1228', 'chromium-1148'].map(revision => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright', revision, 'chrome-win64', 'chrome.exe')),
].find((p) => p && fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('=== A. 启动隔离内核 ===');
if (!CHROME) {
  console.log('! 未找到 Chromium，跳过外壳实测（静态契约由 62/68 号覆盖）');
  process.exit(0);
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-shell72-'));
const appRoot=path.join(dataDir,'application');fs.mkdirSync(appRoot);fs.cpSync(path.join(root,'ui'),path.join(appRoot,'ui'),{recursive:true});
const kernel = createKernel({appRoot, env: { ...process.env, QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0' }, headless: true,
  transport:{id:'qa72-inert',start(){},stop(){},status:()=>({connected:false}),actions:{}},
  priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},
  communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async()=>{throw new Error('QA72 no external source');}});
kernel.config.update({ server: { port: 0, token: 'shell72-token' },telemetry:{enabled:false},proactive:{enabled:false} });
const port = await kernel.start();
const base = `http://127.0.0.1:${port}`;
console.log(`✓ 隔离内核已启动（端口 ${port}）`);

const browserProfile=path.join(dataDir,'browser-profile');fs.mkdirSync(browserProfile);
const browser = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+browserProfile, 'about:blank'], { stdio: 'ignore',windowsHide:true });
let ws = null;
try {
  console.log('=== B. 打开控制台，量出厂观感（0.4 经典）===');
  let endpoint;
  for(let attempt=0;attempt<100;attempt++){try{endpoint=fs.readFileSync(path.join(browserProfile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);if(endpoint.length===2)break;}catch{}await sleep(100);}
  assert.ok(endpoint&&/^\d+$/.test(endpoint[0])&&/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(endpoint[1]),'only use endpoint UUID from this newly created browser profile');
  ws = new WebSocket(`ws://127.0.0.1:${endpoint[0]}${endpoint[1]}`);
  let id = 0,sessionId; const pending = new Map(); const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? '').slice(0, 200));
    if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') errors.push(String(m.params.entry.text ?? '').slice(0, 200));
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params,...(sessionId?{sessionId}:{}) })); });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const {targetInfos}=await send('Target.getTargets');const target=targetInfos.find(t=>t.type==='page');assert.ok(target);
  ({sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate', { url: `${base}/?token=shell72-token` });
  await sleep(4200);

  const probe = `(() => {
    const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
    const nav = document.querySelector('#nav button');
    const emblem = document.querySelector('#brand-emblem .qq-icon');
    return JSON.stringify({
      styleMode: document.body.dataset.styleMode,
      navCount: document.querySelectorAll('#nav button').length,
      railBg: cs('.rail', 'backgroundColor'),
      navRadius: nav ? getComputedStyle(nav).borderTopLeftRadius : null,
      brandVisible: !!emblem && emblem.getBoundingClientRect().width > 0,
      brandColor: emblem ? getComputedStyle(emblem).color : null,
      navIconColor: cs('#nav button.active .nav-icon', 'color'),
      canvas:cs('body','backgroundColor'),
      closedDialogHidden:cs('#confirm-dialog','display')==='none',
      accessibleNames:[...document.querySelectorAll('#nav button')].every(b=>b.textContent.trim().length>0),
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      panelMounted: !!document.querySelector('#panel-host iframe'),
    });
  })()`;
  const out = JSON.parse((await send('Runtime.evaluate', { returnByValue: true, expression: probe })).result.value);
  console.log('  ', out);

  assert.equal(out.styleMode, 'endfield', '出厂视觉语言是终末地（Endfield）');
  assert.ok(out.navCount >= 8, '面板导航已渲染');
  assert.ok(out.brandVisible, '项目图形品牌可见');
  assert.ok(out.accessibleNames, '每个图形导航仍保留可达文本名称');
  assert.equal(out.overflow, 0, '外壳导航与工作区不横向溢出');
  assert.ok(out.closedDialogHidden, '确认弹窗初始关闭且不占布局');
  assert.equal(out.brandColor, out.navIconColor, '品牌与当前导航图标使用同一强调色');
  assert.ok(out.panelMounted, '面板已挂载');
  console.log('✓ 外壳导航可达、项目图标可见、弹窗关闭且无横向溢出');

  console.log('=== C. 切换视觉语言：外壳必须整体跟着变 ===');
  const alt = `(async () => {
    const {writeTheme,getCurrentTheme}=await import('/panels/theme.js');
    const previous=getCurrentTheme();
    const applied=writeTheme({...previous,styleMode:'flux',accent:'#c765bd',bg:'#13212a',radius:12},{persist:false});
    // Normalize each input on a fresh non-animated specimen. The reduced-motion
    // override gives every node a tiny transition duration, including a reused probe.
    const cssColor=value=>{
      const reference=document.createElement('span');
      reference.style.setProperty('transition','none','important');
      reference.style.color=value;
      document.body.append(reference);
      const normalized=String(getComputedStyle(reference).color);
      reference.remove();
      return normalized;
    };
    const expectedCanvas=cssColor(applied.bg),expectedAccent=cssColor(applied.accent);
    const deadline=Date.now()+2000;
    while(Date.now()<deadline) {
      if(getComputedStyle(document.body).backgroundColor===expectedCanvas && getComputedStyle(document.querySelector('#brand-emblem .qq-icon')).color===expectedAccent) break;
      await new Promise(resolve=>setTimeout(resolve,16));
    }
    const rail = document.querySelector('.rail');
    const nav = document.querySelector('#nav button');
    const out = {
      styleMode:document.body.dataset.styleMode,
      canvas:getComputedStyle(document.body).backgroundColor,
      brandColor:getComputedStyle(document.querySelector('#brand-emblem .qq-icon')).color,
      navIconColor:getComputedStyle(document.querySelector('#nav button.active .nav-icon')).color,
      railBg:getComputedStyle(rail).backgroundColor,
      navRadius: getComputedStyle(nav).borderTopLeftRadius,
      radiusToken:getComputedStyle(document.documentElement).getPropertyValue('--r-sm').trim(),
      railBlur:getComputedStyle(rail).backdropFilter,
      expectedCanvas,expectedAccent,
      diagnostics:{rootStyle:document.documentElement.getAttribute('style'),bodyStyle:document.body.getAttribute('style'),
        rootBg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),bodyBg:getComputedStyle(document.body).getPropertyValue('--bg').trim(),
        rootCanvas:getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),bodyCanvas:getComputedStyle(document.body).getPropertyValue('--canvas').trim(),
        rootAccent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),bodyAccent:getComputedStyle(document.body).getPropertyValue('--accent').trim(),brandAccent:getComputedStyle(document.querySelector('#brand-emblem .qq-icon')).getPropertyValue('--accent').trim()},
    };
    writeTheme(previous,{persist:false});
    return JSON.stringify(out);
  })()`;
  const switched = JSON.parse((await send('Runtime.evaluate', { returnByValue: true, awaitPromise:true, expression: alt })).result.value);
  console.log('  ', switched);
  assert.equal(switched.styleMode, 'flux', '受支持的视觉语言状态可切换');
  assert.equal(switched.canvas,switched.expectedCanvas,'画布使用刚应用的主题背景，不只是任意变化');
  assert.equal(switched.brandColor,switched.expectedAccent,'品牌使用刚应用的主题强调色，不只是任意变化');
  assert.notEqual(switched.canvas, out.canvas, '主题改变实际画布绘制');
  assert.notEqual(switched.railBg, out.railBg, '主题改变实际导航底色');
  assert.notEqual(switched.brandColor, out.brandColor, '生成图标随主题改色');
  assert.equal(switched.brandColor, switched.navIconColor, '改色后所有强调图标继续同步');
  assert.equal(switched.navRadius, switched.radiusToken, '普通导航形状消费用户令牌');
  assert.ok(!/blur\(/.test(switched.railBlur), '外壳不依赖整层玻璃模糊');
  console.log('✓ 主题改变实际画布、导航形状与图标颜色，保持轻量绘制');

  console.log('=== D. 全程无未捕获异常 ===');
  const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|安全握手超时/i.test(e));
  assert.deepEqual(real, [], `启动与切页无未捕获异常（实际 ${real.length} 条）`);
  console.log('✓ 0 条未捕获异常');
} finally {
  try { ws?.close(); } catch { /* 已关闭 */ }
  const exited=new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,3000).unref();}});browser.kill();await exited;
  await kernel?.stop?.();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* 清理失败不影响结论 */ }
}
console.log('\n✓ 72 外壳视觉语言实测：全部通过');
