// Real loopback OneBot endpoints, synthetic identities and credentials only.
// No system QQ, OneBot process, external network or non-idempotent QQ action is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { OneBotClient } from '../bundled/transport-onebot/client.js';

async function until(check, description, timeout = 3500) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return; await sleep(10); }
  assert.ok(check(), description);
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }

async function endpoint(t, id = '27501') {
  const state = { id, wsId: id, wsToken: 'WS_275_A', httpToken: 'HTTP_275_A', wsPath: '/ws-a', httpPath: '/api-a', httpStatus: 200, loginGate: null, emitIdentity: true, actionGates: new Map() };
  const requests = [], handshakes = [], sockets = new Set();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let body = ''; for await (const part of request) body += part;
    const action = url.pathname.split('/').at(-1);
    requests.push({ path: url.pathname, action, token: url.searchParams.get('access_token') || '', body });
    if (!url.pathname.startsWith(state.httpPath + '/')) { response.writeHead(404); response.end('{}'); return; }
    if ((url.searchParams.get('access_token') || '') !== state.httpToken) { response.writeHead(401); response.end('{}'); return; }
    if (state.httpStatus !== 200) { response.writeHead(state.httpStatus); response.end('{}'); return; }
    const login = { user_id: state.id ? Number(state.id) : 0, nickname: 'SYNTHETIC_275' };
    if (action === 'get_login_info' && state.loginGate) await state.loginGate.promise;
    if (state.actionGates.has(action)) await state.actionGates.get(action).promise;
    if (response.destroyed) return;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', retcode: 0, data: action === 'get_login_info' ? login : { endpoint: id } }));
  });
  const ws = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    handshakes.push({ path: url.pathname, token: url.searchParams.get('access_token') || '' });
    if (url.pathname !== state.wsPath || (url.searchParams.get('access_token') || '') !== state.wsToken) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    ws.handleUpgrade(request, socket, head, connection => ws.emit('connection', connection, request));
  });
  ws.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    state.onConnection?.();
    if (state.emitIdentity) socket.send(JSON.stringify({ post_type: 'meta_event', meta_event_type: 'lifecycle', self_id: Number(state.wsId) }));
  });
  let port;
  async function listen() {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port || 0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
    port = server.address().port;
  }
  async function pause() {
    for (const socket of sockets) socket.terminate();
    if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
  await listen();
  t.after(async () => { state.loginGate?.resolve(); for (const gate of state.actionGates.values()) gate.resolve(); await pause(); await new Promise(resolve => ws.close(resolve)); });
  return { state, requests, handshakes, sockets, pause, listen,
    config(extra = {}) { return { wsUrl: `ws://127.0.0.1:${port}${state.wsPath}`, httpUrl: `http://127.0.0.1:${port}${state.httpPath}`,
      accessToken: state.wsToken, httpToken: state.httpToken, expectedSelfId: id, candidateScope: 'ACCOUNT_275_' + id, bindingKey: 'BINDING_275_' + id, scopedCredentials: true, ...extra }; },
    emit(event) { for (const socket of sockets) socket.send(JSON.stringify(event)); },
  };
}
function client(t, configuration, extra = {}) {
  const statuses = [], events = [], logs = [];
  const instance = new OneBotClient({ ...configuration, probeIntervalMs: 35, reconnectBaseMs: 35,
    onStatus: status => statuses.push(status), onEvent: event => events.push(event), log: { info: line => logs.push(line), warn: line => logs.push(line) }, ...extra });
  t.after(() => instance.close());
  return Object.assign(instance, { statuses, events, logs });
}

test('scoped account starts with independently resolved WS/HTTP credentials and never sends disk candidates', async t => {
  const target = await endpoint(t), current = client(t, target.config(), { tokenCandidates: () => ['STALE_OTHER_ACCOUNT_275', target.state.wsToken] });
  await current.connect();
  await until(() => current.transportReady, 'both channels identify the selected account');
  assert.equal(current.selfId, '27501'); assert.equal(current.stage, 'ready');
  assert.equal(current.statuses.at(-1).identityBound, true);
  assert.deepEqual(new Set(target.handshakes.map(request => request.token)), new Set(['WS_275_A']));
  assert.deepEqual(new Set(target.requests.map(request => request.token)), new Set(['HTTP_275_A']));
  await current.call('get_group_list');
  assert.equal(target.requests.at(-1).action, 'get_group_list');
  assert.ok(![...target.requests, ...target.handshakes].some(request => request.token === 'STALE_OTHER_ACCOUNT_275'));
});

