// Synthetic configuration and ephemeral private HTTP servers only. No existing
// console, configuration file, cookie, outside service or agent is accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeHttp from 'node:http';
import { once } from 'node:events';
import { createHttpServer, localConsoleBootstrapAllowed, MAX_BODY_BYTES } from '../src/kernel/http.js';

async function fixture(t, { apiGuard, panelDocuments = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa181-bootstrap-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>synthetic shell');
  const panelAssets = new Map();
  if (panelDocuments) {
    const html = path.join(root, 'untrusted-panel.html'), svg = path.join(root, 'untrusted-document.svg');
    fs.writeFileSync(html, '<!doctype html><title>synthetic untrusted HTML</title>');
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><title>synthetic untrusted SVG</title></svg>');
    panelAssets.set('/panels/u/synthetic/index.html', html);
    panelAssets.set('/panels/u/synthetic/document.svg', svg);
  }
  const state = { server: { port: 0, token: 'synthetic-bootstrap-181' }, api: { apiKey: 'synthetic-private-config-never-returned' } };
  const listeners = new Set();
  const config = { get: () => state, onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); } };
  const http = createHttpServer({ config, staticDir: root, apiGuard, panelAssetResolver: pathname => panelAssets.get(pathname) ?? null, log: { info() {}, warn() {}, error() {} } });
  http.route('GET', '/api/protected', () => ({ protected: true }));
  http.route('POST', '/api/protected', ({ body }) => ({ protected: true, body }));
  http.route('GET', '/api/business-unauthorized', () => { throw Object.assign(new Error('synthetic business denial'), { expose: true, status: 401 }); });
  await http.listen();
  t.after(async () => { await http.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${http.port}`;
  const headers = {
    host: `127.0.0.1:${http.port}`, origin, referer: `${origin}/`,
    'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'x-qq-agent-bootstrap': '1',
  };
  const request = (pathname = '/api/console/bootstrap', { method = 'POST', headers: supplied = headers, automaticHost = true, body } = {}) => new Promise((resolve, reject) => {
    const req = nodeHttp.request({ hostname: '127.0.0.1', port: http.port, path: pathname, method, headers: supplied, setHost: automaticHost, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null; try { data = JSON.parse(text); } catch { /* HEAD has no response body */ }
        resolve({ status: res.statusCode, headers: res.headers, text, data });
      });
    });
    req.on('error', reject); req.end(body);
  });
  return { http, state, headers, origin, request, rotate(token) { state.server.token = token; for (const callback of listeners) callback(); } };
}

function assertPrivate(response) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
}

test('strict shell bootstrap returns only the current in-memory credential for supported local aliases', async t => {
  const f = await fixture(t);
  for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
    const host = `${hostname}:${f.http.port}`, origin = `http://${host}`;
    for (const [mode, entry] of [['cors', '/'], ['same-origin', '/index.html']]) {
      const response = await f.request(undefined, { headers: { ...f.headers, host, origin, referer: `${origin}${entry}`, 'sec-fetch-mode': mode } });
      assert.equal(response.status, 200);
      assert.deepEqual(response.data, { token: f.state.server.token });
      assertPrivate(response);
      assert.equal(response.text.includes('synthetic-private-config-never-returned'), false);
    }
  }
  const shell = await f.request('/', { method: 'GET', headers: {} });
  assert.equal(shell.text.includes(f.state.server.token), false, 'static HTML never contains the credential');
  f.rotate('');
  const disabledToken = await f.request();
  assert.equal(disabledToken.status, 200);
  assert.deepEqual(disabledToken.data, { token: '' });
  assertPrivate(disabledToken);
});

