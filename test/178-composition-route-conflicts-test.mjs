// All requests use a private, ephemeral loopback server and synthetic state.
// This suite never starts an agent, transport, plugin or the user's console.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getEventListeners } from 'node:events';
import { createHttpServer, MAX_BODY_BYTES } from '../src/kernel/http.js';
import { createCompositionLifecycle } from '../src/kernel/composition-lifecycle.js';
import { registerComposedConsoleRoutes } from '../src/console/routes.js';

function fixture(t, { apiGuard } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa178-routes-'));
  const staticDir = path.join(root, 'ui');
  fs.mkdirSync(staticDir);
  fs.writeFileSync(path.join(staticDir, 'index.html'), 'synthetic 178');
  const lifecycle = createCompositionLifecycle();
  const state = { server: { port: 0, token: 'synthetic-178-token' } };
  const config = { get: () => state };
  const http = createHttpServer({ config, staticDir, apiGuard, log: { info() {}, warn() {}, error() {} } });
  const deps = { config, lifecycle, marker: {}, dataDir: root };
  const disposers = [];
  t.after(async () => {
    await Promise.allSettled(disposers.map(dispose => dispose()));
    await lifecycle.close().catch(() => {});
    await http.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = (pathname, { authorized = true, headers = {}, ...options } = {}) => fetch(`http://127.0.0.1:${http.port}${pathname}`, {
    ...options, headers: { ...(authorized ? { 'x-console-token': state.server.token } : {}), ...headers },
  });
  async function mount(routes, options = {}) {
    const dispose = await registerComposedConsoleRoutes(http, deps, { registerDefault: null, routes, ...options });
    disposers.push(dispose);
    return dispose;
  }
  return { http, deps, lifecycle, mount, request };
}

async function assertOwner(request, pathname, owner, options) {
  const response = await request(pathname, options);
  assert.equal(response.status, owner == null ? 404 : 200, pathname);
  if (owner != null) assert.equal((await response.json()).owner, owner, pathname);
}

function permutations(values) {
  return values.length === 0 ? [[]] : values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(tail => [value, ...tail]));
}

test('two modules replace only their route intersection and keep independent methods and endpoints', async t => {
  const { http, mount, request } = fixture(t);
  const a = await mount([{ id: 'A', register(scope) {
    scope.route('GET', '/api/shared', () => ({ owner: 'A' }));
    scope.route('POST', '/api/shared', () => ({ owner: 'A-post' }));
    scope.route('GET', '/api/a', () => ({ owner: 'A-only' }));
  } }]);
  const b = await mount([{ id: 'B', register(scope) {
    scope.route('GET', '/api/shared', () => ({ owner: 'B' }), { replace: true });
    scope.route('GET', '/api/b', () => ({ owner: 'B-only' }));
  } }]);
  await http.listen();
  await assertOwner(request, '/api/shared', 'B');
  await assertOwner(request, '/api/shared', 'A-post', { method: 'POST', body: '{}' });
  await assertOwner(request, '/api/a', 'A-only');
  await assertOwner(request, '/api/b', 'B-only');
  await b();
  await assertOwner(request, '/api/shared', 'A');
  await assertOwner(request, '/api/a', 'A-only');
  await assertOwner(request, '/api/b', null);
  await a();
});

test('three-layer ownership survives every removal order, including disposal below an active replacement', async t => {
  for (const order of permutations(['A', 'B', 'C'])) await t.test(order.join(' then '), async t => {
    const { http, mount, request, deps } = fixture(t);
    http.route('GET', '/api/shared', () => ({ owner: 'host' }));
    const layers = {}, active = new Set(['A', 'B', 'C']), resources = new Set(), cleaned = [];
    for (const owner of ['A', 'B', 'C']) layers[owner] = await mount([{ id: owner, register(scope, context) {
      assert.equal(context.marker, deps.marker);
      resources.add(owner);
      context.lifecycle.onStop(() => { assert.ok(resources.delete(owner)); cleaned.push(owner); });
      scope.route('GET', '/api/shared', () => ({ owner }), { replace: true });
      scope.route('GET', `/api/independent-${owner}`, () => ({ owner }));
    } }]);
    await http.listen();
    await assertOwner(request, '/api/shared', 'C');
    for (const owner of order) {
      await layers[owner](); await layers[owner](); active.delete(owner);
      await assertOwner(request, '/api/shared', ['C', 'B', 'A'].find(name => active.has(name)) ?? 'host');
      for (const name of ['A', 'B', 'C']) await assertOwner(request, `/api/independent-${name}`, active.has(name) ? name : null);
      assert.deepEqual([...resources].sort(), [...active].sort(), 'disposing one registrar releases only its lifecycle resources');
    }
    assert.deepEqual(cleaned, order);
  });
});

test('the most recent explicit replacement wins across wildcard methods, exact strings and stateful regexes', async t => {
  const { http, mount, request } = fixture(t);
  http.route('*', /^\/api\/items\/(?<id>\d+)$/, ({ req, params }) => ({ owner: `host-${req.method}-${params.id}` }));
  const a = await mount([{ id: 'A-regex', register(scope) {
    scope.route('*', /^\/api\/items\/(?<id>\d+)$/g, ({ req, params }) => ({ owner: `A-${req.method}-${params.id}` }), { replace: true });
  } }]);
  const b = await mount([{ id: 'B-exact', register(scope) {
    scope.route('GET', '/api/items/178', () => ({ owner: 'B' }), { replace: true });
  } }]);
  const c = await mount([{ id: 'C-method', register(scope) {
    scope.route('POST', /^\/api\/items\/(?<id>178)$/y, ({ params }) => ({ owner: `C-${params.id}` }), { replace: true });
  } }]);
  await http.listen();
  for (let attempt = 0; attempt < 2; attempt++) {
    await assertOwner(request, '/api/items/178', 'B');
    await assertOwner(request, '/api/items/178', 'C-178', { method: 'POST', body: '{}' });
    await assertOwner(request, '/api/items/179', 'A-GET-179');
    await assertOwner(request, '/api/items/179', 'A-POST-179', { method: 'POST', body: '{}' });
  }
  await b();
  await assertOwner(request, '/api/items/178', 'A-GET-178');
  await assertOwner(request, '/api/items/178', 'C-178', { method: 'POST', body: '{}' });
  await a();
  await assertOwner(request, '/api/items/179', 'host-GET-179');
  await assertOwner(request, '/api/items/178', 'C-178', { method: 'POST', body: '{}' });
  await c();
  await assertOwner(request, '/api/items/178', 'host-POST-178', { method: 'POST', body: '{}' });
});

test('a late third-registrar failure rolls back every owned route and lifecycle resource, retaining other route groups', async t => {
  const { http, mount, request, deps } = fixture(t);
  const calls = [], resources = new Set(), signals = [];
  http.route('GET', '/api/shared', () => ({ owner: 'host' }));
  const existing = await mount([{ id: 'existing', register(scope, context) {
    context.lifecycle.onStop(() => calls.push('existing'));
    scope.route('GET', '/api/existing', () => ({ owner: 'existing' }));
  } }]);
  await assert.rejects(registerComposedConsoleRoutes(http, deps, { registerDefault: null, routes: ['A', 'B', 'C'].map(owner => ({ id: owner, async register(scope, context) {
    resources.add(owner); signals.push(context.lifecycle.signal);
    context.lifecycle.onStop(() => { resources.delete(owner); calls.push(`${owner} lifecycle`); });
    scope.onDispose(() => calls.push(`${owner} onDispose`));
    scope.route('GET', '/api/shared', () => ({ owner }), { replace: true });
    scope.route('GET', `/api/partial-${owner}`, () => ({ owner }));
    await Promise.resolve();
    if (owner === 'C') throw new Error('synthetic late setup failure');
    return () => calls.push(`${owner} returned`);
  } })) }), /synthetic late setup failure/);
  assert.deepEqual([...resources], []);
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(deps.lifecycle.signal.aborted, false);
  assert.deepEqual(calls, ['C onDispose', 'C lifecycle', 'B returned', 'B onDispose', 'B lifecycle', 'A returned', 'A onDispose', 'A lifecycle']);
  await http.listen();
  await assertOwner(request, '/api/shared', 'host');
  await assertOwner(request, '/api/existing', 'existing');
  for (const owner of ['A', 'B', 'C']) await assertOwner(request, `/api/partial-${owner}`, null);
  await existing();
  assert.equal(calls.at(-1), 'existing');
});

test('quiesce and final disposal share cleanup, aggregate failures, and retain default diagnostics until final disposal', async t => {
  const { http, mount, request } = fixture(t);
  const calls = [], scopes = [], children = [], signals = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const lifecycleFailure = new Error('synthetic lifecycle failure'), returnedFailure = new Error('synthetic returned failure');
  const dispose = await mount(['A', 'B', 'C'].map(owner => ({ id: owner, register(scope, context) {
    scopes.push(scope); children.push(context.lifecycle); signals.push(context.lifecycle.signal);
    scope.route('GET', '/api/shared', () => ({ owner }), { replace: true });
    scope.route('GET', `/api/own-${owner}`, () => ({ owner }));
    context.lifecycle.onStop(() => { calls.push(`${owner} lifecycle`); if (owner === 'B') throw lifecycleFailure; });
    scope.onDispose(() => calls.push(`${owner} onDispose`));
    return async () => { calls.push(`${owner} returned`); if (owner === 'C') { await gate; throw returnedFailure; } };
  } })), { registerDefault(scope, context) {
    scope.route('GET', '/api/shared', () => ({ owner: 'default' }));
    scope.route('GET', '/api/diagnostics', () => ({ owner: 'diagnostics' }));
    context.lifecycle.onStop(() => calls.push('default lifecycle'));
  } });
  await http.listen();
  const quiescing = dispose.quiesce();
  const quiescenceResult = quiescing.then(() => null, error => error);
  assert.equal(dispose.quiesce(), quiescing);
  assert.ok(signals.every(signal => signal.aborted));
  for (const scope of scopes) {
    assert.throws(() => scope.route('GET', '/api/late', () => ({})), /disposed/);
    assert.throws(() => scope.onDispose(() => {}), /disposed/);
  }
  for (const child of children) assert.throws(() => child.onStop(() => {}), /已停止/);
  await assertOwner(request, '/api/shared', 'default');
  await assertOwner(request, '/api/diagnostics', 'diagnostics');
  for (const owner of ['A', 'B', 'C']) await assertOwner(request, `/api/own-${owner}`, null);
  const disposing = dispose();
  const disposalResult = disposing.then(() => null, error => error);
  assert.equal(dispose(), disposing);
  release();
  const errors = await Promise.all([quiescenceResult, disposalResult]);
  assert.ok(errors.every(error => error instanceof AggregateError));
  const flattened = error => error instanceof AggregateError ? error.errors.flatMap(flattened) : [error];
  for (const error of errors) assert.deepEqual(flattened(error), [returnedFailure, lifecycleFailure]);
  assert.deepEqual(calls, ['C returned', 'C onDispose', 'C lifecycle', 'B returned', 'B onDispose', 'B lifecycle', 'A returned', 'A onDispose', 'A lifecycle', 'default lifecycle']);
  await assertOwner(request, '/api/diagnostics', null);
});

test('parent cancellation reaches an awaited child registrar and its late returned resource is cleaned exactly once', async t => {
  const { http, deps, lifecycle, request } = fixture(t);
  const calls = [];
  let child, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const registration = registerComposedConsoleRoutes(http, deps, { registerDefault: null, routes: [{ id: 'awaited', async register(scope, context) {
    child = context.lifecycle;
    child.onStop(() => calls.push('lifecycle'));
    scope.onDispose(() => calls.push('onDispose'));
    scope.route('GET', '/api/pending', () => ({ owner: 'pending' }));
    entered();
    await new Promise(resolve => child.signal.addEventListener('abort', resolve, { once: true }));
    return () => calls.push('returned');
  } }] });
  await ready;
  assert.notEqual(child, lifecycle);
  lifecycle.cancel(new Error('synthetic parent cancellation'));
  await assert.rejects(registration, /synthetic parent cancellation/);
  assert.ok(child.signal.aborted);
  assert.deepEqual(calls, ['returned', 'onDispose', 'lifecycle']);
  await lifecycle.close();
  assert.deepEqual(calls, ['returned', 'onDispose', 'lifecycle']);
  await http.listen();
  await assertOwner(request, '/api/pending', null);
});

test('closing the parent releases mounted contribution resources without repeating an already disposed sibling', async t => {
  const { http, mount, lifecycle, request } = fixture(t);
  const calls = [];
  const add = owner => mount([{ id: owner, register(scope, context) {
    scope.route('GET', `/api/parent-${owner}`, () => ({ owner }));
    context.lifecycle.onStop(() => calls.push(owner));
  } }]);
  const a = await add('A'); await add('B'); await add('C');
  await http.listen();
  await a();
  await lifecycle.close(); await lifecycle.close();
  assert.deepEqual(calls, ['A', 'C', 'B']);
  for (const owner of ['A', 'B', 'C']) await assertOwner(request, `/api/parent-${owner}`, null);
});

test('parent shutdown quiesces contributions while default diagnostics and their resources survive until final disposal', async t => {
  const { http, mount, lifecycle, request } = fixture(t);
  const calls = [];
  let defaultSignal;
  const dispose = await mount([{ id: 'app', register(scope, context) {
    scope.route('GET', '/api/diagnostics', () => ({ owner: 'app' }), { replace: true });
    context.lifecycle.onStop(() => calls.push('app'));
  } }], { registerDefault(scope, context) {
    defaultSignal = context.lifecycle.signal;
    scope.route('GET', '/api/diagnostics', () => ({ owner: 'default' }));
    context.lifecycle.onStop(() => calls.push('default'));
  } });
  await http.listen();
  await lifecycle.close();
  assert.ok(defaultSignal.aborted);
  assert.deepEqual(calls, ['app']);
  await assertOwner(request, '/api/diagnostics', 'default');
  await dispose();
  assert.deepEqual(calls, ['app', 'default']);
  await assertOwner(request, '/api/diagnostics', null);
});

test('route-group disposal removes parent hooks and abort listeners, including registration rollback', async t => {
  const { deps, lifecycle, mount } = fixture(t);
  const hooks = new Set();
  deps.lifecycle = {
    signal: lifecycle.signal,
    onStop(cleanup) {
      hooks.add(cleanup);
      const unregister = lifecycle.onStop(cleanup);
      return () => { hooks.delete(cleanup); unregister(); };
    },
  };
  assert.equal(getEventListeners(lifecycle.signal, 'abort').length, 0);
  const dispose = await mount([{ id: 'owned', register(scope) { scope.route('GET', '/api/owned', () => ({})); } }]);
  assert.equal(hooks.size, 1);
  assert.equal(getEventListeners(lifecycle.signal, 'abort').length, 1);
  await dispose();
  assert.equal(hooks.size, 0);
  assert.equal(getEventListeners(lifecycle.signal, 'abort').length, 0);
  const empty = await mount([]);
  assert.equal(hooks.size, 0);
  assert.equal(getEventListeners(lifecycle.signal, 'abort').length, 0);
  await empty();
  await assert.rejects(mount([{ id: 'broken', register() { throw new Error('synthetic retention failure'); } }]), /synthetic retention failure/);
  assert.equal(hooks.size, 0);
  assert.equal(getEventListeners(lifecycle.signal, 'abort').length, 0);
});

test('abort listeners may reenter final disposal without publishing duplicate cleanup work', async t => {
  const { mount } = fixture(t);
  const calls = [];
  let dispose, reentered;
  dispose = await mount([{ id: 'reentrant', register(scope, context) {
    scope.route('GET', '/api/reentrant', () => ({}));
    context.lifecycle.signal.addEventListener('abort', () => { calls.push('abort'); reentered = dispose(); }, { once: true });
    context.lifecycle.onStop(() => calls.push('lifecycle'));
    return () => calls.push('returned');
  } }]);
  const closing = dispose();
  assert.equal(reentered, closing);
  await closing;
  assert.deepEqual(calls, ['abort', 'returned', 'lifecycle']);
});

test('the third replacement still passes host authentication, Origin, JSON, body-size and both reset guards', async t => {
  let guardCalls = 0, mode = 'allow', handled = 0;
  const { http, mount, request } = fixture(t, { apiGuard() {
    guardCalls++;
    return mode === 'block' || (mode === 'after-body' && guardCalls > 1) ? { status: 409, body: { error: 'synthetic reset' } } : null;
  } });
  http.route('POST', '/api/guarded', () => ({ owner: 'host' }));
  for (const owner of ['A', 'B', 'C']) await mount([{ id: owner, register(scope) {
    scope.route('POST', '/api/guarded', ({ body }) => { handled++; return { owner, body }; }, { replace: true });
  } }]);
  await http.listen();
  const post = (body = '{}', options = {}) => request('/api/guarded', { method: 'POST', body, ...options });
  assert.equal((await post('{}', { authorized: false })).status, 401);
  assert.equal((await post('{}', { headers: { origin: 'https://outside.invalid' } })).status, 403);
  assert.equal((await post('invalid json')).status, 400);
  assert.equal((await post(JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES) }))).status, 413);
  assert.equal(handled, 0);
  mode = 'block'; guardCalls = 0;
  assert.equal((await post()).status, 409); assert.equal(guardCalls, 1);
  mode = 'after-body'; guardCalls = 0;
  assert.equal((await post()).status, 409); assert.equal(guardCalls, 2);
  assert.equal(handled, 0);
  mode = 'allow';
  assert.deepEqual(await (await post('{"test":178}')).json(), { owner: 'C', body: { test: 178 } });
});
