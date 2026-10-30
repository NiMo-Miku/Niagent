import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../src/kernel/composition.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createServiceHost } from '../src/kernel/service-host.js';
import { createResetGuards } from '../src/kernel/reset-guards.js';
import { wrapMethods } from '../src/kernel/composition-methods.js';
import { Bus } from '../src/kernel/bus.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const tick = () => new Promise(setImmediate);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-lifecycle291-'));
  fs.mkdirSync(path.join(root, 'bundled'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('qqa-lifecycle291-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function options(root, components = {}) {
  return {
    appRoot: root,
    env: { QQ_AGENT_DATA_DIR: path.join(root, 'data'), QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(root, 'missing') },
    components: {
      'runtime.logger': args => defaultComponents['runtime.logger']({ ...args, mirrorConsole: false }),
      'runtime.priceUpdates': () => ({ resolve: () => null, refresh: async () => ({ ok: true, remote: false }) }),
      'runtime.http': args => ({ ...defaultComponents['runtime.http'](args), listen: async () => 49291 }),
      'llm.complete': () => assert.fail('291 must not call a model'),
      ...components,
    },
    fetchImpl: () => assert.fail('291 must not contact an external service'),
  };
}
async function application(t, components = {}) {
  const root = temporaryRoot(t), calls = { sends: 0 }, callbacks = new Map();
  const provider = (id, selfId) => ({
    id, selfId, actions: {}, bind(value) { callbacks.set(id, value); }, start() {}, stop() {},
    send() { calls.sends++; return [{ msgId: 29100 + calls.sends }]; },
    toPlatformSegments: value => value,
  });
  const app = await createApplication({ ...options(root, components), transport: provider('old291', '900') });
  t.after(() => app.stop());
  app.config.update({ allowAllWhenEmpty: true, telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false } });
  app.orchestrator.pause();
  await app.start();
  async function replace() {
    const next = provider('new291', '901');
    app.capability.register('transport.provider', 'kernel', {
      create(context) { next.bind(context); return next; },
    }, { lifecycle: true });
    await app.services.idle();
    assert.equal(app.transport.id, 'new291');
    return callbacks.get('new291');
  }
  return { app, calls, callbacks: callbacks.get('old291'), replace, root };
}
function message(mid, text = 'synthetic message') {
  return { kind: 'private', id: '123', type: 'message', event: {
    message_id: mid, user_id: '123', sender: { nickname: 'Synthetic' },
    message: [{ type: 'text', data: { text } }],
  } };
}

for (const kind of ['message', 'poke']) {
  test(`291 ${kind}: provider replacement during policy lookup discards old input and accepts new input`, async t => {
    const f = await application(t), gate = deferred(), entered = deferred();
    t.after(() => gate.resolve());
    f.app.capability.register('community.client', 'kernel', {
      async getBlocklist() { entered.resolve(); await gate.promise; return { ok: true, ids: [] }; },
    });
    const event = kind === 'message' ? message(29101) : { kind: 'private', id: '123', type: 'poke', event: { user_id: '123', target_id: '900' } };
    const pending = f.callbacks.onEvent(event);
    await entered.promise;
    const next = await f.replace();
    gate.resolve(); await pending;
    assert.equal(f.app.store.recent('private:123', 100).length, 0);
    await next.onEvent(message(29102));
    assert.ok(f.app.store.findByMid('private:123', 29102));
    assert.equal(f.calls.sends, 0);
  });
}

test('291 provider replacement cancels delayed automatic media without sending from the new provider', async t => {
  const settled = deferred();
  const f = await application(t, { 'core.media.forward': async (...args) => {
    try { return await defaultComponents['core.media.forward'](...args); } finally { settled.resolve(); }
  } });
  const entered = deferred(), gate = deferred(); t.after(() => gate.resolve());
  f.app.capability.register('media.download', 'kernel', async () => { entered.resolve(); await gate.promise; return [{ type: 'text', text: 'stale media' }]; });
  await f.callbacks.onEvent(message(29103, 'https://b23.tv/synthetic291'));
  await entered.promise;
  await f.replace(); gate.resolve(); await settled.promise;
  assert.equal(f.calls.sends, 0);
});

test('291 constructor failure closes acquired default subscriptions and resources once', async t => {
  const root = temporaryRoot(t), bus = new Bus(quiet), closed = new Map();
  const components = { 'runtime.bus': () => bus, 'console.panels': () => { throw new Error('synthetic constructor failure'); } };
  for (const [key, method] of [['runtime.services', 'stop'], ['runtime.scheduler', 'stop'], ['runtime.http', 'close'], ['console.sse', 'close']]) {
    components[key] = args => wrapMethods(defaultComponents[key](args), {
      [method](next, ...values) { closed.set(key, (closed.get(key) ?? 0) + 1); return next(...values); },
    });
  }
  await assert.rejects(createApplication(options(root, components)), /synthetic constructor failure/);
  for (const key of ['runtime.services', 'runtime.scheduler', 'runtime.http', 'console.sse']) assert.equal(closed.get(key), 1, key);
  for (const name of ['log', 'plugin.loaded', 'plugin.unloaded', 'plugin.error', 'permission.decision']) assert.equal(bus.listenerCount(name), 0, name);
});

test('291 service host releases all subscriptions after stop and resubscribes once on restart', async () => {
  const bus = new Bus(quiet), configListeners = new Set(), capabilityListeners = new Set();
  const base = createCapabilityRegistry({ log: quiet });
  const capability = { ...base, onChange(fn) { capabilityListeners.add(fn); const off = base.onChange(fn); return () => { capabilityListeners.delete(fn); off(); }; } };
  const config = { onChange(fn) { configListeners.add(fn); return () => configListeners.delete(fn); } };
  const assertSubscriptions = count => {
    assert.equal(configListeners.size, count); assert.equal(capabilityListeners.size, count);
    for (const name of ['plugin.loaded', 'plugin.unloaded', 'plugin.error', 'permission.decision']) assert.equal(bus.listenerCount(name), count, name);
  };
  for (let generation = 0; generation < 3; generation++) {
    const host = createServiceHost({ capability, config, bus, log: quiet });
    await host.start(); assertSubscriptions(1);
    await Promise.all([host.stop(), host.stop()]); assertSubscriptions(0);
    await host.start(); assertSubscriptions(1);
    await host.stop(); assertSubscriptions(0);
  }
});

test('291 capability registry releases its selected-provider configuration observer', () => {
  const listeners = new Set();
  const registry = createCapabilityRegistry({ log: quiet, subscribeSelection(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
  assert.equal(listeners.size, 1); registry.close(); registry.close(); assert.equal(listeners.size, 0);
});

test('291 frozen implementations remain unchanged and reset still fences retained host facades', async t => {
  const root = temporaryRoot(t), raw = new Map(), originals = new Map(), closes = new Map();
  let context;
  const components = { 'console.routes': (http, deps) => { context = deps; return defaultComponents['console.routes'](http, deps); } };
  for (const key of ['runtime.config', 'runtime.storage', 'data.messages', 'data.memory', 'data.sessions', 'data.reminders', 'data.stickers', 'core.orchestrator']) {
    components[key] = args => {
      let target = defaultComponents[key](args);
      if (key === 'runtime.storage') {
        const original = target;
        target = { ...original, namespace(...values) { return Object.freeze(original.namespace(...values)); } };
      }
      raw.set(key, Object.freeze(target)); originals.set(key, Object.getOwnPropertyDescriptors(target)); return target;
    };
  }
  for (const [key, method] of [['runtime.http', 'close'], ['console.sse', 'close']]) components[key] = args => {
    const target = defaultComponents[key](args);
    if (key === 'runtime.http') target.listen = async () => 49291;
    return wrapMethods(target, { [method](next, ...values) { closes.set(key, (closes.get(key) ?? 0) + 1); return next(...values); } });
  };
  const app = await createApplication(options(root, components)); t.after(() => app.stop());
  const namespace = app.storage.namespace('synthetic291'); namespace.set('value', 'retained');
  const store = app.store, config = app.config, sessions = app.sessions;
  store.appendIncoming('private:123', { mid: 29104, text: 'before reset' });
  assert.ok(store.findByMid('private:123', 29104));
  const result = await context.resetData(); assert.equal(result.ok, true);
  assert.throws(() => store.appendIncoming('private:123', { text: 'late' }), /业务已封闭/);
  assert.throws(() => namespace.set('value', 'late'), /业务已封闭/);
  assert.throws(() => config.update({ paused: false }), /已提交重置/);
  assert.equal(sessions.update('absent', {}), undefined);
  assert.equal(closes.get('runtime.http') ?? 0, 0, 'reset preserves the response transport');
  assert.equal(closes.get('console.sse') ?? 0, 0, 'reset preserves diagnostics until final stop');
  for (const [key, target] of raw) {
    assert.ok(Object.isFrozen(target)); assert.deepEqual(Object.getOwnPropertyDescriptors(target), originals.get(key), key);
  }
  await app.stop(); await app.stop();
  assert.equal(closes.get('runtime.http'), 1); assert.equal(closes.get('console.sse'), 1);
});

test('291 guards preserve private-field receivers on a frozen service', () => {
  class Store { #values = []; append(value) { this.#values.push(value); } get values() { return [...this.#values]; } }
  const raw = Object.freeze(new Store()); let sealed = false;
  const guards = createResetGuards({ isSealed: () => sealed, canConfigure: () => !sealed });
  const host = guards.methods(raw, ['append']); host.append('one'); assert.deepEqual(host.values, ['one']);
  sealed = true; assert.throws(() => host.append('late'), /业务已封闭/); assert.deepEqual(raw.values, ['one']);
});