test('bootstrap rejects missing provenance, opaque panels, foreign origins, wrong ports and preflight without CORS', async t => {
  const f = await fixture(t);
  const cases = [];
  for (const name of Object.keys(f.headers)) {
    if (name === 'host') continue; // Node's HTTP parser rejects missing Host before dispatch.
    const incomplete = { ...f.headers }; delete incomplete[name];
    cases.push([`missing ${name}`, incomplete]);
  }
  const wrongHost = `127.0.0.1:${f.http.port === 65535 ? 65534 : f.http.port + 1}`;
  cases.push(
    ['plain local request', {}],
    ['opaque plugin', { ...f.headers, origin: 'null', referer: `${f.origin}/panels/u/synthetic/index.html` }],
    ['plugin document', { ...f.headers, referer: `${f.origin}/panels/u/synthetic/index.html` }],
    ['bundled panel document', { ...f.headers, referer: `${f.origin}/panels/settings/index.html` }],
    ['foreign origin', { ...f.headers, origin: 'https://outside.invalid' }],
    ['origin port mismatch', { ...f.headers, origin: `http://${wrongHost}` }],
    ['HTTPS origin mismatch', { ...f.headers, origin: f.origin.replace('http:', 'https:') }],
    ['foreign referer', { ...f.headers, referer: 'https://outside.invalid/' }],
    ['invalid referer', { ...f.headers, referer: 'not-a-url' }],
    ['referer userinfo', { ...f.headers, referer: `${f.origin.replace('://', '://not-a-user@')}/` }],
    ['referer port mismatch', { ...f.headers, referer: `http://${wrongHost}/` }],
    ['wrong actual port', { ...f.headers, host: wrongHost, origin: `http://${wrongHost}`, referer: `http://${wrongHost}/` }],
    ['missing Host port', { ...f.headers, host: '127.0.0.1', origin: 'http://127.0.0.1', referer: 'http://127.0.0.1/' }],
    ['nonloopback Host', { ...f.headers, host: `outside.invalid:${f.http.port}`, origin: `http://outside.invalid:${f.http.port}`, referer: `http://outside.invalid:${f.http.port}/` }],
    ['different loopback Host', { ...f.headers, host: `127.0.0.2:${f.http.port}`, origin: `http://127.0.0.2:${f.http.port}`, referer: `http://127.0.0.2:${f.http.port}/` }],
    ['cross-site fetch', { ...f.headers, 'sec-fetch-site': 'cross-site' }],
    ['same-site fetch', { ...f.headers, 'sec-fetch-site': 'same-site' }],
    ['navigation site', { ...f.headers, 'sec-fetch-site': 'none' }],
    ['navigation mode', { ...f.headers, 'sec-fetch-mode': 'navigate' }],
    ['no-cors mode', { ...f.headers, 'sec-fetch-mode': 'no-cors' }],
    ['document destination', { ...f.headers, 'sec-fetch-dest': 'document' }],
    ['iframe destination', { ...f.headers, 'sec-fetch-dest': 'iframe' }],
    ['wrong custom header', { ...f.headers, 'x-qq-agent-bootstrap': 'true' }],
  );
  for (const [name, headers] of cases) {
    const response = await f.request(undefined, { headers });
    assert.equal(response.status, 403, name);
    assert.equal(Object.hasOwn(response.data, 'token'), false, name);
    assertPrivate(response);
  }
  const missingHostHeaders = { ...f.headers }; delete missingHostHeaders.host;
  const missingHost = await f.request(undefined, { headers: missingHostHeaders, automaticHost: false });
  assert.equal(missingHost.status, 400);
  assert.equal(missingHost.headers['access-control-allow-origin'], undefined);
  assert.equal(missingHost.text.includes(f.state.server.token), false);
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
    const response = await f.request(undefined, { method });
    assert.equal(response.status, 405, method);
    assertPrivate(response);
    assert.equal(response.headers['access-control-allow-methods'], undefined);
  }
});

