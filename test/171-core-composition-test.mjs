import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise(setImmediate);
const toolCall = (name, args) => ({ id: `fixture-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const reply = (calls = []) => ({
  message: { role: 'assistant', content: calls.length ? '' : 'finished', ...(calls.length ? { tool_calls: calls } : {}) },
  usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
});

async function fixture(t, { components = {}, composition = null } = {}) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-core-composition-'));
  fs.mkdirSync(path.join(appRoot, 'bundled'), { recursive: true });
  fs.cpSync(path.join(workspace, 'bundled', 'core-tools'), path.join(appRoot, 'bundled', 'core-tools'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  const calls = { sends: [], network: [], listen: 0, closed: 0, llm: [], starts: 0, stops: 0 };
  let callbacks;
  const transport = {
    id: 'composition-fixture', selfId: '999', segmentSupport: ['text'], everConnected: true, actions: {},
    bind(context) { callbacks = context; },
    start() { calls.starts++; callbacks.onStatus({ connected: true, selfId: '999' }); },
    stop() { calls.stops++; },
    toPlatformSegments: segments => segments,
    send(chatKey, segments) { calls.sends.push({ chatKey, segments }); return { msgId: 9000 + calls.sends.length }; },
  };
  const infrastructure = {
    'runtime.logger': args => defaultComponents['runtime.logger']({ ...args, mirrorConsole: false }),
    'runtime.http': args => {
      const http = defaultComponents['runtime.http'](args);
      http.listen = async () => { calls.listen++; return 48171; };
      const close = http.close;
      http.close = async () => { calls.closed++; await close(); };
      return http;
    },
    'runtime.plugins': args => {
      const loader = defaultComponents['runtime.plugins'](args);
      loader.startWatchers = () => {};
      return loader;
    },
    'runtime.priceUpdates': () => ({ resolve: () => null, refresh: async () => ({ ok: true, remote: false }) }),
    'llm.complete': async args => {
      calls.llm.push(structuredClone(args.messages));
      return calls.llm.length === 1 ? reply([toolCall('send_message', { messages: 'default reply' })]) : reply();
    },
  };
  const kernel = createKernel({
    appRoot, composition,
    env: { QQ_AGENT_DATA_DIR: path.join(appRoot, 'data'), QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-source') },
    transport,
    fetchImpl: async url => { calls.network.push(String(url)); throw new Error('fixture forbids external services'); },
    components: { ...infrastructure, ...components },
  });
  kernel.config.update({
    api: { model: 'composition-fixture', maxRounds: 3 },
    persona: { botName: 'fixture bot', roleText: 'fixture persona' },
    allowAllWhenEmpty: true, telemetry: { enabled: false }, proactive: { enabled: false },
    memory: { consolidateEnabled: false }, send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, dedupeWindowMs: 0 },
    sessionRetryAttempts: 0,
  });
  t.after(async () => {
    await kernel.stop();
    assert.equal(calls.network.length, 0, 'no real QQ, model or remote service is contacted');
    assert.equal(kernel.scheduler.count(), 0);
    assert.equal(fs.existsSync(path.join(kernel.dataDir, 'qq-agent.lock')), false);
    const target = path.resolve(appRoot);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-core-composition-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return {
    kernel, calls, appRoot,
    async boot() { await kernel.start(); await kernel.services.idle(); },
    async incoming(text = 'fixture incoming') {
      callbacks.onEvent({ kind: 'private', id: '123', type: 'message', event: {
        message_id: 171, user_id: '123', sender: { nickname: 'fixture member' },
        message: [{ type: 'text', data: { text } }],
      } });
      for (let attempt = 0; attempt < 100 && !kernel.sessions.current('private:123'); attempt++) await tick();
      const session = kernel.sessions.current('private:123');
      assert.ok(session, 'provider event traverses the real ingest/orchestrator path');
      await kernel.orchestrator.wake('private:123', { waitingSessionId: session.id, verified: true });
      return kernel.sessions.get(session.id);
    },
  };
}

test('default core still ingests, builds prompts, calls tools and sends through the selected LLM boundary', async t => {
  const f = await fixture(t);
  assert.equal(f.kernel.components['core.orchestrator'], defaultComponents['core.orchestrator']);
  assert.equal(f.kernel.components['core.agentRunner'], defaultComponents['core.agentRunner']);
  assert.equal(f.kernel.components['core.prompt.system'], defaultComponents['core.prompt.system']);
  assert.equal(f.kernel.components['core.send'], defaultComponents['core.send']);
  await f.boot();
  const session = await f.incoming();
  assert.equal(session.status, 'done');
  assert.equal(session.rounds, 2);
  assert.equal(session.usage.calls, 2);
  assert.equal(session.usage.totalTokens, 20);
  assert.equal(session.systemPrompt, defaultComponents['core.prompt.system']({ cfg: f.kernel.config.get(), skillSections: [], extraSections: [] }));
  assert.match(session.userPrompt, /fixture incoming/);
  assert.equal(f.calls.sends.length, 1);
  assert.deepEqual(f.calls.sends[0].segments, [{ type: 'text', text: 'default reply' }]);
  assert.ok(session.messages.some(message => message.role === 'tool' && message.toolCall.name === 'send_message'));
});

test('fine-grained replacements are consumed by real provider event, storage, prompts, runner, tools and send', async t => {
  const seen = [];
  const counted = (key, mutate = value => value) => (...args) => {
    seen.push(key);
    return mutate(defaultComponents[key](...args));
  };
  let modelCalls = 0;
  const f = await fixture(t, { components: {
    'runtime.config.defaults': counted('runtime.config.defaults'),
    'runtime.bus': counted('runtime.bus'),
    'runtime.config': counted('runtime.config'),
    'runtime.capability': counted('runtime.capability'),
    'runtime.permissions': counted('runtime.permissions'),
    'runtime.tools': counted('runtime.tools'),
    'runtime.scheduler': counted('runtime.scheduler'),
    'runtime.storage': counted('runtime.storage'),
    'runtime.sdk': counted('runtime.sdk'),
    'runtime.services': counted('runtime.services'),
    'runtime.reset.complete': counted('runtime.reset.complete'),
    'runtime.reset': counted('runtime.reset'),
    'runtime.migration.detect': counted('runtime.migration.detect'),
    'runtime.instanceLock': counted('runtime.instanceLock'),
    'data.messages': counted('data.messages', store => {
      const append = store.appendIncoming;
      store.appendIncoming = (chatKey, entry) => append(chatKey, { ...entry, text: `stored:${entry.text}` });
      return store;
    }),
    'data.memory': counted('data.memory', memory => { memory.formatForPrompt = () => 'selected-memory'; return memory; }),
    'data.sessions': counted('data.sessions'),
    'data.usage': counted('data.usage'),
    'data.reminders': counted('data.reminders'),
    'data.stickers': counted('data.stickers'),
    'core.ingest': counted('core.ingest'),
    'core.events': counted('core.events'),
    'core.media.forward': counted('core.media.forward'),
    'core.tools.bundle': counted('core.tools.bundle'),
    'core.orchestrator': counted('core.orchestrator'),
    'core.prompt.pastState': counted('core.prompt.pastState'),
    'core.prompt.anchor': counted('core.prompt.anchor'),
    'core.prompt.persona': counted('core.prompt.persona'),
    'core.prompt.system': async ({ cfg }) => { seen.push('core.prompt.system'); return `selected-system:${cfg.persona.botName}`; },
    'core.prompt.user': async args => { seen.push('core.prompt.user'); return `selected-user:${args.triggerEntries[0].text}:${args.memText}`; },
    'core.agentRunner': counted('core.agentRunner'),
    'core.send': counted('core.send', send => {
      const sendBatch = send.sendTextBatch;
      send.sendTextBatch = (chatKey, texts, options) => sendBatch(chatKey, `selected-send:${texts}`, options);
      return send;
    }),
    'llm.complete': async ({ messages }) => {
      seen.push('llm.complete');
      assert.equal(messages[0].content, 'selected-system:fixture bot');
      assert.equal(messages[1].content, 'selected-user:stored:fixture incoming:selected-memory');
      return ++modelCalls === 1 ? reply([toolCall('send_message', { messages: 'selected-model' })]) : reply();
    },
  } });
  await f.boot();
  const session = await f.incoming();
  assert.equal(session.status, 'done');
  assert.equal(session.systemPrompt, 'selected-system:fixture bot');
  assert.equal(session.userPrompt, 'selected-user:stored:fixture incoming:selected-memory');
  assert.deepEqual(f.calls.sends[0].segments, [{ type: 'text', text: 'selected-send:selected-model' }]);
  assert.equal(f.kernel.store.recent('private:123', 10)[0].text, 'stored:fixture incoming');
  for (const key of ['runtime.config.defaults', 'runtime.bus', 'runtime.config', 'runtime.capability', 'runtime.permissions', 'runtime.tools', 'runtime.scheduler', 'runtime.storage', 'runtime.sdk', 'runtime.services', 'runtime.reset.complete', 'runtime.reset', 'runtime.migration.detect', 'runtime.instanceLock', 'data.messages', 'data.memory', 'data.sessions', 'data.usage', 'data.reminders', 'data.stickers', 'core.ingest', 'core.events', 'core.media.forward', 'core.tools.bundle', 'core.orchestrator', 'core.prompt.pastState', 'core.prompt.anchor', 'core.prompt.persona', 'core.prompt.system', 'core.prompt.user', 'core.agentRunner', 'core.send', 'llm.complete']) {
    assert.ok(seen.includes(key), `${key} participates in actual runtime consumption`);
  }
});

test('SDK llm.client uses the same selected implementation as the core runner', async t => {
  const requests = [];
  const f = await fixture(t, { components: { 'llm.complete': async args => { requests.push(args); return reply(); } } });
  const client = f.kernel.capability.providers('llm.client')[0].provider;
  const result = await client.complete({ messages: [{ role: 'user', content: 'sdk request' }] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].cfg.api.model, 'composition-fixture');
  assert.equal(requests[0].messages[0].content, 'sdk request');
  assert.equal(result.message.content, 'finished');
});

test('async route composition settles before listen and its cleanup runs on stop and failed start', async t => {
  let finish;
  const ready = new Promise(resolve => { finish = resolve; });
  const events = [];
  const f = await fixture(t, { components: {
    'console.routes': async (_http, context) => {
      assert.equal(context.components['core.send'], defaultComponents['core.send']);
      events.push('register');
      await ready;
      events.push('ready');
      return () => { events.push('dispose'); };
    },
  } });
  const start = f.kernel.start();
  await tick();
  assert.equal(f.calls.listen, 0);
  finish();
  await start;
  assert.equal(f.calls.listen, 1);
  await f.kernel.stop();
  assert.deepEqual(events, ['register', 'ready', 'dispose']);
  await assert.rejects(f.kernel.start(), /组合实例已停止/);
  assert.deepEqual(events, ['register', 'ready', 'dispose']);

  let cleaned = false;
  const broken = await fixture(t, { components: {
    'console.routes': () => () => { cleaned = true; },
    'runtime.http': args => ({ ...defaultComponents['runtime.http'](args), listen: async () => { throw new Error('fixture listen failed'); } }),
  } });
  await assert.rejects(broken.kernel.start(), /fixture listen failed/);
  assert.equal(cleaned, true);
});

test('stateful replacement factories share one lifecycle and release resources once in reverse order', async t => {
  const scopes = [];
  const released = [];
  const stateful = key => options => {
    scopes.push(options.lifecycle);
    options.lifecycle.onStop(async () => { await tick(); released.push(key); });
    return defaultComponents[key](options);
  };
  const f = await fixture(t, { components: {
    'data.messages': stateful('data.messages'),
    'data.memory': stateful('data.memory'),
    'core.send': stateful('core.send'),
  } });
  await f.boot();
  assert.equal(new Set(scopes).size, 1);
  assert.equal(scopes[0], f.kernel.lifecycle);
  assert.equal(scopes[0].signal.aborted, false);
  await f.kernel.stop();
  assert.equal(scopes[0].signal.aborted, true);
  assert.deepEqual(released, ['core.send', 'data.memory', 'data.messages']);
  await f.kernel.stop();
  assert.equal(released.length, 3);
});

test('replacement resources also unwind on startup failure and reset quiescence', async t => {
  const released = [];
  const stateful = label => options => {
    options.lifecycle.onStop(() => { released.push(label); });
    return defaultComponents['data.messages'](options);
  };
  const failed = await fixture(t, { components: {
    'data.messages': stateful('failed-start'),
    'runtime.http': args => ({ ...defaultComponents['runtime.http'](args), listen: async () => { throw new Error('fixture unavailable'); } }),
  } });
  await assert.rejects(failed.kernel.start(), /fixture unavailable/);
  assert.equal(failed.kernel.lifecycle.signal.aborted, true);
  assert.deepEqual(released, ['failed-start']);

  let reset;
  const f = await fixture(t, { components: {
    'data.messages': stateful('reset'),
    'console.routes': (http, context) => {
      reset = context.resetData;
      return defaultComponents['console.routes'](http, context);
    },
  } });
  await f.boot();
  const result = await reset();
  assert.equal(result.resetAccepted, true);
  assert.equal(f.kernel.lifecycle.signal.aborted, true);
  assert.deepEqual(released, ['failed-start', 'reset']);
  const before = released.length;
  await f.kernel.stop();
  assert.equal(released.length, before);
});

test('stop cancels a pending registrar before awaiting its readiness', { timeout: 2000 }, async t => {
  let disposed = 0;
  const f = await fixture(t, { components: {
    'console.routes': async (_http, { lifecycle }) => {
      await new Promise(resolve => {
        if (lifecycle.signal.aborted) resolve();
        else lifecycle.signal.addEventListener('abort', resolve, { once: true });
      });
      return () => { disposed++; };
    },
  } });
  const start = f.kernel.start();
  const rejected = assert.rejects(start, /内核启动已取消/);
  await f.kernel.stop();
  await rejected;
  assert.equal(f.calls.listen, 0);
  assert.equal(disposed, 1);
});

test('the application boundary awaits resources and routes acquired before a constructor throws', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-core-composition-constructor-'));
  t.after(() => {
    const target = path.resolve(appRoot);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-core-composition-constructor-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const released = [];
  await assert.rejects(createApplication({
    appRoot, env: { QQ_AGENT_DATA_DIR: path.join(appRoot, 'data') },
    components: {
      'runtime.logger': args => defaultComponents['runtime.logger']({ ...args, mirrorConsole: false }),
      'data.messages': args => {
        args.lifecycle.onStop(async () => { await tick(); released.push('messages'); });
        return defaultComponents['data.messages'](args);
      },
      'console.routes': () => async () => { await tick(); released.push('routes'); },
      'runtime.reset': () => { throw new Error('fixture constructor failed'); },
    },
  }), /fixture constructor failed/);
  assert.deepEqual(released, ['routes', 'messages']);
});

test('class implementations retain config, storage and loader private-field receivers', async t => {
  class PrivateConfig {
    #inner;
    constructor(inner) { this.#inner = inner; }
    get file() { return this.#inner.file; }
    get() { return this.#inner.get(); }
    load(...args) { return this.#inner.load(...args); }
    update(...args) { return this.#inner.update(...args); }
    reset(...args) { return this.#inner.reset(...args); }
    onChange(...args) { return this.#inner.onChange(...args); }
  }
  class PrivateStorage {
    #inner;
    constructor(inner) { this.#inner = inner; }
    get dataDir() { return this.#inner.dataDir; }
    namespace(...args) { return this.#inner.namespace(...args); }
    ensureDirs(...args) { return this.#inner.ensureDirs(...args); }
  }
  class PrivateLoader {
    #inner;
    constructor(inner) {
      this.#inner = inner;
      for (const [name, method] of Object.entries(inner)) if (name !== 'isActive') this[name] = method;
    }
    isActive(...args) { return this.#inner.isActive(...args); }
  }
  let httpConfigObserved = false;
  const f = await fixture(t, { components: {
    'runtime.config': args => new PrivateConfig(defaultComponents['runtime.config'](args)),
    'runtime.storage': args => new PrivateStorage(defaultComponents['runtime.storage'](args)),
    'runtime.plugins': args => {
      const loader = new PrivateLoader(defaultComponents['runtime.plugins'](args));
      loader.startWatchers = () => {};
      return loader;
    },
    'runtime.http': args => ({ ...defaultComponents['runtime.http'](args), listen: async () => {
      const off = args.config.onChange(() => {});
      off(); httpConfigObserved = true;
      return 48171;
    } }),
  } });
  const namespace = f.kernel.storage.namespace('class-fixture');
  namespace.set('receiver', 'retained');
  assert.equal(namespace.get('receiver'), 'retained');
  await f.boot();
  assert.equal(httpConfigObserved, true, 'HTTP also receives the prototype config observer');
  f.kernel.capability.register('fixture.active-owner', 'core-tools', { marker: 'active' });
  assert.equal(f.kernel.capability.providers('fixture.active-owner')[0]?.provider.marker, 'active');
  assert.equal((await f.incoming()).status, 'done');
  f.kernel.config.update({ persona: { botName: 'private receiver' } });
  f.kernel.config.load();
  assert.equal(f.kernel.config.get().persona.botName, 'private receiver');
  f.kernel.config.reset();
  assert.notEqual(f.kernel.config.get().persona.botName, 'private receiver');
});

test('startup preserves a one-shot route cleanup failure beside the original error', async t => {
  const startup = new Error('fixture startup failed');
  const disposal = new Error('fixture one-shot disposal failed');
  let disposals = 0;
  const f = await fixture(t, { components: {
    'runtime.http': args => ({ ...defaultComponents['runtime.http'](args), listen: async () => { throw startup; } }),
    'console.routes': () => () => { disposals++; throw disposal; },
  } });
  await assert.rejects(f.kernel.start(), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, startup);
    assert.deepEqual(error.errors, [startup, disposal]);
    return true;
  });
  assert.equal(disposals, 1);
  await f.kernel.stop();
  assert.equal(disposals, 1, 'cleanup failure is retained without invoking the old disposer again');
});
