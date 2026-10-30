// 09 · HTTP 服务：鉴权 / 来源校验 / 404 文案 / 413-16MB-400 / SSE / 静态穿越 / 端口顺延
import { ok, eq, section, summary, mktmp, sleep } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { buildDefaultConfig, createConfig } from '../src/kernel/config.js';

const logs = [];
const log = { info: () => {}, warn: () => {}, error: (m) => logs.push(m) };

function makeServer({ token = '' } = {}) {
  const dir = mktmp('qqa-http-static-');
  fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html><body>CONSOLE</body></html>');
  fs.writeFileSync(path.join(dir, 'app.js'), '// console js');
  const config = createConfig({
    dataDir: mktmp('qqa-http-data-'),
    defaults: buildDefaultConfig({ personaText: '' }),
    log,
  });
  config.load();
  config.update({ server: { token } });
  const srv = createHttpServer({ config, log, staticDir: dir });
  srv.route('GET', '/api/ping', () => ({ pong: true }));
  srv.route('POST', '/api/echo', ({ body }) => ({ echo: body }));
  srv.route('GET', /^\/api\/thing\/(?<id>\d+)$/, ({ params }) => ({ id: params.id }));
  return srv;
}

async function req(port, method, p, { headers = {}, body = null, host = `127.0.0.1:${port}` } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method, headers: { host, ...headers },
    body: body === null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, headers: res.headers, data };
}

section('基础路由 + 正则参数');
const s1 = makeServer();
const port1 = await s1.listen();
eq((await req(port1, 'GET', '/api/ping')).data.pong, true, '静态字符串路由');
eq((await req(port1, 'GET', '/api/thing/42')).data.id, '42', '正则路由参数');

section('404 文案（SPEC §9b 守卫 3）');
const nf = await req(port1, 'GET', '/api/nope');
eq(nf.status, 404, '404');
eq(nf.data.error, '未知 API：GET /api/nope', '404 文案逐字');

section('鉴权（C-srv-01：token 空 = 回环免鉴权；非空 = 401 未授权）');
eq((await req(port1, 'GET', '/api/ping')).status, 200, '空 token 免鉴权');
const s2 = makeServer({ token: 'secret' });
const port2 = await s2.listen();
eq((await req(port2, 'GET', '/api/ping')).status, 401, '无凭据 401');
eq((await req(port2, 'GET', '/api/ping')).data.error, '未授权', '401 文案');
eq((await req(port2, 'GET', '/api/ping', { headers: { 'x-console-token': 'secret' } })).status, 200, '头 token 通过');
eq((await req(port2, 'GET', '/api/ping?token=secret')).status, 200, 'query token 通过');
eq((await req(port2, 'GET', '/api/ping?token=wrong')).status, 401, '错 token 401');

section('来源校验（SPEC §4.7 originAllowed）');
// 注：fetch（undici）按规范强制用 URL 的 host，改不了 Host 头——伪造 Host 用原始 http.request
import http from 'node:http';
function rawReq(port, method, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, data: text }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}
const evilHost = await rawReq(port2, 'GET', '/api/ping?token=secret', { host: 'evil.com' });
eq(evilHost.status, 403, 'Host 非回环 403');
eq(evilHost.data.error, '请求来源不被信任（仅接受本机控制台的同源请求）', '403 文案逐字');
eq((await rawReq(port2, 'GET', '/api/ping?token=secret', { host: 'localhost' })).status, 200, 'Host=localhost 放行');
eq((await req(port2, 'GET', '/api/ping', { headers: { 'x-console-token': 'secret', origin: 'http://evil.com' } })).status, 403, '跨源 Origin 403');
eq((await req(port2, 'GET', '/api/ping', { headers: { 'x-console-token': 'secret', origin: `http://127.0.0.1:${port2}` } })).status, 200, '同源 Origin 通过');
eq((await req(port2, 'GET', '/api/ping', { headers: { 'x-console-token': 'secret', referer: `http://127.0.0.1:${port2}/x` } })).status, 200, 'Referer host 与 Host 相等通过（严格字符串相等口径，SPEC §4.7）');
eq((await req(port2, 'GET', '/api/ping', { headers: { 'x-console-token': 'secret', referer: 'http://localhost/x' } })).status, 403, 'Referer host 与 Host 不等 → 403');
const noSrc = await req(port2, 'GET', '/api/ping?token=secret');
eq(noSrc.status, 200, '无来源信息（curl 形态）放行');