test('socket provenance is mandatory and cannot be replaced by forwarded browser headers', () => {
  const port = 18081, origin = `http://127.0.0.1:${port}`;
  const request = { method: 'POST', headers: { host: `127.0.0.1:${port}`, origin, referer: `${origin}/`,
    'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'x-qq-agent-bootstrap': '1',
    'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' } };
  for (const remoteAddress of [undefined, '', '203.0.113.181', '192.168.1.1', '::ffff:203.0.113.181', '127.0.0.1.invalid']) {
    assert.equal(localConsoleBootstrapAllowed({ ...request, socket: { remoteAddress } }, port), false);
  }
  for (const remoteAddress of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1']) {
    assert.equal(localConsoleBootstrapAllowed({ ...request, socket: { remoteAddress } }, port), true);
  }
  assert.equal(localConsoleBootstrapAllowed({ ...request, headers: { ...request.headers, host: undefined }, socket: { remoteAddress: '127.0.0.1' } }, port), false);
  for (const [hostname, remoteAddress] of [['127.0.0.1', '127.0.0.1'], ['localhost', '127.0.0.1'], ['[::1]', '::1']]) {
    const normalizedOrigin = `http://${hostname}`;
    const defaultPortRequest = { ...request, socket: { remoteAddress }, headers: {
      ...request.headers, host: hostname, origin: normalizedOrigin, referer: `${normalizedOrigin}/`,
    } };
    assert.equal(localConsoleBootstrapAllowed(defaultPortRequest, 80), true, `${hostname} may omit the default Host port`);
    assert.equal(localConsoleBootstrapAllowed({ ...defaultPortRequest, headers: { ...defaultPortRequest.headers,
      host: `${hostname}:80`, referer: `${normalizedOrigin}:80/index.html`,
    } }, 80), true, `${hostname}:80 matches the browser's normalized origin and referer`);
    assert.equal(localConsoleBootstrapAllowed(defaultPortRequest, 81), false, 'nondefault listeners still require an exact explicit port');
    assert.equal(localConsoleBootstrapAllowed({ ...defaultPortRequest, headers: { ...defaultPortRequest.headers,
      host: `${hostname}:81`, origin: `${normalizedOrigin}:81`, referer: `${normalizedOrigin}:81/`,
    } }, 80), false, 'a different explicit Host port never authenticates');
    for (const forgedOrigin of ['null', 'https://outside.invalid', `https://${hostname}`, `${normalizedOrigin}:81`]) {
      assert.equal(localConsoleBootstrapAllowed({ ...defaultPortRequest, headers: { ...defaultPortRequest.headers, origin: forgedOrigin } }, 80), false);
    }
    assert.equal(localConsoleBootstrapAllowed({ ...defaultPortRequest, headers: { ...defaultPortRequest.headers, host: '127.0.0.2' } }, 80), false);
  }
});

test('rotation closes existing SSE and old credentials fail REST and SSE with the host-only auth code', { timeout: 5000 }, async t => {
  const f = await fixture(t), oldToken = f.state.server.token;
  const bootstrap = await f.request();
  assert.equal(bootstrap.data.token, oldToken);
  const authorized = { 'x-console-token': oldToken };
  assert.equal((await f.request('/api/protected', { method: 'GET', headers: authorized })).status, 200);
  const req = nodeHttp.get({ hostname: '127.0.0.1', port: f.http.port, path: '/api/events', headers: authorized, agent: false });
  req.on('error', () => {}); t.after(() => req.destroy());
  const [stream] = await once(req, 'response');
  assert.equal(stream.statusCode, 200);
  const ended = once(stream, 'end');
  const [hello] = await once(stream, 'data');
  assert.match(hello.toString(), /event: hello/);
  stream.resume();
  f.rotate('synthetic-rotated-181');
  await ended;
  assert.equal(f.http.sseCount(), 0);
  for (const pathname of ['/api/protected', '/api/events']) {
    const denied = await f.request(pathname, { method: 'GET', headers: authorized });
    assert.equal(denied.status, 401);
    assert.equal(denied.data.code, 'CONSOLE_AUTH_REQUIRED');
  }
  const refreshed = await f.request();
  assert.deepEqual(refreshed.data, { token: f.state.server.token });
  const currentHeaders = { 'x-console-token': refreshed.data.token };
  assert.equal((await f.request('/api/protected', { method: 'GET', headers: currentHeaders })).status, 200);
  const businessDenied = await f.request('/api/business-unauthorized', { method: 'GET', headers: currentHeaders });
  assert.equal(businessDenied.status, 401);
  assert.equal(businessDenied.data.code, undefined, 'business 401 must not trigger automatic credential recovery');
  const freshRequest = nodeHttp.get({ hostname: '127.0.0.1', port: f.http.port, path: '/api/events', headers: currentHeaders, agent: false });
  freshRequest.on('error', () => {}); t.after(() => freshRequest.destroy());
  const [freshStream] = await once(freshRequest, 'response');
  assert.equal(freshStream.statusCode, 200, 'the re-bootstrapped credential reconnects SSE');
  const [freshHello] = await once(freshStream, 'data');
  assert.match(freshHello.toString(), /event: hello/);
});

