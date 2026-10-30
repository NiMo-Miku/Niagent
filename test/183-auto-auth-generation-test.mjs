// Pure Node generation regressions. Every fetch below is a local function and
// every response is synthetic; no server, browser, account or socket is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsoleAuth, CONSOLE_SESSION_KEY } from '../ui/shell/console-auth.js';
import { ApiClient } from '../ui/shell/api-client.js';
import { SseClient } from '../ui/shell/sse-client.js';

const origin = 'http://127.0.0.1:18083';
const A = 'synthetic-generation-A-183', B = 'synthetic-generation-B-183', OLD = 'synthetic-obsolete-response-183';
const tick = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(data) });
const denied = () => json(401, { error: 'synthetic host authentication required', code: 'CONSOLE_AUTH_REQUIRED' });
const urlPath = input => new URL(String(input), `${origin}/`).pathname;

function browserWindow(fetchImpl, { token = A, explicit = true, pathname = '/', topLevel = true, base = origin } = {}) {
  const storage = new Map();
  const win = {
    location: new URL(`${base}${pathname}${explicit ? `?token=${encodeURIComponent(token)}` : ''}`),
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    fetch: fetchImpl,
    history: { replaceState(_state, _title, value) { win.location = new URL(value, base); } },
  };
  win.top = topLevel ? win : {};
  return { win, storage };
}

async function explicitAuth(t, fetchImpl) {
  const fixture = browserWindow(fetchImpl);
  const auth = await createConsoleAuth(fixture.win);
  auth.confirm();
  t.after(() => auth.dispose());
  return { ...fixture, auth };
}

function globalBrowser(t, fetchImpl) {
  const saved = new Map(['fetch', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL(`${origin}/`) });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchImpl });
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