section('请求体：非法 JSON 400 / 2MB 413 / 16MB 断链');
const badJson = await req(port1, 'POST', '/api/echo', { headers: { 'content-type': 'application/json' }, body: '{nope' });
eq(badJson.status, 400, '非法 JSON 400');
eq(badJson.data.error, '请求体不是合法 JSON', '400 文案');
const big = await req(port1, 'POST', '/api/echo', { body: 'x'.repeat(3 * 1024 * 1024) });
eq(big.status, 413, '>2MB → 413');
let destroyed = false;
try {
  await fetch(`http://127.0.0.1:${port1}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'x'.repeat(20 * 1024 * 1024),
    signal: AbortSignal.timeout(15000),
  });
} catch { destroyed = true; }
ok(destroyed, '>16MB 直接断链（连接层失败）');

section('SSE：hello 事件 + 心跳 + 广播');
const sseEvents = [];
const ctrl = new AbortController();
const ssePromise = (async () => {
  const res = await fetch(`http://127.0.0.1:${port1}/api/events`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { done, value } = await Promise.race([
      reader.read(),
      sleep(20000).then(() => ({ done: true, value: undefined })),
    ]);
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const frame of buf.split('\n\n')) {
      const evM = frame.match(/^event: (.+)$/m);
      const daM = frame.match(/^data: (.+)$/m);
      if (evM) sseEvents.push({ event: evM[1], data: daM?.[1] ?? '' });
    }
    buf = buf.split('\n\n').slice(-1)[0];
    if (sseEvents.some((e) => e.event === 'ping-evt')) break;
  }
  ctrl.abort();
})();
await sleep(300);
eq(sseEvents[0]?.event, 'hello', 'SSE 首帧 hello');
s1.broadcast('ping-evx', { x: 1 });
await sleep(300);
s1.broadcast('ping-evt', { done: true }); // 终止条件
await ssePromise;
ok(sseEvents.some((e) => e.event === 'ping-evt'), 'broadcast 帧到达');
eq(sseEvents[0]?.event, 'hello', '连接保持（首帧仍是 hello）');

section('静态服务：两段式防穿越 + CSP + MIME');
const home = await fetch(`http://127.0.0.1:${port1}/`);
eq(home.status, 200, '/ → index.html');
ok((await home.text()).includes('CONSOLE'), '首页内容');
ok(home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'HTML 带 CSP');
ok(home.headers.get('x-content-type-options') === 'nosniff', 'nosniff');
ok(home.headers.get('referrer-policy') === 'no-referrer', 'no-referrer');
const js = await fetch(`http://127.0.0.1:${port1}/app.js`);
eq(js.headers.get('content-type'), 'text/javascript; charset=utf-8', 'JS MIME');
for (const evil of ['/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/....//package.json', '/a/../../package.json']) {
  const r = await fetch(`http://127.0.0.1:${port1}${evil}`);
  eq(r.status, 404, `穿越 ${evil} 被拒（单靠 replace('..','') 会被 /....// 绕过——两段式防护）`);
}
const ctl = await fetch(`http://127.0.0.1:${port1}/%00`);
ok(ctl.status === 404 || ctl.status === 400, '控制字符段被拒');

section('端口顺延（EADDRINUSE → 3211…3220，SPEC §4.3）');
const s3 = makeServer();
const port3 = await s3.listen();
ok(port3 !== port1, '被占后顺延到新端口');
await s1.close(); await s2.close(); await s3.close();

summary('09-http');