test('multi-account port/path/token change replaces the binding and cancels old credentials before the next request', async t => {
  const first = await endpoint(t, '27501'), second = await endpoint(t, '27502');
  second.state.wsToken = 'WS_275_B'; second.state.httpToken = 'HTTP_275_B'; second.state.wsPath = '/other/ws'; second.state.httpPath = '/other/api';
  let configuration = first.config();
  const current = client(t, configuration, { getConfig: () => configuration, tokenCandidates: () => ['WS_275_A', 'HTTP_275_A'] });
  await current.connect(); await until(() => current.transportReady, 'first account connects');
  const before = current._configurationGeneration;
  configuration = second.config(); current.configure(configuration);
  assert.equal(current.selfId, null); assert.equal(current.transportReady, false);
  assert.ok(current._configurationGeneration > before);
  await until(() => current.transportReady && current.selfId === '27502', 'second account connects on its own port and paths');
  await current.call('get_group_list');
  assert.ok(second.handshakes.every(request => request.token === 'WS_275_B' && request.path === '/other/ws'));
  assert.ok(second.requests.every(request => request.token === 'HTTP_275_B' && request.path.startsWith('/other/api/')));
  const oldRequests = first.requests.length, oldHandshakes = first.handshakes.length;
  await sleep(100); assert.equal(first.requests.length, oldRequests); assert.equal(first.handshakes.length, oldHandshakes);
});

test('HTTP-only token changes invalidate identity and recover 401 without replacing the healthy WS socket', async t => {
  const target = await endpoint(t), current = client(t, target.config());
  await current.connect(); await until(() => current.transportReady, 'initial binding ready');
  const wsGeneration = current._gen, connections = target.handshakes.length;
  target.state.httpToken = 'HTTP_275_ROTATED';
  current.configure(target.config({ httpToken: 'HTTP_275_WRONG', bindingKey: 'changed-http' }));
  await until(() => current.errorCode === 'ONEBOT_HTTP_UNAUTHORIZED', 'HTTP 401 is visible');
  assert.equal(current.connected, true); assert.equal(current.transportReady, false); assert.equal(current.selfId, null);
  current.configure(target.config({ bindingKey: 'updated-http' }));
  await until(() => current.transportReady, 'updated HTTP token recovers automatically');
  assert.equal(current._gen, wsGeneration); assert.equal(target.handshakes.length, connections);
  assert.ok(!target.requests.some(request => request.token === 'WS_275_A'));
  target.state.httpToken = '';
  current.configure(target.config({ bindingKey: 'empty-http' }));
  await until(() => current.transportReady && target.requests.at(-1).token === '', 'empty exact HTTP token stays empty instead of borrowing the WS credential');
});

test('WS token change uses only the updated credential and restarts its authentication immediately', async t => {
  const target = await endpoint(t), current = client(t, target.config());
  await current.connect(); await until(() => current.transportReady, 'initial ready');
  const oldGeneration = current._gen, oldCount = target.handshakes.length;
  target.state.wsToken = 'WS_275_ROTATED'; current.configure(target.config({ bindingKey: 'changed-ws' }));
  await until(() => current.transportReady && target.handshakes.length > oldCount, 'WS token hot update reconnects');
  assert.ok(current._gen > oldGeneration);
  assert.ok(target.handshakes.slice(oldCount).every(request => request.token === 'WS_275_ROTATED'));
  assert.ok(target.requests.every(request => request.token === 'HTTP_275_A'));
});

