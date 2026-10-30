import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { mktmp, eq, ok, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-http-');
const staticDir = mktmp('qqa-m3-http-static-');
const panelDir = path.join(path.dirname(staticDir), 'panels', 'demo');
fs.mkdirSync(panelDir, { recursive: true });
fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>shell');
fs.writeFileSync(path.join(panelDir, 'index.html'), '<!doctype html>panel');
fs.writeFileSync(path.join(panelDir, 'panel.js'), 'export default 1');
const log = { error() {}, warn() {}, info() {}, recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log });
config.load();
config.update({
  server: { port: 0, token: 'http-secret' },
  api: { apiKey: 'api-plain' },
  providers: [{ id: 'provider', apiKey: 'provider-plain' }],
  dshProviderKeys: { provider: 'provider-plain' },
  webSearch: { deepseek: { apiKey: 'search-plain' } },
  onebot: { accessToken: 'ws-plain', httpAccessToken: 'http-plain' },
});
let fetchCalls = [];
const fetchImpl = async (url, opts) => {
  fetchCalls.push({ url: String(url), opts });
  if (String(url).includes('/large')) return new Response(Buffer.alloc(16 * 1024 * 1024 + 1), { status: 200 });
  return new Response(Buffer.from(`upstream:${opts.method}:${Buffer.from(opts.body ?? '').toString('utf8')}`), {
    status: 201,
    headers: { 'content-type': 'application/octet-stream', 'x-upstream': 'kept', connection: 'close' },
  });
};
const http = createHttpServer({ config, log, staticDir });
const noops = { listEntries: () => [], promptSections: () => [], names: () => [], explain: () => ({}), status: () => ({}), todayUsage: () => ({}), listChats: () => [] };
registerConsoleRoutes(http, {
  config, dataDir, fetchImpl, dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }], log,
  sessions: { ...noops, listSummaries: () => [], get: () => null, delete: () => false, clearFinished: () => 0 },
  store: noops, loader: noops, orchestrator: noops, capability: noops,
});
const port = await http.listen();
const base = `http://127.0.0.1:${port}`;
async function request(method, suffix, { body, headers = {} } = {}) {
  return fetch(`${base}${suffix}`, { method, headers: { ...headers }, ...(body === undefined ? {} : { body }) });
}

section('Panel CSP permits only same-origin shell and opaque module requests');
const shell = await request('GET', '/');
ok(shell.headers.get('content-security-policy').includes("frame-ancestors 'none'"), 'shell forbids all framing');
const panel = await request('GET', '/panels/demo/index.html');
ok(panel.headers.get('content-security-policy').includes("frame-ancestors 'self'"), 'panel permits same-origin shell');
const module = await request('GET', '/panels/demo/panel.js', { headers: { origin: 'null' } });
eq(module.headers.get('access-control-allow-origin'), 'null', 'opaque panel module is CORS-readable');

section('R23-R26 明文密钥端点要求独立组合守卫');
const keyEndpoints = [
  ['/api/providers/key?providerId=provider', 'apiKey', 'provider-plain'],
  ['/api/api-key', 'apiKey', 'api-plain'],
  ['/api/search-key?field=deepseek', 'apiKey', 'search-plain'],
  ['/api/onebot-token?which=ws', 'token', 'ws-plain'],
];
for (const [suffix, field, expected] of keyEndpoints) {
  const denied = await request('GET', suffix, { headers: { origin: 'https://evil.example' } });
  eq(denied.status, 403, `${suffix} 拒绝不受信请求`);
  eq((await denied.json()).error, '请求来源不被信任，已拒绝读取明文密钥。', `${suffix} 拒绝文案`);
  const trustedToken = await request('GET', suffix, { headers: { host: 'evil.example', 'x-console-token': 'http-secret' } });
  eq(trustedToken.status, 200, `${suffix} 接受精确 token`);
  eq((await trustedToken.json())[field], expected, `${suffix} 返回对应明文`);
  const trustedOrigin = await request('GET', suffix, { headers: { origin: base } });
  eq(trustedOrigin.status, 200, `${suffix} 接受同源 shell`);
  eq((await trustedOrigin.json())[field], expected, `${suffix} 同源返回对应明文`);
}
const ordinaryConfig = await request('GET', '/api/config', { headers: { 'x-console-token': 'http-secret' } });
const ordinaryConfigJson = await ordinaryConfig.json();
ok(!('apiKey' in ordinaryConfigJson.api), '普通 config DTO 不返回主 API 明文');
ok(!('accessToken' in ordinaryConfigJson.onebot), '普通 config DTO 不返回 OneBot 明文');

section('R-90 guards run before forwarding');
eq((await request('GET', '/api/captcha-forward?u=https%3A%2F%2Fa.aliyuncs.com%2Fok')).status, 401, 'token guard');
eq((await request('GET', '/api/captcha-forward?u=https%3A%2F%2Fa.aliyuncs.com%2Fok', { headers: { 'x-console-token': 'http-secret', origin: 'https://evil.example' } })).status, 403, 'origin guard');
eq((await request('GET', '/api/captcha-forward', { headers: { 'x-console-token': 'http-secret' } })).status, 400, 'missing u');
eq((await request('GET', '/api/captcha-forward?u=https%3A%2F%2Fexample.com%2F', { headers: { 'x-console-token': 'http-secret' } })).status, 403, 'host whitelist');
eq(fetchCalls.length, 0, 'invalid requests never forwarded');

section('R-90 preserves arbitrary methods, bytes, response status and safe headers');
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  const body = Buffer.from(`${method}-bytes\u0000`);
  const r = await request(method, `/api/captcha-forward?u=${encodeURIComponent('https://a.aliyuncs.com/ok')}`, {
    body, headers: { 'x-console-token': 'http-secret', 'content-type': 'application/octet-stream', connection: 'keep-alive' },
  });
  eq(r.status, 201, `${method} status`);
  eq(r.headers.get('content-type'), 'application/octet-stream', `${method} content type`);
  eq(r.headers.get('x-upstream'), 'kept', `${method} upstream header`);
  eq(r.headers.get('access-control-allow-origin'), '*', `${method} opaque CORS`);
  eq(Buffer.from(await r.arrayBuffer()).toString('utf8'), `upstream:${method}:${method}-bytes\u0000`, `${method} raw body`);
}
ok(fetchCalls.every((x) => x.opts.redirect === 'manual'), 'redirect is manual');

section('R-90 rejects oversized upstream response');
const large = await request('GET', `/api/captcha-forward?u=${encodeURIComponent('https://a.aliyuncs.com/large')}`, { headers: { 'x-console-token': 'http-secret' } });
eq(large.status, 502, 'large upstream response rejected');
ok((await large.text()).includes('转发响应过大'), 'large response error');

await http.close();
summary('31-m3-http-security');