test('a bare top-level loopback shell uses the narrowly scoped bootstrap request', async t => {
  const calls = [];
  const { win } = browserWindow(async (url, init) => { calls.push({ url, init }); return json(200, { token: A }); }, { explicit: false });
  const auth = await createConsoleAuth(win); t.after(() => auth.dispose());
  assert.equal(auth.token, A);
  assert.equal(auth.automatic, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/console/bootstrap');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.mode, 'same-origin');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.referrerPolicy, 'same-origin');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.headers['x-qq-agent-bootstrap'], '1');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('temporary bootstrap failures retain automatic recovery while denied entry points retain manual recovery', async t => {
  for (const status of [403, 404, 405, 500, 503]) {
    let available = false;
    const { win } = browserWindow(async () => available ? json(200, { token: A }) : json(status, {}), { explicit: false });
    const auth = await createConsoleAuth(win); t.after(() => auth.dispose());
    assert.equal(auth.token, '');
    assert.equal(auth.automatic, ![403, 404, 405].includes(status), `bootstrap HTTP ${status}`);
    available = true;
    assert.equal(await auth.recover(), true);
    assert.equal(auth.automatic, true);
    assert.equal(auth.token, A);
    auth.dispose(); assert.equal(auth.automatic, false);
  }
});

test('many concurrent recoveries share one bootstrap and adopt its current response', async t => {
  const gate = deferred(), calls = [];
  const { auth, storage } = await explicitAuth(t, (url, init) => { calls.push({ url, init }); return gate.promise; });
  const recoveries = Array.from({ length: 16 }, () => auth.recover(A));
  assert.equal(calls.length, 1);
  gate.resolve(json(200, { token: B }));
  assert.deepEqual(await Promise.all(recoveries), Array(16).fill(true));
  assert.equal(auth.token, B);
  assert.equal(JSON.parse(storage.get(CONSOLE_SESSION_KEY)).token, B);
});

for (const changes of [[B], [B, A]]) {
  test(`manual adoption ${changes.length === 1 ? 'A-B' : 'A-B-A'} fences a pending obsolete bootstrap`, async t => {
    const gate = deferred(), calls = [];
    const { auth, storage } = await explicitAuth(t, (url, init) => { calls.push({ url, init }); return gate.promise; });
    let settled = false;
    const recovery = auth.recover(A).then(result => { settled = true; return result; });
    assert.equal(calls.length, 1);
    for (const token of changes) auth.adopt(token);
    assert.equal(calls[0].init.signal.aborted, true);
    await tick();
    assert.equal(settled, true, 'an aborted bootstrap settles even when its fetch ignores AbortSignal');
    assert.equal(await recovery, false);
    gate.resolve(json(200, { token: OLD })); await tick();
    assert.equal(auth.token, changes.at(-1));
    assert.equal(JSON.parse(storage.get(CONSOLE_SESSION_KEY)).token, changes.at(-1));
  });
}

test('dispose settles pending recovery and its late response cannot revive authentication', async t => {
  const gate = deferred(), calls = [];
  const { auth, storage } = await explicitAuth(t, (url, init) => { calls.push({ url, init }); return gate.promise; });
  let settled = false;
  const recovery = auth.recover(A).then(result => { settled = true; return result; });
  auth.dispose(); await tick();
  assert.equal(calls[0].init.signal.aborted, true);
  assert.equal(settled, true);
  assert.equal(await recovery, false);
  gate.resolve(json(200, { token: OLD })); await tick();
  assert.equal(auth.token, A);
  assert.equal(JSON.parse(storage.get(CONSOLE_SESSION_KEY)).token, A);
  assert.equal(await auth.recover(A), false);
  assert.equal(calls.length, 1, 'disposed credentials cannot begin another bootstrap');
});

for (const status of [403, 404, 405]) {
  test(`a canceled bootstrap's late HTTP ${status} cannot disable a manually adopted connection`, async t => {
    const gate = deferred();
    const { auth, storage } = await explicitAuth(t, () => gate.promise);
    const recovery = auth.recover(A);
    auth.adopt(B); auth.adopt(A);
    assert.equal(await recovery, false);
    assert.equal(auth.automatic, true);
    gate.resolve(json(status, {})); await tick();
    assert.equal(auth.token, A);
    assert.equal(auth.automatic, true, 'support status belongs to the current credential generation');
    assert.equal(JSON.parse(storage.get(CONSOLE_SESSION_KEY)).token, A);
  });

  test(`a canceled late HTTP 200 cannot revive support rejected by a newer HTTP ${status}, and fresh recovery still works`, async t => {
    const gate = deferred(), calls = [];
    const { auth, storage } = await explicitAuth(t, (_url, init) => {
      calls.push(init);
      if (calls.length === 1) return gate.promise;
      return Promise.resolve(calls.length === 2 ? json(status, {}) : json(200, { token: B }));
    });
    const oldRecovery = auth.recover(A); auth.adopt(A);
    assert.equal(await oldRecovery, false);
    assert.equal(await auth.recover(A), false);
    assert.equal(auth.automatic, false, 'the current unsupported response remains authoritative');
    gate.resolve(json(200, { token: OLD })); await tick();
    assert.equal(auth.token, A); assert.equal(auth.automatic, false);
    assert.equal(JSON.parse(storage.get(CONSOLE_SESSION_KEY)).token, A);
    assert.equal(await auth.recover(A), true);
    assert.equal(auth.token, B); assert.equal(auth.automatic, true);
    assert.equal(calls.length, 3);
  });
}

test('an explicit unverified credential and non-shell origins never bootstrap a replacement', async t => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(200, { token: B }); };
  const explicit = browserWindow(fetchImpl);
  const auth = await createConsoleAuth(explicit.win); t.after(() => auth.dispose());
  assert.equal(auth.automatic, false);
  assert.equal(await auth.recover(A), false);
  assert.equal(calls, 0);
  for (const options of [{ explicit: false, topLevel: false }, { explicit: false, pathname: '/panels/settings/index.html' }, { explicit: false, base: 'https://external.invalid' }]) {
    const fixture = browserWindow(fetchImpl, options);
    const rejected = await createConsoleAuth(fixture.win); rejected.dispose();
    assert.equal(rejected.token, '');
  }
  assert.equal(calls, 0);
});

test('candidate API clients reject host 401 without any recovery or replay', async t => {
  const calls = [];
  globalBrowser(t, async (url, init) => { calls.push({ url, init }); return denied(); });
  const candidate = new ApiClient({ token: 'synthetic-candidate-183' });
  await assert.rejects(candidate.post('/api/config', { probe: 183 }), error => error.status === 401 && error.credentialCurrent === true);
  assert.equal(calls.length, 1);
  assert.equal(urlPath(calls[0].url), '/api/config');
  assert.equal(calls[0].init.method, 'POST');
});

