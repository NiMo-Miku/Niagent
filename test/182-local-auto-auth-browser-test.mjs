// Real Chromium and an isolated, random-port kernel with no extension code.
// No production console, account, real transport, process adapter or remote URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { createHttpServer } from '../src/kernel/http.js';
import { CONSOLE_SESSION_KEY, CONSOLE_SESSION_TTL_MS } from '../ui/shell/console-auth.js';
import { isSettingsSaveRequest } from './settings-save-observation.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-local-auth182-'));
const appRoot = path.join(dataDir, 'application'), sourceRoot = path.resolve(import.meta.dirname, '..');
fs.mkdirSync(appRoot); fs.cpSync(path.join(sourceRoot, 'ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
const initialToken = 'synthetic-local-initial182', rotatedToken = 'synthetic-local-rotated182', wrongToken = 'synthetic-local-wrong182';
const requests = [], bootstrapResponses = [], guardFailures = [], pageErrors = [], outboundRequests = [], failedRequests = [], configWrites = [];
const releases = new Set(), checks = [];
let browser, base, outbound = 0, bootstrapHold = null, bootstrapUnavailable = false, probeServer;
const kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent-source') }, headless: true,
  transport: { id: 'inert182', start() {}, stop() {}, status: () => ({ connected: false }), actions: { listGroups: async () => [], listFriends: async () => [] } },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }), getBlocklist: () => ({ ok: true, ids: [] }), listAccounts: () => ({ ok: true, accounts: [] }) },
  fetchImpl: async () => { outbound++; throw new Error('QA182 outbound disabled'); },
});
kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
kernel.config.update({ server: { port: 0, token: initialToken }, telemetry: { enabled: false }, proactive: { enabled: false }, ui: { refreshMs: 15000 }, api:{baseUrl:'http://127.0.0.1:9/v1',model:'synthetic-auth182'}, allowAllWhenEmpty:true });
const seed = kernel.sessions.create('group:182'); kernel.sessions.finish(seed.id, 'done');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do { if (await predicate()) return; await delay(15); } while (Date.now() < deadline);
  assert.fail(message);
}
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; }); releases.add(release);
  return { promise, release() { releases.delete(release); release(); } };
}
function executable(playwright) {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  const versions = fs.existsSync(cache) ? fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
  const found = versions.map(name => path.join(cache, name, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  assert.ok(found, 'Use an installed Chromium; this suite never downloads a browser'); return found;
}
const bootstrapCount = () => requests.filter(request => request.top && request.method === 'POST' && request.pathname === '/api/console/bootstrap').length;
async function check(name, task) { await task(); checks.push(name); console.log('✓ 182 ' + name); }
async function ready(page, token) {
  await page.waitForFunction(() => document.querySelectorAll('#nav button[data-panel]').length === 9 && document.querySelector('#status-dot')?.classList.contains('online'));
  await page.frameLocator('#panel-host iframe').locator('#sessions-panel[data-ready=true]').waitFor();
  assert.equal(await page.locator('#panel-recovery').count(), 0);
  const cached = await page.evaluate(key => ({ record: JSON.parse(sessionStorage.getItem(key) || 'null'), now: Date.now() }), CONSOLE_SESSION_KEY);
  assert.equal(cached.record?.token, token); assert.equal(cached.record.origin, base);
  assert.ok(cached.record.expiresAt > cached.now && cached.record.expiresAt <= cached.now + CONSOLE_SESSION_TTL_MS);
}
async function fetchPolicy(page) {
  const calls = await page.evaluate(() => window.qa182BootstrapFetch);
  assert.ok(calls.length > 0, 'The top document used bootstrap');
  for (const call of calls) assert.deepEqual(call, { method: 'POST', mode: 'same-origin', credentials: 'omit', referrerPolicy: 'same-origin', marker: '1' });
}
async function preserveFrame(page) {
  await page.frameLocator('#panel-host iframe').locator('#search').fill('unsaved-182-search-draft');
  await page.evaluate(() => { window.qa182RetainedFrame = document.querySelector('#panel-host iframe'); });
}
async function retained(page) {
  assert.equal(await page.evaluate(() => document.querySelector('#panel-host iframe') === window.qa182RetainedFrame), true, 'Authentication recovery preserves the active iframe');
  assert.equal(await page.frameLocator('#panel-host iframe').locator('#search').inputValue(), 'unsaved-182-search-draft');
}
async function noLeaks(page) {
  assert.equal(new URL(page.url()).searchParams.has('token'), false);
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /synthetic-local-(initial|rotated|wrong)182/);
  assert.doesNotMatch(await page.locator('#panel-host iframe').getAttribute('src'), /token|synthetic-local/);
  assert.doesNotMatch(await page.frameLocator('#panel-host iframe').locator('body').evaluate(() => JSON.stringify(window.qa182Messages)), /synthetic-local-(initial|rotated|wrong)182/);
}
async function watch(page) {
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url()), entry = { method: request.method(), pathname: url.pathname, search: url.search, token: request.headers()['x-console-token'], top: request.frame() === page.mainFrame() };
    requests.push(entry);
    if (isSettingsSaveRequest(request)) configWrites.push(request.postData());
  });
  page.on('requestfailed', request => failedRequests.push(new URL(request.url()).pathname));
  page.on('response', async response => {
    const request = response.request(), pathname = new URL(response.url()).pathname;
    if (pathname === '/api/console/bootstrap' && request.method() === 'POST') bootstrapResponses.push({ status: response.status(), headers: response.headers() });
    if (response.status() === 401) {
      const data = await response.json().catch(() => ({}));
      guardFailures.push({ pathname, code: data.code, token: request.headers()['x-console-token'] });
    }
  });
}