test('periodic read-only health checks recover late HTTP, no-login and temporary HTTP 401 failures', async t => {
  const target = await endpoint(t); target.state.httpStatus = 503;
  const current = client(t, target.config()); await current.connect();
  await until(() => current.connected && current.errorCode === 'ONEBOT_HTTP_UNAVAILABLE', 'HTTP outage does not masquerade as complete readiness');
  assert.equal(current.transportReady, false); assert.equal(current.selfId, null);
  target.state.httpStatus = 200; target.state.id = '';
  await until(() => current.errorCode === 'ONEBOT_NOT_LOGGED_IN', 'logged-out response is classified');
  target.state.id = '27501';
  await until(() => current.transportReady, 'HTTP recovers after the original startup probes would have ended');
  target.state.httpStatus = 401;
  await until(() => current.errorCode === 'ONEBOT_HTTP_UNAUTHORIZED', 'later unauthorized state clears readiness');
  target.state.httpStatus = 200;
  await until(() => current.transportReady && current.error === null, 'same valid token recovers after server-side auth becomes available');
  assert.ok(target.requests.every(request => request.action === 'get_login_info'), 'recovery never replays a business action');
});

test('network disconnection and server restart recover without stale successful-token reuse', async t => {
  const target = await endpoint(t), current = client(t, target.config());
  await current.connect(); await until(() => current.transportReady, 'initial ready');
  await target.pause();
  await until(() => !current.connected && !current.transportReady, 'disconnect invalidates readiness');
  await until(() => current.error?.includes('ECONNREFUSED'), 'connection diagnostics retain the socket cause');
  await target.listen(); await until(() => current.transportReady, 'backoff reconnects after a real listener restart');
  assert.equal(current.selfId, '27501'); assert.ok(target.handshakes.length > 1);
  assert.ok(target.handshakes.every(request => request.token === 'WS_275_A'));
});

test('HTTP account mismatch rejects business actions before transmission and recovers only after correct identity', async t => {
  const target = await endpoint(t); target.state.id = '27599';
  const current = client(t, target.config()); await current.connect();
  await until(() => current.errorCode === 'ONEBOT_ACCOUNT_MISMATCH', 'different HTTP account is detected');
  assert.equal(current.transportReady, false); assert.equal(current.connected, false); assert.equal(current.selfId, null);
  await assert.rejects(current.call('get_group_list'), /账号|不一致/);
  assert.ok(!target.requests.some(request => request.action === 'get_group_list'));
  target.state.id = '27501';
  await until(() => current.transportReady, 'correct account is revalidated on reconnect');
});

test('wrong-account WS events disconnect before dispatch; unattributed bound events cannot enter the provider', async t => {
  const target = await endpoint(t), current = client(t, target.config());
  await current.connect(); await until(() => current.transportReady, 'initial ready');
  target.emit({ post_type: 'message', user_id: 123, message: 'unattributed synthetic message' }); await sleep(25);
  assert.ok(!current.events.some(event => event.post_type === 'message'));
  target.emit({ post_type: 'message', self_id: 27599, user_id: 123, message: 'wrong account synthetic message' });
  await until(() => current.statuses.some(status => status.errorCode === 'ONEBOT_ACCOUNT_MISMATCH'), 'wrong WS account is diagnosed');
  assert.ok(!current.events.some(event => event.post_type === 'message'));
  await until(() => current.transportReady, 'fresh correctly bound socket recovers');
  target.emit({ post_type: 'message', self_id: 27501, user_id: 123, message: 'correct synthetic message' });
  await until(() => current.events.some(event => event.post_type === 'message'), 'correct attributed event is delivered');
});

test('late old-generation HTTP probes cannot republish a previous account after endpoint replacement or stop', async t => {
  const first = await endpoint(t, '27501'), second = await endpoint(t, '27502'), gate = deferred();
  first.state.loginGate = gate;
  const current = client(t, first.config()); await current.connect();
  await until(() => first.requests.some(request => request.action === 'get_login_info'), 'old probe is actually in flight');
  current.configure(second.config());
  await until(() => current.transportReady && current.selfId === '27502', 'new binding becomes ready without the old response');
  const switchIndex = current.statuses.length; gate.resolve(); await sleep(100);
  assert.ok(current.statuses.slice(switchIndex).every(status => status.selfId !== '27501'));
  assert.equal(current.selfId, '27502');
  const stopGate = deferred(); second.state.loginGate = stopGate;
  const count = second.requests.length;
  await until(() => second.requests.length > count, 'new generation probe is in flight before stop');
  await current.close(); stopGate.resolve();
  current.configure(first.config()); current.reconnect(); await sleep(100);
  assert.equal(current.connected, false); assert.equal(current.transportReady, false); assert.equal(current.selfId, null);
  assert.equal(current._probeTimers.size, 0); assert.equal(current._reconnectTimer, null); assert.equal(current._httpControllers.size, 0);
});

