// G16 / R44: live connection settings are consumed by the owning transport plugin.
// Real loopback HTTP + WS prove the request destination and credentials; no QQ process starts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createOneBotProvider } from '../bundled/transport-onebot/provider.js';
import { OneBotClient } from '../bundled/transport-onebot/client.js';
import transportPlugin from '../bundled/transport-onebot/index.js';
import { eq, ok, section, rejects, summary, mktmp, sleep } from './helpers.mjs';

async function endpoint(name) {
  const requests = [], connections = [], sockets = new Set(), pending401 = [];
  let redirectTarget = null;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const parsed = new URL(req.url, 'http://127.0.0.1');
    requests.push({ action: parsed.pathname.slice(1), token: parsed.searchParams.get('access_token') ?? '', body });
    if (parsed.pathname === '/delayed-401') await new Promise(resolve => pending401.push(resolve));
    if (parsed.pathname === '/redirect') { res.writeHead(302, { location: redirectTarget }); res.end(); return; }
    if (parsed.pathname === '/delayed-401') { res.writeHead(401); res.end('{}'); return; }
    if (parsed.pathname === '/rotate' && parsed.searchParams.get('access_token') !== 'QA150_CANDIDATE_GOOD') {
      res.writeHead(401); res.end('{}'); return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { endpoint: name, user_id: name === 'A' ? 15001 : 15002 } }));
  });
  const ws = new WebSocketServer({ server });
  ws.on('connection', (socket, req) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    connections.push(new URL(req.url, 'http://127.0.0.1').searchParams.get('access_token') ?? '');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { name, requests, connections, pending401, setRedirect(url) { redirectTarget = url; }, httpUrl: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}`,
    async close() { for (const resolve of pending401) resolve(); for (const socket of sockets) socket.terminate(); await new Promise(resolve => ws.close(resolve)); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
async function until(fn, timeout = 1500) {
  const started = Date.now(); while (!fn() && Date.now() - started < timeout) await sleep(10); return !!fn();
}
const A = await endpoint('A'), B = await endpoint('B'), C = await endpoint('C');
const root = mktmp('qqa-150-live-config-');
const connection = (target, accessToken, httpAccessToken = accessToken) => ({ wsUrl: target.wsUrl, httpUrl: target.httpUrl, accessToken, httpAccessToken });
const resources = [];
try {
  section('Actual HTTP next call consumes a fresh cloned config snapshot');
  let config = { onebot: connection(A, 'QA150_OLD') };
  const provider = createOneBotProvider({ cfg: () => structuredClone(config), log: {}, tokenCandidates: () => ['QA150_OLD_DISK', ''] });
  resources.push(() => provider.stop());
  eq((await provider.client.call('initial')).data.endpoint, 'A', 'initial action reaches endpoint A');
  eq(A.requests.at(-1).token, 'QA150_OLD', 'initial HTTP credential follows config');
  config = { onebot: connection(B, 'QA150_NEW', 'QA150_NEW_HTTP') };
  eq((await provider.client.call('next')).data.endpoint, 'B', 'next action after update reaches endpoint B without restart');
  eq(B.requests.filter(r => r.action === 'next').map(r => r.token), ['QA150_NEW_HTTP'], 'new endpoint only receives the newly configured HTTP token');
  ok(!B.requests.some(r => /OLD/.test(r.token)), 'old in-memory and disk tokens never reach B');
  config.onebot.accessToken = ''; config.onebot.httpAccessToken = '';
  await provider.client.call('cleared');
  eq(B.requests.filter(r => r.action === 'cleared').map(r => r.token), [''], 'explicitly clearing both credentials sends no previous token');
  config.onebot.httpUrl = '';
  const sentBeforeBlank = A.requests.length + B.requests.length + C.requests.length;
  await rejects(() => provider.client.call('blank'), 'empty HTTP URL rejects locally');
  eq(A.requests.length + B.requests.length + C.requests.length, sentBeforeBlank, 'blank URL never falls back to an old or default endpoint');
  config = { onebot: { httpUrl: null, accessToken: null, httpAccessToken: null } };
  await rejects(() => provider.client.call('explicit-null'), 'explicit null URL does not resurrect legacy endpoint');
  config = { onebot: connection(C, 'QA150_LEGACY_NEW') };
  eq((await provider.client.call('legacy')).data.endpoint, 'C', 'explicit OneBot configuration supplies its endpoint');
  eq(C.requests.at(-1)?.token, 'QA150_LEGACY_NEW', 'legacy namespace refresh uses current token');
  config.onebot.httpAccessToken = 'QA150_NEW_BAD';
  const rejectedRotationStart = C.requests.length;
  await rejects(() => provider.client.call('rotate'), 'hot configuration does not fall back to stale disk tokens after HTTP 401');
  eq(C.requests.slice(rejectedRotationStart).map(r => r.token), ['QA150_NEW_BAD'], 'hot endpoint receives only its current credential on 401');
  await provider.stop();

  section('Actual plugin subscription: live WS generations, duplicates and stop');
  config = { onebot: connection(A, 'QA150_WS_A') };
  const listeners = new Set(), descriptors = [], stops = [];
  const hostConfig = { get: () => structuredClone(config), onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const update = (onebot) => { config = { onebot: { ...config.onebot, ...onebot } }; for (const listener of [...listeners]) listener(structuredClone(config)); };
  transportPlugin.setup({ log: {}, capability(name) { return name === 'host.config' ? hostConfig : { appRoot: root }; }, registerTransport(item) { descriptors.push(item); }, registerCapability() {}, lifecycle: { onStop(fn) { stops.push(fn); } } });
  const controller = new AbortController(); let current = true;
  const active = descriptors[0].create({ signal: controller.signal, current: () => current });
  resources.push(() => active.stop());
  await active.start();
  await Promise.all([active.start(), active.start()]);
  ok(await until(() => active.connected), 'actual initial WS connects');
  eq(listeners.size, 1, 'only started active provider holds a config subscription');
  const initialA = A.connections.length, initialB = B.connections.length;
  update(connection(B, 'QA150_WS_B', 'QA150_HTTP_B'));
  ok(await until(() => B.connections.length > initialB && active.connected), 'config update reconnects WS to endpoint B');
  eq(B.connections.at(-1), 'QA150_WS_B', 'new WS handshake uses current access token');
  eq(active.client.wsUrl, B.wsUrl, 'client holds current WS URL');
  eq(active.client.httpUrl, B.httpUrl, 'client holds current HTTP URL');
  eq((await active.client.call('subscribed')).data.endpoint, 'B', 'subscribed provider HTTP uses updated destination');
  eq(B.requests.at(-1)?.token, 'QA150_HTTP_B', 'subscribed HTTP does not retain prior token');
  const generation = active.client._gen, bCount = B.connections.length;
  update({ ...config.onebot }); await sleep(80);
  eq(active.client._gen, generation, 'identical settings do not replace WS generation');
  eq(B.connections.length, bCount, 'identical settings do not reconnect');
  update({ httpAccessToken: 'QA150_HTTP_ONLY' });
  eq(active.client._gen, generation, 'HTTP-only token change preserves healthy WS');
  await active.client.call('http-token-only');
  eq(B.requests.at(-1)?.token, 'QA150_HTTP_ONLY', 'HTTP-only token update is immediate');
  const delayed = active.client.call('delayed-401').then(() => false, () => true);
  ok(await until(() => B.pending401.length > 0), 'old HTTP request is actually in flight before update');
  update({ httpUrl: C.httpUrl, httpAccessToken: 'QA150_HTTP_C_CURRENT' });
  for (const target of [A, B, C]) for (const resolve of target.pending401) resolve();
  eq(await delayed, true, 'in-flight old request is cancelled instead of retrying after configuration change');
  await active.client.call('after-inflight-change');
  eq(C.requests.filter(r => r.action === 'after-inflight-change').map(r => r.token), ['QA150_HTTP_C_CURRENT'], 'next request after cancellation uses only current endpoint credentials');
  eq(B.requests.filter(r => r.action === 'delayed-401').length, 1, 'stale 401 does not start an old token retry loop');
  const cBefore = C.connections.length;
  update(connection(A, 'QA150_RAPID_OLD')); update(connection(C, 'QA150_RAPID_CURRENT'));
  ok(await until(() => C.connections.length > cBefore && active.connected), 'rapid successive updates settle on latest WS generation');
  eq(C.connections.at(-1), 'QA150_RAPID_CURRENT', 'latest rapid update owns WS authentication');
  eq(active.client.wsUrl, C.wsUrl, 'late callbacks do not restore earlier URL');
  const settledGeneration = active.client._gen;
  await sleep(100);
  eq(active.client._gen, settledGeneration, 'old close/error callbacks do not schedule a competing connection');
  update({ wsUrl: '' }); await sleep(50);
  eq(active.connected, false, 'clearing WS URL immediately disconnects');
  const stoppedConnections = A.connections.length + B.connections.length + C.connections.length;
  await sleep(80);
  eq(A.connections.length + B.connections.length + C.connections.length, stoppedConnections, 'cleared WS URL does not reconnect to previous address');
  update(connection(B, 'QA150_RESUME'));
  ok(await until(() => active.connected && B.connections.at(-1) === 'QA150_RESUME'), 'new valid WS settings restore connection');
  await active.stop();
  eq(listeners.size, 0, 'stop disposes its config subscription');
  update(connection(A, 'QA150_AFTER_STOP'));
  active.reconnect(); await sleep(100);
  eq(active.connected, false, 'stop followed by config update and explicit reconnect stays stopped');
  const postStopConnections = A.connections.length + B.connections.length + C.connections.length;
  await sleep(80);
  eq(A.connections.length + B.connections.length + C.connections.length, postStopConnections, 'no delayed connection resurrects stopped provider');
  ok(A.connections.length >= initialA, 'initial endpoint history is retained for diagnosis');
  current = false; controller.abort();
  await active.start();
  eq(listeners.size, 0, 'cancelled or obsolete provider cannot resubscribe');
  await active.stop();

  section('Standalone client token rotation remains compatible');
  const standalone = new OneBotClient({ wsUrl: A.wsUrl, httpUrl: A.httpUrl, accessToken: 'QA150_CANDIDATE_BAD', tokenCandidates: () => ['QA150_CANDIDATE_GOOD'], log: {} });
  resources.push(() => standalone.close());
  const rotationStart = A.requests.length;
  eq((await standalone.call('rotate')).status, 'ok', 'standalone HTTP 401 rotates to supplied candidate');
  eq(A.requests.slice(rotationStart).map(r => r.token), ['QA150_CANDIDATE_BAD', 'QA150_CANDIDATE_GOOD'], 'standalone configured and candidate token order stays intact');
  await standalone.close();
  const redirectClient = new OneBotClient({ httpUrl: A.httpUrl, accessToken: 'QA150_REDIRECT_PRIVATE', log: {} });
  resources.push(() => redirectClient.close());
  A.setRedirect(`${B.httpUrl}/redirected?access_token=QA150_REDIRECT_PRIVATE`);
  const redirectsBefore = B.requests.length;
  await rejects(() => redirectClient.call('redirect'), 'HTTP redirect rejects rather than forwarding credentials to another host');
  eq(B.requests.length, redirectsBefore, 'redirect target receives no request or credential');
  await redirectClient.close();

  section('Fresh port probe rejects stale successful completion');
  let probeCfg = { onebot: connection(A, 'QA150_PROBE_A') };
  const pending = [], timers = [], originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
  globalThis.setInterval = callback => { const timer = { callback, unref() {} }; timers.push(timer); return timer; };
  globalThis.clearInterval = () => {};
  let reconnects = 0;
  class ProbeClient {
    constructor(options) { this.options = options; this.connected = false; }
    async connect() {} async close() { this.connected = false; }
    reconnect() { reconnects++; }
  }
  try {
    const probing = createOneBotProvider({ cfg: () => structuredClone(probeCfg), log: {}, clientFactory: ProbeClient, portProbe: url => new Promise(resolve => pending.push({ url, resolve })), portProbeIntervalMs: 10 });
    await probing.start();
    const first = timers.at(-1).callback();
    probeCfg = { onebot: connection(B, 'QA150_PROBE_B') };
    pending[0].resolve(true); await first;
    eq(reconnects, 0, 'port readiness for an obsolete URL cannot trigger reconnection');
    const second = timers.at(-1).callback();
    eq(pending.at(-1).url, B.wsUrl, 'next port probe reads current config rather than creation snapshot');
    await probing.stop(); pending.at(-1).resolve(true); await second;
    eq(reconnects, 0, 'stopped probe completion cannot revive connection');
  } finally { globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear; }
} finally {
  for (const dispose of resources.reverse()) await dispose().catch(() => {});
  await Promise.all([A.close(), B.close(), C.close()]);
  fs.rmSync(root, { recursive: true, force: true });
}
summary('150-transport-live-configuration');