try {
  base = `http://127.0.0.1:${await kernel.start()}`;
  assert.notEqual(new URL(base).port, '15967'); assert.deepEqual(kernel.loader.listEntries(), []);
  const playwright = createRequire(import.meta.url)('playwright-core');
  browser = await playwright.chromium.launch({ executablePath: executable(playwright), headless: process.env.QA_HEADLESS !== '0' });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { outboundRequests.push(url.href); return route.abort(); }
    if (url.pathname === '/api/console/bootstrap' && bootstrapUnavailable) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic temporary bootstrap outage182'})});
    if (url.pathname === '/api/console/bootstrap' && bootstrapHold) await bootstrapHold.promise;
    return route.continue();
  });
  await context.addInitScript(() => {
    if (window === top) {
      window.qa182BootstrapFetch = [];
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const request = new Request(input, options);
        if (new URL(request.url).pathname === '/api/console/bootstrap') window.qa182BootstrapFetch.push({ method: request.method, mode: request.mode, credentials: request.credentials, referrerPolicy: request.referrerPolicy, marker: request.headers.get('x-qq-agent-bootstrap') });
        return nativeFetch(input, options);
      };
    } else {
      window.qa182Messages = [];
      window.addEventListener('message', event => window.qa182Messages.push(JSON.stringify(event.data)));
    }
  });
  const page = await context.newPage(); await watch(page);

  await check('a startup authentication outage retries automatically without exposing a token form', async () => {
    bootstrapUnavailable = true;
    const before = bootstrapCount();
    await page.goto(base);
    await page.locator('#panel-recovery-title').filter({hasText:'正在重新连接控制台'}).waitFor();
    assert.equal(await page.getByLabel('控制台访问令牌',{exact:true}).count(),0);
    assert.equal(await page.locator('#nav button[data-panel]').count(),0);
    await until(() => bootstrapCount() >= before + 3, 'The real empty-token guard must produce bounded automatic attempts during a startup outage');
    assert.ok(bootstrapCount() <= before + 6, 'Startup recovery must not spin an unbounded request loop');
    bootstrapUnavailable = false;
    await ready(page, initialToken);
    assert.ok(requests.some(request => request.pathname === '/api/events' && request.token === initialToken));
    await noLeaks(page);
  });
  await check('a bare local page authenticates real panels and SSE through a no-store, same-origin bootstrap', async () => {
    const before = bootstrapCount(); await page.goto(base); await ready(page, initialToken);
    assert.equal(bootstrapCount(), before + 1);
    assert.equal(await page.evaluate(() => typeof window.qqAgentShell), 'undefined');
    await fetchPolicy(page); await noLeaks(page);
    assert.ok(bootstrapResponses.some(response => response.status === 200 && /no-store/.test(response.headers['cache-control'] || '')));
  });
  await check('after thirty minutes the existing connection survives and bare reload independently renews its tab credential', async () => {
    await preserveFrame(page);
    const now = await page.evaluate(() => Date.now()); await page.clock.install(); await page.clock.setSystemTime(now + CONSOLE_SESSION_TTL_MS + 60000);
    assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).expiresAt < Date.now(), CONSOLE_SESSION_KEY), true);
    kernel.bus.emit('status', { paused: true }); await page.locator('#pause-btn').filter({ hasText: '恢复运行' }).waitFor(); await retained(page);
    kernel.bus.emit('status', { paused: false });
    const before = bootstrapCount(); await page.reload(); await ready(page, initialToken); assert.equal(bootstrapCount(), before + 1);
    await fetchPolicy(page); await noLeaks(page);
  });
  await check('a fresh tab independently authenticates without copying another tab credential', async () => {
    const fresh = await context.newPage(); await watch(fresh);
    const before = bootstrapCount(); await fresh.goto(base); await ready(fresh, initialToken);
    assert.equal(bootstrapCount(), before + 1); await fetchPolicy(fresh); await noLeaks(fresh); await fresh.close();
  });
  await check('external rotation deduplicates concurrent guarded 401s and preserves the active iframe draft', async () => {
    await preserveFrame(page);
    const before = bootstrapCount(), previousFailures = guardFailures.length;
    bootstrapHold = gate(); const held = bootstrapHold;
    kernel.config.update({ server: { token: rotatedToken } });
    const pending = page.frameLocator('#panel-host iframe').locator('body').evaluate(async () => {
      const { request } = await import('/panels/panel-client.js');
      return Promise.all(Array.from({ length: 4 }, () => request('GET', '/api/sessions')));
    });
    await until(() => guardFailures.slice(previousFailures).filter(failure => failure.pathname === '/api/sessions' && failure.token === initialToken && failure.code === 'CONSOLE_AUTH_REQUIRED').length >= 4, 'All four original shared requests must encounter the real old-token guard');
    await until(() => bootstrapCount() === before + 1, 'Concurrent 401 recovery starts one shared bootstrap');
    await delay(100); assert.equal(bootstrapCount(), before + 1, 'Pending bootstrap is coalesced across API requests and SSE');
    bootstrapHold = null; held.release();
    const responses = await pending; assert.ok(responses.every(response => Array.isArray(response.sessions)));
    await ready(page, rotatedToken); await retained(page); await noLeaks(page); await fetchPolicy(page);
    assert.equal(bootstrapCount(), before + 1, 'Recovery completes without an authentication retry storm');
    assert.ok(requests.some(request => request.pathname === '/api/events' && request.token === rotatedToken));
  });
  await check('a brief real listener outage reconnects SSE without losing its iframe or draft', async () => {
    const failedBefore = failedRequests.filter(pathname => pathname === '/api/events').length;
    kernel.config.update({ server: { port: Number(new URL(base).port) } });
    await kernel.httpServer.close();
    await until(() => failedRequests.filter(pathname => pathname === '/api/events').length > failedBefore, 'SSE must actually encounter the stopped temporary listener');
    assert.equal(await page.evaluate(() => document.querySelector('#panel-host iframe') === window.qa182RetainedFrame), true);
    const reconnected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/events' && response.status() === 200);
    assert.equal(await kernel.httpServer.listen(), Number(new URL(base).port));
    await reconnected;
    await until(() => kernel.httpServer.sseCount() === 1, 'The replacement listener must own the new SSE client before sending a status event');
    await ready(page, rotatedToken); await retained(page);
    kernel.bus.emit('status', { paused: true }); await page.locator('#pause-btn').filter({ hasText: '恢复运行' }).waitFor();
    kernel.bus.emit('status', { paused: false });
  });
  await check('an independent wrong candidate retains its own credential and never invokes automatic bootstrap', async () => {
    const before = bootstrapCount();
    const result = await page.evaluate(async token => {
      const { ApiClient } = await import('/api-client.js'); const client = new ApiClient({ token });
      try { await client.get('/api/panels'); return { accepted: true }; }
      catch (error) { return { status: error.status, code: error.data?.code, token: client.token }; }
    }, wrongToken);
    assert.deepEqual(result, { status: 401, code: 'CONSOLE_AUTH_REQUIRED', token: wrongToken });
    assert.equal(bootstrapCount(), before); await ready(page, rotatedToken);
  });
  await check('opaque panel code cannot bootstrap or receive a console credential', async () => {
    const result = await page.frameLocator('#panel-host iframe').locator('body').evaluate(async (_node, base) => {
      try {
        const response = await fetch(base + '/api/console/bootstrap', { method: 'POST', credentials: 'omit', headers: { 'x-qq-agent-bootstrap': '1' } });
        const data = await response.json().catch(() => ({})); return { status: response.status, token: Boolean(data.token) };
      } catch { return { blocked: true }; }
    }, base);
    assert.ok(result.blocked === true || result.status === 403 && result.token === false);
    await noLeaks(page); await ready(page, rotatedToken);
  });
  await check('directly opened user HTML remains an opaque sandbox while its real external JavaScript executes', async () => {
    const assets = path.join(dataDir, 'direct-panel-probe'); fs.mkdirSync(assets);
    fs.writeFileSync(path.join(assets, 'index.html'), '<!doctype html><html><meta charset="utf-8"><title>Synthetic direct user panel</title><p id="probe">Synthetic HTML probe</p><script src="./probe.js"></script></html>');
    fs.writeFileSync(path.join(assets, 'probe.js'), 'window.qa182ProbeExecuted = true; document.documentElement.setAttribute("data-probe-executed", "true");');
    fs.writeFileSync(path.join(assets, 'probe.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><title>Synthetic SVG probe</title><text x="10" y="40">Synthetic SVG probe</text><script href="./probe.js"></script></svg>');
    const prefix = '/panels/u/probe/generation/';
    const files = new Map(['index.html', 'probe.js', 'probe.svg'].map(name => [prefix + name, path.join(assets, name)]));
    probeServer = createHttpServer({ config: { get: () => ({ server: { port: 0, token: 'synthetic-direct-panel182' } }) }, staticDir: assets,
      log: { info() {}, warn() {}, error() {} }, panelAssetResolver: pathname => files.get(pathname) || null });
    const probeBase = `http://127.0.0.1:${await probeServer.listen()}`;
    assert.notEqual(new URL(probeBase).port, '15967'); assert.notEqual(probeBase, base);
    const probeContext = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const probeRequests = [];
    await probeContext.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === probeBase) return route.continue();
      outboundRequests.push(url.href); return route.abort();
    });
    const probePage = await probeContext.newPage(); probePage.setDefaultTimeout(10000);
    const probeResponses = [], probeFailures = [], probeConsole = [];
    probePage.on('pageerror', error => pageErrors.push(error.message));
    probePage.on('request', request => probeRequests.push({ pathname: new URL(request.url()).pathname, method: request.method(), origin: request.headers().origin }));
    const responseDetails = response => response ? { pathname: new URL(response.url()).pathname, status: response.status(), type: response.headers()['content-type'], csp: response.headers()['content-security-policy'] } : null;
    probePage.on('response', response => probeResponses.push(responseDetails(response)));
    probePage.on('requestfailed', request => probeFailures.push({ pathname: new URL(request.url()).pathname, error: request.failure()?.errorText }));
    probePage.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') probeConsole.push({ type: message.type(), text: message.text().slice(0, 500) }); });
    const assertSandbox = response => {
      assert.equal(response.status(), 200);
      const csp = response.headers()['content-security-policy'] || '';
      assert.match(csp, /(?:^|;)\s*sandbox\s+allow-scripts\s*(?:;|$)/, 'The resource response itself enforces sandbox allow-scripts');
      assert.doesNotMatch(csp, /sandbox[^;]*allow-same-origin/);
    };
    const inspectDocument = async name => {
      let phase = 'navigation', navigationResponse = null, identity = null, attempts = null, scriptObservation = { state: 'pending' };
      const starts = { requests: probeRequests.length, responses: probeResponses.length, failures: probeFailures.length, console: probeConsole.length };
      // Handle rejection immediately. A failing navigation/assertion closes the
      // context before this wait is awaited; that secondary rejection must not
      // replace the original diagnostic with an unhandled TargetClosedError.
      const scriptResponse = probePage.waitForResponse(response => new URL(response.url()).pathname === prefix + 'probe.js').then(
        response => { scriptObservation = { state: 'response', ...responseDetails(response) }; return { response }; },
        error => { scriptObservation = { state: 'error', name: error.name, message: error.message }; return { error }; },
      );
      try {
        navigationResponse = await probePage.goto(probeBase + prefix + name);
        phase = 'document-response-CSP'; assertSandbox(navigationResponse);
        phase = 'external-script-response'; const script = await scriptResponse; if (script.error) throw script.error;
        phase = 'external-script-response-CSP'; assertSandbox(script.response);
        phase = 'external-script-execution';
        await probePage.waitForFunction(() => window.qa182ProbeExecuted === true && document.documentElement.getAttribute('data-probe-executed') === 'true');
        phase = 'identity';
        identity = await probePage.evaluate(probeBase => {
          const storageResult = () => { try { sessionStorage.getItem('qq-agent.console-session.v1'); return 'allowed'; } catch (error) { return error.name; } };
          const storageBefore = storageResult(); let history;
          try { window.history.replaceState({}, '', probeBase + '/'); history = 'allowed'; } catch (error) { history = error.name; }
          return { topLevel: window === top, origin: window.origin, storageBefore, storage: storageResult(), history, executed: window.qa182ProbeExecuted, path: location.pathname };
        }, probeBase);
        // Sandboxed documents may rewrite their own displayed URL in Chromium.
        // Even a successful root-path disguise must retain the opaque principal.
        phase = 'identity-assertions';
        assert.ok(identity.history === 'allowed' || identity.history === 'SecurityError');
        assert.deepEqual(identity, { topLevel: true, origin: 'null', storageBefore: 'SecurityError', storage: 'SecurityError', history: identity.history, executed: true, path: identity.history === 'allowed' ? '/' : prefix + name });
        phase = 'bootstrap-attacks';
        attempts = await probePage.evaluate(async probeBase => {
          const outcomes = [];
          for (const attempt of [
            { mode: 'same-origin', referrer: probeBase + '/', referrerPolicy: 'same-origin', headers: { 'x-qq-agent-bootstrap': '1' } },
            { mode: 'cors', referrer: probeBase + '/', referrerPolicy: 'unsafe-url', headers: { 'x-qq-agent-bootstrap': '1' } },
            { mode: 'cors', headers: { 'x-qq-agent-bootstrap': '1', Referer: probeBase + '/' } },
          ]) {
            try {
              const response = await fetch(probeBase + '/api/console/bootstrap', { method: 'POST', credentials: 'omit', ...attempt });
              const body = await response.json().catch(() => ({})); outcomes.push({ status: response.status, token: Boolean(body.token) });
            } catch (error) { outcomes.push({ blocked: true, error: error.name, token: false }); }
          }
          return outcomes;
        }, probeBase);
        phase = 'bootstrap-assertions';
        assert.equal(attempts.length, 3);
        assert.ok(attempts.every(attempt => attempt.token === false && (attempt.blocked === true || attempt.status === 403)), 'A direct user document cannot obtain bootstrap credentials by custom headers or forged referrers');
        console.log('182 direct-panel observation ' + JSON.stringify({ document: name, navigation: responseDetails(navigationResponse), script: scriptObservation, identity, attempts }));
        return attempts;
      } catch (error) {
        const documentState = await probePage.evaluate(() => ({ url: location.href, origin: window.origin, readyState: document.readyState, contentType: document.contentType, executed: window.qa182ProbeExecuted === true, scripts: [...document.querySelectorAll('script')].map(script => script.getAttribute('src') || script.getAttribute('href')) })).catch(probeError => ({ unavailable: probeError.message }));
        console.error('182 direct-panel diagnostic ' + JSON.stringify({ document: name, phase, primaryError: { name: error.name, message: error.message }, pageClosed: probePage.isClosed(), navigation: responseDetails(navigationResponse), script: scriptObservation, identity, attempts, documentState,
          requests: probeRequests.slice(starts.requests), responses: probeResponses.slice(starts.responses), failedRequests: probeFailures.slice(starts.failures), console: probeConsole.slice(starts.console) }));
        throw error;
      }
    };
    try {
      await inspectDocument('index.html');
      await check('directly opened user SVG also remains opaque and cannot forge a bootstrap referrer', async () => { await inspectDocument('probe.svg'); });
      assert.ok(probeRequests.some(request => request.pathname === '/api/console/bootstrap' && request.origin === 'null'), 'A real opaque-origin bootstrap attempt reaches the HTTP boundary');
      assert.ok(probeRequests.every(request => request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS' || request.pathname === '/api/console/bootstrap'));
    } finally { await probeContext.close(); }
  });
  await check('automatic authentication never changes server configuration or weakens request boundaries', async () => {
    assert.deepEqual(configWrites, []); assert.deepEqual(outboundRequests, []); assert.equal(outbound, 0); assert.deepEqual(pageErrors, []);
    assert.ok(requests.every(request => !request.search.includes('token=')), 'Neither bootstrap nor SSE puts tokens in URLs');
    assert.ok(requests.filter(request => request.method === 'POST').every(request => request.pathname === '/api/console/bootstrap'), 'All browser writes are authentication bootstrap only');
    assert.ok(requests.every(request => !/launch|reset-data|test-send/.test(request.pathname)));
  });
  console.log(JSON.stringify({ test: '182-local-auto-auth-browser', passed: checks.length, realKernel: true, randomPort: true, externalRequests: outboundRequests.length, pageErrors: pageErrors.length, productionConsoleAccessed: false }));
} finally {
  bootstrapHold = null; bootstrapUnavailable = false; for (const release of releases) release();
  await browser?.close(); await probeServer?.close(); await kernel.stop();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('qqa-local-auth182-'));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