test('resolver configuration failures block both channels locally until a valid binding arrives', async t => {
  const target = await endpoint(t), current = client(t, target.config({ connectionError: '所选账号的监听端口冲突', connectionCode: 'ONEBOT_ENDPOINT_CONFLICT' }));
  await current.connect(); await assert.rejects(current.call('get_group_list'), /端口冲突/);
  assert.equal(target.handshakes.length, 0); assert.equal(target.requests.length, 0);
  assert.equal(current.stage, 'configuration_error'); assert.equal(current.errorCode, 'ONEBOT_ENDPOINT_CONFLICT');
  current.configure(target.config()); await until(() => current.transportReady, 'cleared resolver error permits connection');
});

test('manual OneBot without expected identity remains usable and explicitly reports an unbound identity', async t => {
  const target = await endpoint(t); target.state.emitIdentity = false;
  const current = client(t, target.config({ expectedSelfId: '' })); await current.connect();
  await until(() => current.transportReady, 'manual HTTP identity plus WS connection is usable');
  assert.equal(current.statuses.at(-1).identityBound, false);
});

test('a bound account waits for WS identity even when HTTP has already logged in', async t => {
  const target = await endpoint(t); target.state.emitIdentity = false;
  const current = client(t, target.config()); await current.connect();
  await until(() => current.connected && current.selfId === '27501', 'HTTP identity is known');
  assert.equal(current.transportReady, false);
  target.emit({ post_type: 'meta_event', meta_event_type: 'heartbeat', self_id: 27501 });
  await until(() => current.transportReady, 'attributed WS heartbeat completes readiness');
});

test('WS unauthorized status stays diagnostic and token update recovers without old-candidate retries', async t => {
  const target = await endpoint(t), current = client(t, target.config({ accessToken: 'WRONG_WS_275' }), { tokenCandidates: () => ['STALE_WS_275', target.state.wsToken] });
  await current.connect();
  await until(() => current.errorCode === 'ONEBOT_WS_UNAUTHORIZED', 'WS authentication error is exposed');
  await sleep(80);
  assert.equal(current.errorCode, 'ONEBOT_WS_UNAUTHORIZED', 'the rejected socket close cannot erase the 401 diagnosis');
  assert.equal(current.transportReady, false);
  assert.deepEqual(target.handshakes.map(request => request.token), ['WRONG_WS_275']);
  current.configure(target.config());
  await until(() => current.transportReady, 'current exact WS token resumes the connection');
  assert.equal(target.handshakes.at(-1).token, 'WS_275_A');
});

test('health probes remain serial when the HTTP response takes longer than the interval', async t => {
  const target = await endpoint(t), gate = deferred(); target.state.loginGate = gate;
  const current = client(t, target.config()); await current.connect();
  await until(() => target.requests.length > 0, 'first health probe is pending');
  await sleep(120);
  assert.equal(target.requests.length, 1, 'a slow probe cannot start overlapping periodic requests');
  gate.resolve(); target.state.loginGate = null;
  await until(() => current.transportReady, 'completed probe verifies readiness');
  await until(() => target.requests.length > 1, 'the next health probe runs after completion');
});