test('a business 401 never replays a POST even on an opted-in shared client', async t => {
  let requests = 0, recoveries = 0;
  globalBrowser(t, async () => { requests++; return json(401, { error: 'synthetic business authorization refused', code: 'BUSINESS_DENIED' }); });
  const api = new ApiClient({ token: A, recoverAuth: async () => { recoveries++; return true; } });
  await assert.rejects(api.post('/api/business-write', { irreversible: 'synthetic-only' }), error => error.status === 401 && error.data.code === 'BUSINESS_DENIED');
  assert.equal(requests, 1);
  assert.equal(recoveries, 0);
});

test('an opted-in client retries a host rejection once with the recovered credential and original body', async t => {
  const requests = [], notices = [];
  globalBrowser(t, async (url, init) => { requests.push({ url, init }); return requests.length === 1 ? denied() : json(200, { ok: true }); });
  const api = new ApiClient({ token: A, recoverAuth: async notice => { notices.push(notice); api.setToken(B); return true; } });
  assert.deepEqual(await api.post('/api/config', { marker: 'synthetic-183' }), { ok: true });
  assert.deepEqual(notices, [{ token: A, version: 0 }]);
  assert.deepEqual(requests.map(request => request.init.headers['x-console-token']), [A, B]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].init.body, requests[1].init.body);
});

test('a second host 401 remains a failure and cannot start a third request', async t => {
  let requests = 0, recoveries = 0;
  globalBrowser(t, async () => { requests++; return denied(); });
  const api = new ApiClient({ token: A, recoverAuth: async () => { recoveries++; api.setToken(B); return true; } });
  await assert.rejects(api.post('/api/config', {}), error => error.status === 401);
  assert.equal(requests, 2);
  assert.equal(recoveries, 1);
});

test('a delayed A-generation 401 cannot recover or invalidate a newer A-B-A generation', async t => {
  const gate = deferred(), requests = [];
  let recoveries = 0;
  globalBrowser(t, (url, init) => { requests.push({ url, init }); return requests.length === 1 ? gate.promise : Promise.resolve(json(200, { current: true })); });
  const api = new ApiClient({ token: A, recoverAuth: async () => { recoveries++; return false; } });
  const request = api.get('/api/config');
  api.setToken(B); api.setToken(A);
  assert.equal(api.authVersion, 2);
  gate.resolve(denied());
  assert.deepEqual(await request, { current: true });
  assert.equal(recoveries, 0, 'a stale 401 does not bootstrap over a newer manual generation');
  assert.equal(requests.length, 2);
  assert.equal(api.token, A);
});

test('manual generation changes during recovery win even when that recovery returns false', async t => {
  const gate = deferred(), entered = deferred();
  let requests = 0;
  globalBrowser(t, async () => ++requests === 1 ? denied() : json(200, { newer: true }));
  const api = new ApiClient({ token: A, recoverAuth: async () => { entered.resolve(); return gate.promise; } });
  const request = api.get('/api/config'); await entered.promise;
  api.setToken(B); api.setToken(A);
  gate.resolve(false);
  assert.deepEqual(await request, { newer: true });
  assert.equal(requests, 2);
});

test('the final rejected request reports credentialCurrent from its current generation', async t => {
  const gate = deferred(), second = deferred();
  let requests = 0;
  globalBrowser(t, () => ++requests === 1 ? Promise.resolve(denied()) : second.promise);
  const api = new ApiClient({ token: A, recoverAuth: async () => gate.promise });
  const result = api.get('/api/config');
  const rejected = assert.rejects(result, error => error.status === 401 && error.credentialCurrent === false);
  await tick(); api.setToken(B); gate.resolve(true); await tick();
  api.setToken(A); second.resolve(denied());
  await rejected;
  assert.equal(requests, 2);
});

