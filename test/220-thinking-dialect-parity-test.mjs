// Real saved config, composition, loader/SDK, registered default dialect and
// default LLM serialization. Only transport is an in-process fixture; no server,
// browser, installed extension, QQ or external model is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import { loadComposition } from '../src/kernel/composition.js';

const retainedOutput = process.argv[2] ? path.resolve(process.argv[2]) : null;
const plain = [{ role: 'user', content: 'synthetic thinking request' }];
const success = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'synthetic response' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });

function environment(t, api = {}) {
  if (retainedOutput) fs.mkdirSync(retainedOutput, { recursive: true });
  const root = fs.mkdtempSync(path.join(retainedOutput ?? os.tmpdir(), 'qqa-thinking219-'));
  const appRoot = path.join(root, 'app'), dataDir = path.join(root, 'data');
  for (const dir of ['bundled', 'skills', 'plugins']) fs.mkdirSync(path.join(appRoot, dir), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  const source = path.resolve(import.meta.dirname, '../bundled/llm-dialects');
  const bundled = path.join(appRoot, 'bundled/llm-dialects');
  fs.mkdirSync(bundled);
  fs.copyFileSync(path.join(source, 'plugin.json'), path.join(bundled, 'plugin.json'));
  fs.writeFileSync(path.join(bundled, 'index.js'), `export {default} from ${JSON.stringify(pathToFileURL(path.join(source, 'index.js')).href)};`);
  const logs = [], runs = [], requests = [];
  const log = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => logs.push({ level, args })]));
  log.child = () => log;
  const makeConfig = () => defaults['runtime.config']({ dataDir, defaults: defaults['runtime.config.defaults'](), log });
  let config = makeConfig(); config.load();
  config.update({ api: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '', thinkingMode: 'auto', thinkingEffort: '', temperature: 0.35, ...api }, proactive: { enabled: false } });
  const bus = defaults['runtime.bus']({ log }), capabilities = defaults['runtime.capability']({ log });
  const permissions = defaults['runtime.permissions']({ dataDir, log, bus, headless: true });
  const registry = defaults['runtime.tools']({ log, bus, permissions, capabilities });
  const scheduler = defaults['runtime.scheduler']({ log }), storage = defaults['runtime.storage']({ dataDir, log });
  let loader, services, selected;
  function reloadSaved() { config = makeConfig(); config.load(); return config.get(); }
  async function reloadComposition() { selected = await loadComposition({ appRoot, defaults }); return selected; }
  async function boot() {
    reloadSaved(); await reloadComposition();
    services = defaults['runtime.services']({ capability: capabilities, config, bus, log });
    const sdk = defaults['runtime.sdk']({ config, permissions, bus, loaderOf: () => loader, resolveProvider: name => services.get(name) });
    loader = defaults['runtime.plugins']({ appRoot, config, log, bus, registry, capabilityRegistry: capabilities, permissions, scheduler, storage,
      sdkHost: { ...sdk, fetch: async () => { throw new Error('Unexpected SDK HTTP; only model request fixtures are allowed'); } } });
    await loader.loadAll();
    assert.equal(loader.isActive('llm-dialects'), true);
    assert.equal(capabilities.providers('llm.dialect').at(-1).ownerId, 'llm-dialects');
  }
  async function run({ fetchImpl, components = selected.components, retries = 0, ...args } = {}) {
    const currentRequests = [], notices = [];
    const record = { requests: currentRequests, notices }; runs.push(record);
    try {
      record.result = await components['llm.complete']({ cfg: config.get(), messages: plain, capabilities, components, log, ...args,
        onRequest: notice => { notices.push({ model: notice.model, baseUrl: notice.api.baseUrl }); args.onRequest?.(notice); },
        fetchFn: async (url, init) => {
          const request = { url: String(url), method: init.method, authorization: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body), initiallyAborted: init.signal.aborted };
          requests.push(request); currentRequests.push(request);
          return fetchImpl ? fetchImpl(url, init, request, currentRequests.length) : success();
        },
      }, retries);
      return record;
    } catch (error) { record.error = { message: error.message, code: error.code, status: error.status }; throw error; }
  }
  function plugin(id, code) {
    const dir = path.join(appRoot, 'plugins', id); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id, enabledByDefault: true }));
    fs.writeFileSync(path.join(dir, 'index.js'), code);
  }
  function layer(code) {
    const dir = path.join(appRoot, 'overrides/10-thinking'); fs.mkdirSync(dir, { recursive: true });
    const manifest = { version: 1, id: 'qa-thinking', components: { 'llm.thinking': { module: './thinking.mjs', export: 'resolve' } } };
    fs.writeFileSync(path.join(dir, 'composition.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, 'thinking.mjs'), code);
    return { disable() { fs.writeFileSync(path.join(dir, 'composition.json'), JSON.stringify({ ...manifest, enabled: false })); } };
  }
  t.after(async () => {
    await loader?.stopAll(); await services?.stop(); scheduler.stop(); permissions.close();
    fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({ runs, requests, logs }, null, 2));
    if (!retainedOutput) {
      const absolute = path.resolve(root);
      assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
      assert.ok(path.basename(absolute).startsWith('qqa-thinking219-'));
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  });
  return { root, boot, run, plugin, layer, reloadSaved, reloadComposition, capabilities, requests,
    get config() { return config; }, get loader() { return loader; }, get components() { return selected.components; }, get composition() { return selected.composition; } };
}

const ok = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'synthetic response' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }), { headers: { 'content-type': 'application/json' } });
const bad = text => new Response(text, { status: 400 });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const keys = ['thinking', 'enable_thinking', 'thinking_budget', 'reasoning_effort', 'extra_body', 'reasoning', 'think'];
const policy = body => Object.fromEntries(keys.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
function custom(e, { strip = '', detect = "return 'custom';", reject = "return text.includes('fixture_think');" } = {}) {
  e.plugin('selected-dialect', `export const calls=[];export function setup(ctx){ctx.registerCapability('llm.dialect',{
    detect(){calls.push('detect');${detect}},build(input){calls.push('build:'+input.mode);return {params:{fixture_think:true},omitTemperature:true};},
    async looksLikeRejection(text){calls.push('reject');${reject}},${strip ? 'async strip(body){calls.push(\'strip\');' + strip + '},' : ''}
  });}`);
}

test('220 parsed hostname ignores path/query and lookalikes, GPT5 model fallback works and host precedence remains', async t => {
  const e = environment(t, { thinkingMode: 'auto', thinkingEffort: 'high' }); await e.boot();
  for (const [baseUrl, model, expected] of [
    ['https://gateway.fixture/proxy/deepseek/v1', 'qwen-plus', { enable_thinking: true }],
    ['https://gateway.fixture/v1?route=localhost', 'qwen-plus', { enable_thinking: true }],
    ['https://notdeepseek.com/v1', 'qwen-plus', { enable_thinking: true }],
    ['https://gateway.fixture/v1', 'gpt-5', { reasoning_effort: 'high' }],
    ['https://gateway.fixture/v1', 'gpt-5-mini', { reasoning_effort: 'high' }],
    ['https://gateway.fixture/v1', 'gpt-5.1', { reasoning_effort: 'high' }],
    ['https://gateway.fixture/v1', 'gpt-50', {}],
    ['https://openrouter.ai/api/v1', 'claude', { reasoning: { effort: 'high' } }],
    ['https://api.deepseek.com/v1', 'qwen-plus', { thinking: { type: 'enabled' } }],
  ]) {
    e.config.update({ api: { baseUrl, model } }); e.reloadSaved();
    const r = await e.run(); assert.equal(r.requests.length, 1); assert.deepEqual(policy(r.requests[0].body), expected);
  }
});

test('220 local compatible endpoints never force think and illegal HTTP identities make zero requests', async t => {
  const e = environment(t, { thinkingMode: 'on', thinkingEffort: 'high', model: 'deepseek-thinking' }); await e.boot();
  for (const baseUrl of ['http://localhost:12345/v1', 'http://127.0.0.1:12345/v1', 'http://10.1.2.3/v1', 'http://192.168.1.2/v1', 'http://[::1]:12345/v1']) {
    e.config.update({ api: { baseUrl } }); e.reloadSaved();
    const r = await e.run(); assert.equal(r.requests.length, 1); assert.deepEqual(policy(r.requests[0].body), {});
  }
  const provider = e.capabilities.providers('llm.dialect')[0].provider, before = e.requests.length;
  for (const baseUrl of ['file:///deepseek.com/v1', 'ftp://deepseek.com/v1', 'deepseek.com/v1', 'https://user:secret@api.deepseek.com/v1']) {
    assert.equal(provider.detect(baseUrl, 'deepseek-thinking'), 'generic');
    e.config.update({ api: { baseUrl } }); e.reloadSaved();
    await assert.rejects(e.run(), error => error.code === 'PRIMARY_CONFIG_INVALID');
  }
  assert.equal(e.requests.length, before);
});

test('220 field-near refusal variants recover, unrelated/distant model errors and zero-field bodies do not replay', async t => {
  const e = environment(t, { baseUrl: 'https://api.openai.com/v1', model: 'o3', thinkingEffort: 'high', thinkingMode: 'auto', temperature: 0.24 }); await e.boot();
  for (const text of ['field ReasoningEffort invalid', 'reasoning effort not supported', "'reasoning_effort' is unrecognized", 'unexpected ReasoningEffort parameter', '思考参数不支持']) {
    const r = await e.run({ fetchImpl: async (_url, _init, request) => request.body.reasoning_effort ? bad(text) : ok() });
    assert.equal(r.requests.length, 2); assert.equal(r.result.degraded, true); assert.equal(r.requests[1].body.temperature, 0.24); assert.deepEqual(policy(r.requests[1].body), {});
  }
  for (const text of ['invalid model name: deepseek-thinking', 'invalid model. ' + 'x'.repeat(35) + ' thinking', 'unexpected authorization key']) {
    const before = e.requests.length;
    await assert.rejects(e.run({ fetchImpl: async () => bad(text) }), error => error.status === 400);
    assert.equal(e.requests.length - before, 1);
  }
  e.config.update({ api: { thinkingEffort: '' } }); e.reloadSaved();
  const before = e.requests.length;
  await assert.rejects(e.run({ fetchImpl: async () => bad('unknown thinking parameter') }), error => error.status === 400);
  assert.equal(e.requests.length - before, 1); assert.deepEqual(policy(e.requests.at(-1).body), {});
});

test('220 default strip removes all thinking keys including budget and retains normal one-retry ceiling', async t => {
  const e = environment(t, { thinkingMode: 'auto', thinkingEffort: '', temperature: 0.26 }); await e.boot();
  e.capabilities.register('llm.request-params', 'kernel', ({ body }) => ({ body: { ...body, thinking: { type: 'enabled' }, enable_thinking: true, thinking_budget: 128, reasoning_effort: 'high', extra_body: { fixture: true }, reasoning: { effort: 'high' }, think: true }, omitTemperature: true }));
  const r = await e.run({ fetchImpl: async (_url, _init, request) => keys.some(key => key in request.body) ? bad('unknown extra_body parameter') : ok() });
  assert.equal(r.requests.length, 2); assert.equal(Object.keys(policy(r.requests[0].body)).length, 7); assert.deepEqual(policy(r.requests[1].body), {}); assert.equal(r.requests[1].body.temperature, 0.26);
  const before = e.requests.length;
  await assert.rejects(e.run({ fetchImpl: async () => bad('unknown extra_body parameter') }), error => error.status === 400);
  assert.equal(e.requests.length - before, 2);
});

test('220 selected custom dialect owns nonstandard keys, fallback strip and in-place strip keep working', async t => {
  for (const strip of ['', 'delete body.fixture_think;return body;', 'const out={...body};delete out.fixture_think;return out;']) {
    const e = environment(t); custom(e, { strip }); await e.boot();
    const r = await e.run({ fetchImpl: async (_url, _init, request) => request.body.fixture_think ? bad('unsupported fixture_think') : ok() });
    assert.equal(r.requests.length, 2); assert.equal(r.result.degraded, true); assert.equal(r.requests[0].body.fixture_think, true); assert.equal(r.requests[1].body.fixture_think, undefined); assert.equal(r.requests[1].body.temperature, 0.35);
    assert.equal(e.loader.hostEntry('selected-dialect').instance.calls[1], 'build:default');
  }
});

test('220 selected custom strip with the same JSON value or invalid output cannot justify a retry', async t => {
  for (const strip of ['return {...body};', 'return Object.fromEntries(Object.entries(body).reverse());', 'return null;', 'return [];']) {
    const e = environment(t); custom(e, { strip }); await e.boot();
    await assert.rejects(e.run({ fetchImpl: async () => bad('unsupported fixture_think') }), error => error.status === 400);
    assert.equal(e.requests.length, 1);
    assert.deepEqual(e.loader.hostEntry('selected-dialect').instance.calls, ['detect', 'build:default', 'reject', 'strip']);
  }
});

test('220 selected classifier is authoritative and a no-op strip leaves the existing retry-advisor route available', async t => {
  const declined = environment(t); custom(declined, { reject: 'return false;', strip: 'delete body.fixture_think;return body;' }); await declined.boot();
  await assert.rejects(declined.run({ fetchImpl: async () => bad('unsupported thinking parameter') }), error => error.status === 400);
  assert.equal(declined.requests.length, 1);
  assert.deepEqual(declined.loader.hostEntry('selected-dialect').instance.calls, ['detect', 'build:default', 'reject']);
  const e = environment(t); custom(e, { strip: 'return {...body};' }); await e.boot();
  let advised = 0;
  e.capabilities.register('llm.retry-advisor', 'kernel', ({ body }) => { advised++; const next = { ...body, fixture_repaired: true }; delete next.fixture_think; return { body: next, reason: 'synthetic advisor' }; });
  const r = await e.run({ fetchImpl: async (_url, _init, request) => request.body.fixture_repaired ? ok() : bad('unsupported fixture_think') });
  assert.equal(r.requests.length, 2); assert.equal(advised, 1); assert.equal(r.result.degradeNote, 'synthetic advisor');
});

test('220 abort during pending selected classifier or strip settles and cannot issue a second request', async t => {
  for (const stage of ['reject', 'strip']) {
    const e = environment(t), entered = deferred(), held = deferred(), controller = new AbortController();
    e.capabilities.register('qa.220.gate', 'kernel', () => { entered.resolve(); return held.promise; });
    custom(e, { reject: stage === 'reject' ? "return await ctx.capability('qa.220.gate');" : 'return true;', strip: stage === 'strip' ? "await ctx.capability('qa.220.gate');delete body.fixture_think;return body;" : 'delete body.fixture_think;return body;' });
    await e.boot();
    const pending = e.run({ signal: controller.signal, fetchImpl: async () => bad('unsupported fixture_think') });
    await entered.promise; controller.abort(new Error('220 canceled ' + stage));
    let timer;
    try { await Promise.race([assert.rejects(pending, new RegExp('220 canceled ' + stage)), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cancellation did not settle')), 1000); })]); }
    finally { clearTimeout(timer); held.resolve(true); }
    await Promise.resolve(); assert.equal(e.requests.length, 1);
  }
});

test('220 pending selected strip remains within the existing five-second request timeout', async t => {
  const e = environment(t, { timeoutMs: 5000 }), held = deferred();
  e.capabilities.register('qa.220.gate', 'kernel', () => held.promise);
  custom(e, { strip: "await ctx.capability('qa.220.gate');delete body.fixture_think;return body;" }); await e.boot();
  const started = Date.now();
  try { await assert.rejects(e.run({ fetchImpl: async () => bad('unsupported fixture_think') }), /模型请求超时/); }
  finally { held.resolve(); }
  assert.ok(Date.now() - started >= 4900); assert.equal(e.requests.length, 1);
});

test('220 219 mode policy and absent dialect behavior remain unchanged', async t => {
  const e = environment(t, { thinkingMode: 'auto', thinkingEffort: '', temperature: 0.31 }); await e.boot();
  const initial = await e.run(); assert.deepEqual(policy(initial.requests[0].body), {}); assert.equal(initial.requests[0].body.temperature, 0.31);
  e.config.update({ api: { thinkingEffort: 'off' } }); e.reloadSaved();
  const off = await e.run(); assert.deepEqual(off.requests[0].body.thinking, { type: 'disabled' }); assert.equal(off.requests[0].body.temperature, 0.31);
  e.config.update({ api: { thinkingMode: 'on', thinkingEffort: 'high' } }); e.reloadSaved();
  const callOff = await e.run({ skillContext: { thinkingMode: 'off' } }); assert.deepEqual(callOff.requests[0].body.thinking, { type: 'disabled' });
  e.capabilities.unregisterOwner('llm-dialects');
  const before = e.requests.length;
  await assert.rejects(e.run({ fetchImpl: async () => bad('unknown thinking parameter') }), error => error.status === 400);
  assert.equal(e.requests.length - before, 1); assert.deepEqual(policy(e.requests.at(-1).body), {});
});