test('bootstrap remains a read-only host capability while normal auth, origin, JSON limits and reset guards stay enforced', async t => {
  let blocked = false;
  const f = await fixture(t, { apiGuard: () => blocked ? { status: 409, body: { error: 'synthetic reset guard' } } : null });
  let accidentalRoute = 0;
  f.http.route('POST', '/api/console/bootstrap', () => { accidentalRoute++; return { unsafe: true }; });
  const auth = { 'x-console-token': f.state.server.token };
  assert.equal((await f.request()).status, 200);
  assert.equal(accidentalRoute, 0, 'composition routes cannot shadow the bootstrap guard');
  const unauthorized = await f.request('/api/protected', { method: 'GET', headers: {} });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.data.code, 'CONSOLE_AUTH_REQUIRED');
  assert.equal((await f.request('/api/protected', { method: 'GET', headers: { ...auth, origin: 'null' } })).status, 403);
  assert.equal((await f.request('/api/protected', { method: 'GET', headers: { ...auth, origin: 'https://outside.invalid' } })).status, 403);
  assert.equal((await f.request('/api/protected', { headers: auth, body: 'not-json' })).status, 400);
  assert.equal((await f.request('/api/protected', { headers: auth, body: JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES) }) })).status, 413);
  blocked = true;
  assert.equal((await f.request()).status, 200, 'read-only bootstrap can restore reset diagnostics');
  assert.equal((await f.request('/api/protected', { method: 'GET', headers: auth })).status, 409);
  assert.equal((await f.request('/api/protected', { headers: auth, body: '{}' })).status, 409);
});

test('user panel HTML and SVG responses enforce an opaque CSP sandbox while the root shell keeps its original frame policy', async t => {
  const f = await fixture(t, { panelDocuments: true });
  for (const [pathname, contentType, marker] of [
    ['/panels/u/synthetic/index.html', 'text/html', 'synthetic untrusted HTML'],
    ['/panels/u/synthetic/document.svg', 'image/svg+xml', 'synthetic untrusted SVG'],
  ]) {
    const response = await f.request(pathname, { method: 'GET', headers: { origin: 'null' } });
    assert.equal(response.status, 200);
    assert.ok(response.headers['content-type'].startsWith(contentType));
    assert.ok(response.text.includes(marker), 'the fixed temporary panel resolver served its actual document');
    const directives = response.headers['content-security-policy'].split(';').map(part => part.trim());
    assert.ok(directives.includes('sandbox allow-scripts'));
    assert.ok(directives.includes("frame-ancestors 'self'"));
    assert.equal(directives.some(part => part.startsWith('sandbox') && part.includes('allow-same-origin')), false);
    assert.equal(response.headers['access-control-allow-origin'], 'null');
  }
  const root = await f.request('/', { method: 'GET', headers: {} });
  const directives = root.headers['content-security-policy'].split(';').map(part => part.trim());
  assert.equal(root.status, 200);
  assert.ok(directives.includes("frame-ancestors 'none'"));
  assert.equal(directives.some(part => part.startsWith('sandbox')), false);
});
