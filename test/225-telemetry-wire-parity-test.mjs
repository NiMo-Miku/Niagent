import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import { createTelemetry } from '../bundled/telemetry/service.js';

const retainedOutput = process.argv[2] ? path.resolve(process.argv[2]) : null;
const wireFields = ['calls', 'inputTokens', 'installId', 'outputTokens', 'tools', 'totalTokens', 'version'];
const totals = (extra = {}) => ({ calls: 2, promptTokens: 7, completionTokens: 3, totalTokens: 10, toolCounts: { send_message: 1 }, ...extra });
const tick = () => new Promise(setImmediate);

async function environment(t, { enabled = true } = {}) {
  if (retainedOutput) fs.mkdirSync(retainedOutput, { recursive: true });
  const root = fs.mkdtempSync(path.join(retainedOutput ?? os.tmpdir(), 'qqa-telemetry225-'));
  const appRoot = path.join(root, 'app'), dataDir = path.join(root, 'data');
  for (const kind of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, kind), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  const bundled = path.resolve(import.meta.dirname, '../bundled/telemetry');
  const pluginDir = path.join(appRoot, 'bundled/telemetry'); fs.mkdirSync(pluginDir);
  fs.copyFileSync(path.join(bundled, 'plugin.json'), path.join(pluginDir, 'plugin.json'));
  fs.writeFileSync(path.join(pluginDir, 'index.js'), `export {default} from ${JSON.stringify(pathToFileURL(path.join(bundled, 'index.js')).href)};`);
  const logs = [], requests = [], scheduled = [];
  const log = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => logs.push({ level, args })]));
  log.child = () => log;
  const bus = defaults['runtime.bus']({ log });
  const config = defaults['runtime.config']({ dataDir, defaults: defaults['runtime.config.defaults'](), log }); config.load();
  config.update({ telemetry: { enabled }, api: { apiKey: 'SYNTHETIC_PRIVATE_CONFIG' } });
  // Saved config must be what the actual SDK binding reads at startup.
  config.load();
  const capability = defaults['runtime.capability']({ log, selection: () => config.get().extensions?.providers ?? {} });
  const permissions = defaults['runtime.permissions']({ dataDir, bus, log, headless: true });
  const registry = defaults['runtime.tools']({ log, bus, permissions, capabilities: capability });
  const scheduler = defaults['runtime.scheduler']({ log });
  const storage = defaults['runtime.storage']({ dataDir, log });
  const sessions = defaults['data.sessions']({ dataDir, log });
  const originalAt = scheduler.at;
  // Capture only the clock boundary; retain the real scheduler's owner cleanup.
  scheduler.at = (when, fn, options) => {
    const handle = originalAt(when, fn, options);
    const item = { when, fn, options, stopped: false, handle };
    scheduled.push(item);
    return { stop() { item.stopped = true; handle.stop(); } };
  };
  let loader, sdk, mode = 'success', resolveTransport, enterTransport;
  const services = defaults['runtime.services']({ capability, config, bus, log,
    runInHostContext: action => sdk.withoutConsumerContext(action),
    authorize: async (name, candidate) => {
      try {
        const entry = loader.hostEntry(candidate.ownerId);
        if (!entry || !loader.isActive(candidate.ownerId)) return false;
        for (const scope of capability.options(name, candidate.ownerId).scopes ?? ['net.outbound']) await sdk.check(entry, entry.rootKind === 'bundled', scope);
        return true;
      } catch { return false; }
    },
  });
  const facets = {
    'host.config': {},
    'host.environment': { appRoot, dataDir, version: '9.8.7-synthetic', profile: { mode: 'fixture' } },
    'data.sessions': sessions,
    'tools.catalog': { list: () => registry.list() },
  };
  for (const [name, provider] of Object.entries(facets)) capability.register(name, 'kernel', provider);
  sdk = defaults['runtime.sdk']({ config, permissions, bus, loaderOf: () => loader, resolveProvider: name => services.get(name), facets });
  loader = defaults['runtime.plugins']({ appRoot, config, log, bus, registry, capabilityRegistry: capability, permissions, scheduler, storage,
    sdkHost: { ...sdk, fetch: async (url, options) => {
      assert.equal(String(url), 'https://kondius.cn/qq-agent/api/telemetry');
      const request = { url: String(url), body: JSON.parse(options.body), method: options.method, headers: Object.fromEntries(new Headers(options.headers)), signal: options.signal };
      requests.push(request);
      if (enterTransport) { enterTransport(); enterTransport = null; }
      if (mode === 'pending') return await new Promise(resolve => { resolveTransport = resolve; });
      if (mode === 'throw') throw new Error('synthetic transport unavailable');
      return new Response('{}', { status: mode === 'http-error' ? 503 : 200 });
    } },
  });
  capability._setActiveProbe(loader.isActive.bind(loader));
  async function refresh() { await services.refresh(); await tick(); await services.idle(); }
  async function boot() {
    await loader.loadAll();
    assert.equal(loader.hostEntry('telemetry').status, 'active');
    assert.equal(scheduler.count(), 0); assert.equal(requests.length, 0);
    await services.start(); await refresh();
  }
  const liveTimer = () => scheduled.findLast(item => !item.stopped);
  async function fire(item = liveTimer()) {
    assert.ok(item, 'the selected provider must own a scheduled report');
    item.stopped = true; item.handle.stop();
    await item.fn();
  }
  const totalsFile = path.join(dataDir, 'telemetry-totals.json');
  const readTotals = () => JSON.parse(fs.readFileSync(totalsFile, 'utf8'));
  const saveTotals = value => fs.writeFileSync(totalsFile, JSON.stringify(value));
  function completeSession() {
    const session = sessions.create('group:synthetic-private');
    sessions.finish(session.id, 'done', {
      traceVersion: 1, usage: { calls: 2, promptTokens: 7, completionTokens: 3, totalTokens: 10, cachedTokens: 2 },
      messages: [{ role: 'user', content: 'SYNTHETIC_PRIVATE_MESSAGE' }, { role: 'tool', toolCall: { name: 'send_message' } }],
    });
    return session;
  }
  function replacement() {
    const dir = path.join(appRoot, 'plugins/telemetry-replacement'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'telemetry-replacement', kind: 'plugin', version: '1.0.0', apiVersion: 1, enabledByDefault: false, entry: 'index.js' }));
    fs.writeFileSync(path.join(dir, 'index.js'), `export default {setup(ctx){
      const state={starts:0,stops:0,reports:0};
      ctx.registerCapability('telemetry.service',{
        start(){state.starts++;},stop(){state.stops++;},status(){return {...state};},
        async report(){state.reports++;return {ok:true,selected:'synthetic-replacement'};}
      },{lifecycle:true,scopes:[]});
    }};`);
    return dir;
  }
  function permission(decision) {
    const entry = loader.hostEntry('telemetry');
    permissions.bindPlugin('telemetry', { fingerprint: entry.fingerprint, scopes: entry.manifest.permissions, isCurrent: () => loader.hostEntry('telemetry') === entry });
    assert.equal(permissions.setOverride('telemetry', 'net.outbound', decision, { fingerprint: entry.fingerprint }), true);
  }
  t.after(async () => {
    await services.stop(); loader.stopAll(); scheduler.stop(); sessions.stop(); permissions.close();
    fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({
      requests: requests.map(({ signal, ...rest }) => ({ ...rest, aborted: signal.aborted })),
      scheduled: scheduled.map(({ when, options, stopped }) => ({ when, options, stopped })), logs,
    }, null, 2));
    if (!retainedOutput) {
      const target = path.resolve(root);
      assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-telemetry225-'));
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
  return { root, dataDir, config, capability, permissions, registry, loader, scheduler, services, sessions, requests, scheduled,
    boot, refresh, fire, liveTimer, saveTotals, readTotals, completeSession, replacement, permission,
    set mode(value) { mode = value; },
    entered() { return new Promise(resolve => { enterTransport = resolve; }); },
    release() { resolveTransport?.(new Response('{}')); },
  };
}

test('225 actual loader and SDK report the old seven wire fields, runtime version and stable imported ID', async t => {
  const e = await environment(t);
  const installId = '3418f275-995a-4f77-8e73-ab0c4dbef734';
  fs.writeFileSync(path.join(e.dataDir, 'telemetry.json'), JSON.stringify({ installId, createdAt: 123 }));
  e.completeSession(); const before = e.readTotals();
  await e.boot(); assert.equal(e.capability.providers('telemetry.service')[0].ownerId, 'telemetry');
  assert.equal(e.scheduler.count(), 1);
  assert.ok(Math.abs(e.liveTimer().when.getTime() - Date.now() - 90_000) < 1000);
  await e.fire();
  assert.deepEqual(e.requests[0].body, { installId, version: '9.8.7-synthetic', calls: 2, inputTokens: 7, outputTokens: 3, totalTokens: 10, tools: { send_message: 1 } });
  assert.deepEqual(Object.keys(e.requests[0].body).sort(), wireFields);
  assert.equal(e.requests[0].method, 'POST'); assert.equal(e.requests[0].headers['content-type'], 'application/json');
  assert.doesNotMatch(JSON.stringify(e.requests[0].body), /SYNTHETIC_PRIVATE|group:|cachedTokens|apiKey/);
  assert.deepEqual(e.readTotals(), before);
  assert.equal(before.promptTokens, 7); assert.equal(before.toolCounts.send_message, 1);
  assert.ok(Math.abs(e.liveTimer().when.getTime() - Date.now() - 21_600_000) < 1000);
  await e.fire(); assert.equal(e.requests[1].body.installId, installId);
  assert.deepEqual(e.readTotals(), before);
  assert.throws(() => e.loader.hostEntry('telemetry').ctx.capability('telemetry.service'), /生命周期仅供宿主管理/);
});

test('225 wire validates 200 full legal IDs and finite nonnegative integers without changing cached totals', async t => {
  const e = await environment(t);
  const long0 = 'a'.repeat(63) + '0', long1 = 'a'.repeat(63) + '1';
  const toolCounts = { 'synthetic invalid text?': 3, ['x'.repeat(65)]: 1, bad_negative: -1, bad_infinite: 'Infinity', bad_object: { toString: 'SYNTHETIC_PRIVATE' }, bad_array: [3], bad_boolean: true,
    [long0]: 1, [long1]: 2, huge_count: '4294967298', fractional_count: 2.75,
    ...Object.fromEntries(Array.from({ length: 201 }, (_, i) => ['tool_' + String(i).padStart(3, '0'), i + 1])),
  };
  const cached = totals({ calls: 2.9, promptTokens: -7, completionTokens: 'Infinity', totalTokens: 10.9, toolCounts });
  e.saveTotals(cached); const bytes = fs.readFileSync(path.join(e.dataDir, 'telemetry-totals.json'), 'utf8');
  await e.boot(); await e.fire();
  const body = e.requests[0].body;
  assert.deepEqual(Object.keys(body).sort(), wireFields);
  assert.deepEqual([body.calls, body.inputTokens, body.outputTokens, body.totalTokens], [2, 0, 0, 10]);
  assert.equal(Object.keys(body.tools).length, 200);
  assert.deepEqual([body.tools[long0], body.tools[long1], body.tools.huge_count, body.tools.fractional_count], [1, 2, 4294967298, 2]);
  assert.equal(body.tools.tool_195, 196); assert.equal(Object.hasOwn(body.tools, 'tool_196'), false);
  for (const [id, count] of Object.entries(body.tools)) { assert.match(id, /^[a-zA-Z0-9_-]{1,64}$/); assert.ok(Number.isFinite(count) && Number.isInteger(count) && count > 0); }
  assert.doesNotMatch(JSON.stringify(body), /SYNTHETIC_PRIVATE|bad_object|bad_array|bad_boolean|bad_negative|bad_infinite|synthetic invalid text/);
  assert.equal(fs.readFileSync(path.join(e.dataDir, 'telemetry-totals.json'), 'utf8'), bytes);
});

test('225 no calls skips identity and HTTP, then real completed-session totals report without resetting', async t => {
  const e = await environment(t); await e.boot();
  await e.fire(); assert.equal(e.requests.length, 0);
  assert.equal(fs.existsSync(path.join(e.dataDir, 'telemetry.json')), false);
  assert.deepEqual(e.readTotals(), totals({ calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, toolCounts: {} }));
  e.completeSession(); await e.fire();
  assert.equal(e.requests.length, 1); assert.equal(e.requests[0].body.calls, 2);
  assert.equal(e.readTotals().promptTokens, 7);
  e.saveTotals(totals({ calls: 'Infinity' })); await e.fire(); assert.equal(e.requests.length, 1);
  e.saveTotals(totals({ calls: -1 })); await e.fire(); assert.equal(e.requests.length, 1);
});

test('225 saved disabled config and stale callbacks cannot report or start an implicit fallback', async t => {
  const e = await environment(t, { enabled: false }); e.completeSession(); await e.boot();
  assert.equal(e.scheduler.count(), 0); assert.equal(e.requests.length, 0);
  const reread = defaults['runtime.config']({ dataDir: e.dataDir, defaults: defaults['runtime.config.defaults']() });
  assert.equal(reread.load().telemetry.enabled, false);
  e.config.update({ telemetry: { enabled: true } }); await e.refresh();
  assert.equal(e.scheduler.count(), 1); const stale = e.liveTimer();
  e.config.update({ telemetry: { enabled: false } }); await e.refresh();
  assert.equal(e.scheduler.count(), 0); assert.equal(reread.load().telemetry.enabled, false);
  await stale.fn(); assert.equal(e.requests.length, 0);
  e.config.update({ telemetry: { enabled: true } }); await e.refresh(); await e.fire(); assert.equal(e.requests.length, 1);
  await e.loader.setEnabled('telemetry', false); await e.refresh();
  assert.equal(e.services.get('telemetry.service'), undefined); assert.equal(e.capability.has('telemetry.service'), false);
  assert.equal(e.scheduler.count(), 0); assert.equal(e.requests.length, 1);
});

test('225 disabling config cancels actual SDK HTTP and late completion cannot reschedule', async t => {
  const e = await environment(t); e.completeSession(); await e.boot(); e.mode = 'pending';
  const entered = e.entered(), firing = e.fire(); await entered;
  e.config.update({ telemetry: { enabled: false } }); await e.refresh(); await firing;
  assert.equal(e.requests[0].signal.aborted, true); assert.equal(e.scheduler.count(), 0);
  e.release(); await tick(); assert.equal(e.requests.length, 1); assert.equal(e.scheduler.count(), 0);
  e.mode = 'success'; e.config.update({ telemetry: { enabled: true } }); await e.refresh(); await e.fire();
  assert.equal(e.requests.length, 2); assert.equal(e.requests[1].signal.aborted, false);
});

test('225 plugin stop and permission revocation each abort a pending SDK request and retain cumulative state', async t => {
  const e = await environment(t); e.completeSession(); await e.boot(); const initial = e.readTotals();
  for (const action of ['plugin', 'permission']) {
    e.mode = 'pending'; const entered = e.entered(), firing = e.fire(); await entered;
    const request = e.requests.at(-1);
    if (action === 'plugin') await e.loader.setEnabled('telemetry', false); else e.permission('deny');
    await e.refresh(); await firing;
    assert.equal(request.signal.aborted, true); assert.equal(e.scheduler.count(), 0); assert.equal(e.services.get('telemetry.service'), undefined);
    e.release(); await tick(); assert.equal(e.scheduler.count(), 0); assert.deepEqual(e.readTotals(), initial);
    e.mode = 'success';
    if (action === 'plugin') await e.loader.setEnabled('telemetry', true); else e.permission('allow');
    await e.refresh(); assert.equal(e.scheduler.count(), 1);
  }
  await e.fire(); assert.equal(e.requests.length, 3); assert.equal(e.requests.at(-1).body.calls, 2);
});

test('225 actual appended provider replaces, pins, disables and leaves no hidden default when both are disabled', async t => {
  const e = await environment(t); e.replacement(); e.completeSession(); await e.boot();
  await e.loader.setEnabled('telemetry-replacement', true); await e.refresh();
  const replacement = e.services.get('telemetry.service');
  assert.equal(e.capability.providers('telemetry.service')[0].ownerId, 'telemetry-replacement');
  assert.deepEqual(replacement.status(), { starts: 1, stops: 0, reports: 0 });
  assert.equal((await replacement.report()).selected, 'synthetic-replacement');
  assert.equal(e.scheduler.count(), 0); assert.equal(e.requests.length, 0);
  e.config.update({ extensions: { providers: { 'telemetry.service': 'telemetry' } } }); await e.refresh();
  assert.equal(e.capability.providers('telemetry.service')[0].ownerId, 'telemetry');
  assert.equal(replacement.status().stops, 1); assert.equal(e.scheduler.count(), 1);
  await e.fire(); assert.equal(e.requests.length, 1); assert.equal(e.requests[0].body.version, '9.8.7-synthetic');
  e.config.update({ extensions: { providers: { __replace__: {} } } }); await e.refresh();
  assert.equal(e.services.get('telemetry.service'), replacement); assert.equal(replacement.status().starts, 2); assert.equal(e.scheduler.count(), 0);
  await e.loader.setEnabled('telemetry', false); await e.refresh();
  await e.loader.setEnabled('telemetry-replacement', false); await e.refresh();
  assert.equal(replacement.status().stops, 2); assert.equal(e.services.get('telemetry.service'), undefined);
  assert.equal(e.capability.has('telemetry.service'), false); assert.equal(e.scheduler.count(), 0); assert.equal(e.requests.length, 1);
});

test('225 failed uploads remain quiet, preserve totals and try only once per scheduled report', async t => {
  const e = await environment(t); e.completeSession(); await e.boot();
  const before = e.readTotals();
  for (const mode of ['throw', 'http-error']) {
    e.mode = mode; const count = e.requests.length; await e.fire();
    assert.equal(e.requests.length, count + 1); assert.equal(e.scheduler.count(), 1); assert.deepEqual(e.readTotals(), before);
  }
  e.mode = 'success'; await e.fire(); assert.equal(e.requests.length, 3); assert.deepEqual(e.readTotals(), before);
});

test('225 direct createTelemetry retains its version default and accepts an explicit compatibility version', async t => {
  const e = await environment(t); e.saveTotals(totals());
  const requests = [];
  const fetchImpl = async (_url, options) => { requests.push(JSON.parse(options.body)); return new Response('{}'); };
  const fallback = createTelemetry({ dataDir: e.dataDir, fetchImpl });
  assert.equal((await fallback.report()).ok, true); assert.equal(requests[0].version, '0.5.0');
  const explicit = createTelemetry({ dataDir: e.dataDir, version: '0.4-compatible-fixture', fetchImpl });
  assert.equal((await explicit.report()).ok, true); assert.equal(requests[1].version, '0.4-compatible-fixture');
  assert.deepEqual(Object.keys(requests[0]).sort(), wireFields);
  fallback.stop(); explicit.stop();
});