test('cancellation while recovery is pending cannot replay the original POST', async t => {
  const gate = deferred(), entered = deferred(), controller = new AbortController();
  let requests = 0;
  globalBrowser(t, async () => { requests++; return denied(); });
  const api = new ApiClient({ token: A, recoverAuth: async () => { entered.resolve(); return gate.promise; } });
  const result = api.request('POST', '/api/config', { marker: 183 }, {}, { signal: controller.signal });
  const rejected = assert.rejects(result, error => error.name === 'AbortError');
  await entered.promise;
  controller.abort(new DOMException('synthetic caller cancelled', 'AbortError'));
  api.setToken(B); gate.resolve(true);
  await rejected;
  assert.equal(requests, 1);
});

test('a pre-cancelled request does not issue even its initial fetch', async t => {
  let requests = 0;
  globalBrowser(t, async () => { requests++; return json(200, { unexpected: true }); });
  const controller = new AbortController(); controller.abort(new DOMException('synthetic already cancelled', 'AbortError'));
  const api = new ApiClient({ token: A });
  await assert.rejects(api.request('POST', '/api/config', {}, {}, { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(requests, 0);
});

test('a request timeout during recovery cannot issue a replacement request', async t => {
  const gate = deferred(), entered = deferred();
  let requests = 0, requestSignal;
  globalBrowser(t, async (_url, init) => { requests++; requestSignal = init.signal; return denied(); });
  const api = new ApiClient({ token: A, recoverAuth: async () => { entered.resolve(); return gate.promise; } });
  const result = api.request('POST', '/api/config', {}, {}, { timeout: 10 });
  const rejected = assert.rejects(result, error => error.name === 'TimeoutError');
  await entered.promise; await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(requestSignal.aborted, true);
  api.setToken(B); gate.resolve(true);
  await rejected;
  assert.equal(requests, 1);
});

test('SSE candidates and business 401 responses never opt themselves into credential recovery', async t => {
  const calls = [], states = [];
  let recoveries = 0;
  globalBrowser(t, async (url, init) => { calls.push({ url, init }); return calls.length === 1 ? denied() : json(401, { error: 'synthetic business refusal' }); });
  const candidate = new SseClient({ token: A, retryDelay: 60_000, onState: (...args) => states.push(args) });
  t.after(() => candidate.close()); candidate.closed = false; await candidate.open(); candidate.close();
  const business = new SseClient({ token: A, retryDelay: 60_000, recoverAuth: async () => { recoveries++; return true; } });
  t.after(() => business.close()); business.closed = false; await business.open(); business.close();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === '/api/events'));
  assert.equal(recoveries, 0);
  assert.equal(states.at(-1)[0], 'reconnecting');
  assert.equal(states.at(-1)[1].status, 401);
});

test('an opted-in SSE client recovers explicitly and opens its stream with the new token', async t => {
  const streamEnd = deferred(), connected = deferred(), requests = [], notices = [];
  let client;
  globalBrowser(t, async (_url, init) => {
    requests.push(init.headers['x-console-token']);
    if (requests.length === 1) return denied();
    init.signal.addEventListener('abort', () => streamEnd.resolve({ done: true }), { once: true });
    return { ok: true, status: 200, body: { getReader: () => ({ read: () => streamEnd.promise }) } };
  });
  client = new SseClient({ token: A, retryDelay: 60_000,
    recoverAuth: async notice => { notices.push(notice); client.token = B; return true; },
    onState: state => { if (state === 'connected') connected.resolve(); },
  });
  t.after(() => { client.close(); streamEnd.resolve({ done: true }); });
  client.closed = false; await client.open(); await connected.promise;
  assert.deepEqual(notices, [{ token: A }]);
  assert.deepEqual(requests, [A, B]);
  client.close(); streamEnd.resolve({ done: true }); await tick();
});

test('closing SSE during a pending recovery prevents an obsolete response from reconnecting', async t => {
  const gate = deferred(), entered = deferred(), states = [];
  let requests = 0;
  globalBrowser(t, async () => { requests++; return denied(); });
  const client = new SseClient({ token: A, retryDelay: 60_000,
    recoverAuth: async () => { entered.resolve(); await gate.promise; client.token = B; return true; },
    onState: state => states.push(state),
  });
  t.after(() => client.close());
  client.closed = false; const opening = client.open(); await entered.promise;
  client.close(); gate.resolve(); await opening; await tick();
  assert.equal(requests, 1);
  assert.equal(client.closed, true);
  assert.equal(client.retryTimer, null);
  assert.equal(states.includes('connected'), false);
});