test('WS handshake is bounded and retains its timeout cause instead of staying connecting forever', async t => {
  const sockets = new Set(), server = http.createServer();
  server.on('upgrade', (_request, socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const current = client(t, { wsUrl: `ws://127.0.0.1:${server.address().port}`, httpUrl: `http://127.0.0.1:${server.address().port}`, scopedCredentials: true }, { handshakeTimeoutMs: 80, reconnectBaseMs: 1000 });
  await current.connect();
  await until(() => current.errorCode === 'ONEBOT_WS_UNAVAILABLE' && /timed out/i.test(current.error), 'hung WS upgrade becomes a bounded diagnosable failure');
  assert.equal(current.connected, false); assert.equal(current.transportReady, false);
});

test('an account mismatch cancels an already in-flight action so its old response cannot become a new-account result', async t => {
  const target = await endpoint(t), gate = deferred(), current = client(t, target.config());
  await current.connect(); await until(() => current.transportReady, 'initial account ready');
  target.state.actionGates.set('get_group_list', gate);
  const result = current.call('get_group_list').then(value => ({ value }), error => ({ error }));
  await until(() => target.requests.some(request => request.action === 'get_group_list'), 'business request is actually pending');
  target.emit({ post_type: 'meta_event', meta_event_type: 'heartbeat', self_id: 27599 });
  const outcome = await result;
  assert.equal(outcome.value, undefined); assert.match(outcome.error?.message || '', /更改|关闭/);
  gate.resolve(); await sleep(100);
  assert.equal(target.requests.filter(request => request.action === 'get_group_list').length, 1, 'account recovery cannot replay the cancelled action');
});

test('staging a changed binding without reconnect still invalidates the previous socket and callbacks immediately', async t => {
  const first = await endpoint(t, '27501'), second = await endpoint(t, '27502'), current = client(t, first.config());
  await current.connect(); await until(() => current.transportReady, 'initial binding ready');
  const staleSocket = current.ws, eventCount = current.events.length;
  current.configure(second.config(), { reconnect: false });
  staleSocket.emit('message', JSON.stringify({ post_type: 'message', self_id: 27501, user_id: 123 }));
  staleSocket.emit('open');
  await sleep(60);
  assert.equal(current.events.length, eventCount); assert.equal(current.selfId, null);
  assert.equal(current.connected, false); assert.equal(current.ws, null); assert.equal(second.handshakes.length, 0);
  current.reconnect(); await until(() => current.transportReady && current.selfId === '27502', 'explicit reconnect uses only the staged new binding');
});

test('HTTP configuration synchronized inside the first health probe cannot create a concurrent replacement probe', async t => {
  const target = await endpoint(t), gate = deferred(); target.state.loginGate = gate;
  let configuration = target.config();
  target.state.onConnection = () => {
    target.state.httpToken = 'HTTP_275_UPDATED_DURING_CONNECT';
    configuration = target.config({ bindingKey: 'http-updated-before-first-probe' });
  };
  const current = client(t, configuration, { getConfig: () => configuration }); await current.connect();
  await until(() => target.requests.length > 0, 'fresh-configuration health request is actually pending');
  const wsGeneration = current._gen;
  await sleep(120);
  assert.equal(target.requests.length, 1, 'nested configure inside call reserves one serial health probe');
  assert.equal(target.requests[0].token, 'HTTP_275_UPDATED_DURING_CONNECT');
  assert.equal(current._gen, wsGeneration); assert.equal(target.handshakes.length, 1, 'HTTP refresh retains its healthy WS socket');
  gate.resolve(); target.state.loginGate = null;
  await until(() => current.transportReady, 'the current probe establishes readiness after release');
  await until(() => target.requests.length > 1, 'future periodic health checks remain active');
});

for (const mode of ['stop', 'configure']) test(`synchronous status-observer ${mode} cannot dispatch the message whose identity triggered it`, async t => {
  const target = await endpoint(t), replacement = mode === 'configure' ? await endpoint(t, '27502') : null;
  let armed = false, observerCalled = false;
  const current = client(t, target.config(), { onStatus(status) {
    if (!armed || !status.transportReady) return;
    armed = false; observerCalled = true;
    if (mode === 'stop') void current.close(); else current.configure(replacement.config());
  } });
  await current.connect(); await until(() => current.transportReady, 'initial binding ready');
  armed = true;
  target.emit({ post_type: 'message', self_id: 27501, user_id: 123, message: 'synchronous observer generation test' });
  await until(() => observerCalled, 'the real message identity called the synchronous status observer');
  await sleep(50);
  assert.ok(!current.events.some(event => event.post_type === 'message'), 'old event cannot continue after its observer changed ownership');
  if (replacement) await until(() => current.transportReady && current.selfId === '27502', 'new binding remains usable');
  else assert.equal(current.connected, false);
});

test('a login result cannot return after its synchronous identity observer stops the client', async t => {
  const target = await endpoint(t);
  let armed = false;
  const current = client(t, target.config(), { onStatus(status) {
    if (armed && status.selfId === '27501') { armed = false; void current.close(); }
  } });
  armed = true;
  await assert.rejects(current.call('get_login_info'), /更改|关闭/);
  assert.equal(current.selfId, null); assert.equal(current.connected, false);
});
