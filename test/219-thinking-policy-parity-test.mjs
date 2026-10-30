// Offline production completion path: real saved/reloaded config, composition,
// plugin loader and registered dialect. HTTP is an in-process request fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import { loadComposition } from '../src/kernel/composition.js';
import { buildThinkingParams } from '../bundled/llm-dialects/dialects.js';

const retainedOutput = process.argv[2] ? path.resolve(process.argv[2]) : null;
const plain = [{ role: 'user', content: 'synthetic thinking request' }];
const image = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }];
const video = [{ role: 'user', content: [{ type: 'video_url', video_url: { url: 'https://media.fixture/not-downloaded' } }, ...image[0].content] }];
const thinkingKeys = ['thinking', 'enable_thinking', 'thinking_budget', 'reasoning_effort', 'reasoning', 'extra_body', 'think'];
const thinking = body => Object.fromEntries(thinkingKeys.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const success = () => new Response(JSON.stringify({ model: 'fixture-result', choices: [{ message: { role: 'assistant', content: 'fixture response' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), { headers: { 'content-type': 'application/json' } });

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

test('219 saved/reloaded effort off and model default reach actual serialized requests; controls stay intact', async t => {
  for (const row of [
    { mode: 'auto', effort: 'off', expected: { thinking: { type: 'disabled' } }, temperature: 0.35 },
    { mode: 'auto', effort: '', expected: {}, temperature: 0.35 },
    { mode: 'auto', effort: 'off', baseUrl: 'https://api.openai.com/v1', model: 'o3', expected: { reasoning_effort: 'minimal' }, temperature: undefined },
    { mode: 'on', effort: 'high', context: { thinkingMode: 'off' }, expected: { thinking: { type: 'disabled' } }, temperature: 0.35 },
    { mode: 'on', effort: 'high', expected: { thinking: { type: 'enabled' } }, temperature: undefined },
  ]) {
    const e = environment(t, { thinkingMode: row.mode, thinkingEffort: row.effort, ...(row.baseUrl ? { baseUrl: row.baseUrl, model: row.model } : {}) });
    await e.boot();
    assert.equal(e.config.get().api.thinkingEffort, row.effort);
    const r = await e.run({ skillContext: row.context });
    assert.equal(r.requests.length, 1); assert.equal(r.notices.length, 1);
    assert.deepEqual(thinking(r.requests[0].body), row.expected);
    assert.equal(r.requests[0].body.temperature, row.temperature);
    assert.equal(r.result.usage.total_tokens, 5);
  }
});

test('219 call/global/effort off veto strengths and normalized auto only enables valid strengths', async t => {
  const e = environment(t); await e.boot();
  for (const row of [
    { mode: 'off', effort: 'high', context: { thinkingMode: 'on' }, type: 'disabled' },
    { mode: 'on', effort: 'off', type: 'disabled' },
    { mode: 'on', effort: 'max', context: { thinkingMode: ' OFF ' }, type: 'disabled' },
    ...['low', 'medium', 'high', 'xhigh', 'max', ' HIGH '].map(effort => ({ mode: 'auto', effort, type: 'enabled' })),
    ...['', 'illegal-strength', 'minimal', null, 42].map(effort => ({ mode: 'auto', effort, type: undefined })),
  ]) {
    e.config.update({ api: { thinkingMode: row.mode, thinkingEffort: row.effort } }); e.reloadSaved();
    const r = await e.run({ skillContext: row.context });
    assert.equal(r.requests.length, 1);
    assert.equal(r.requests[0].body.thinking?.type, row.type);
    if (!row.type) assert.deepEqual(thinking(r.requests[0].body), {});
  }
  e.config.update({ api: { baseUrl: 'https://api.openai.com/v1', model: 'o3', thinkingMode: 'on', thinkingEffort: '' } }); e.reloadSaved();
  assert.equal((await e.run()).requests[0].body.reasoning_effort, 'medium');
  e.config.update({ api: { thinkingEffort: 'invalid-on-strength' } }); e.reloadSaved();
  assert.equal((await e.run()).requests[0].body.reasoning_effort, 'medium');
  e.config.update({ api: { thinkingMode: 'auto', thinkingEffort: ' XHIGH ' } }); e.reloadSaved();
  assert.equal((await e.run()).requests[0].body.reasoning_effort, 'high');
});

test('219 real replacement dialect still builds default mode; disable restores parameter-free default', async t => {
  const e = environment(t);
  e.plugin('replacement-dialect', `export const calls=[];export function setup(ctx){ctx.registerCapability('llm.dialect',{
    detect(baseUrl,model){calls.push({kind:'detect',baseUrl,model});return 'fixture';},
    build(input){calls.push({kind:'build',...input});return {params:{fixture_think:input.mode},omitTemperature:true};},
  });}`);
  await e.boot();
  const r = await e.run();
  assert.equal(r.requests[0].body.fixture_think, 'default');
  assert.equal(r.requests[0].body.temperature, undefined);
  const calls = e.loader.hostEntry('replacement-dialect').instance.calls;
  assert.deepEqual(calls.map(row => row.kind), ['detect', 'build']);
  assert.deepEqual(calls[1], { kind: 'build', mode: 'default', effort: '', on: false, budget: 0, dialect: 'fixture' });
  await e.loader.setEnabled('replacement-dialect', false);
  const restored = await e.run();
  assert.deepEqual(thinking(restored.requests[0].body), {});
  assert.equal(restored.requests[0].body.fixture_think, undefined);
  assert.equal(restored.requests[0].body.temperature, 0.35);
  assert.deepEqual(buildThinkingParams({ dialect: 'deepseek', on: false }).params, { thinking: { type: 'disabled' } });
  assert.deepEqual(buildThinkingParams({ dialect: 'deepseek', mode: 'default', on: false }).params, {});
  assert.equal(buildThinkingParams({ dialect: 'openai-o', on: true, effort: 'illegal-strength' }).params.reasoning_effort, 'medium');
});

test('219 appended llm.thinking file changes real requests and disabling the layer restores defaults', async t => {
  const e = environment(t, { baseUrl: 'https://api.openai.com/v1', model: 'o3' });
  const layer = e.layer(`export async function resolve({api,context,signal}){if(signal?.aborted)throw signal.reason;if(api.model!=='o3'||!context.messages)throw new Error('wrong policy input');await Promise.resolve();return {mode:'on',on:true,effort:'low',budget:0};}`);
  await e.boot();
  assert.equal(e.composition.owners['llm.thinking'], 'qa-thinking');
  const replaced = await e.run();
  assert.equal(replaced.requests[0].body.reasoning_effort, 'low');
  assert.equal(replaced.requests.length, 1);
  layer.disable(); await e.reloadComposition();
  assert.equal(e.components['llm.thinking'], defaults['llm.thinking']);
  const restored = await e.run();
  assert.deepEqual(thinking(restored.requests[0].body), {});
  assert.equal(restored.requests[0].body.temperature, 0.35);
});

test('219 abort during async policy settles without HTTP and discards late completion', async t => {
  const e = environment(t); await e.boot();
  const controller = new AbortController(), entered = deferred(), held = deferred();
  let invoked = 0;
  const components = { ...e.components, 'llm.thinking': async ({ signal }) => { invoked++; assert.equal(signal, controller.signal); entered.resolve(); await held.promise; return { mode: 'on', on: true, effort: 'high', budget: 0 }; } };
  const pending = e.run({ components, signal: controller.signal }); await entered.promise;
  controller.abort(new Error('fixture policy canceled'));
  let timer;
  try { await Promise.race([assert.rejects(pending, /fixture policy canceled/), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('policy cancellation did not settle')), 1000); })]); }
  finally { clearTimeout(timer); held.resolve(); }
  await Promise.resolve(); assert.equal(e.requests.length, 0); assert.equal(invoked, 1);
  const early = new AbortController(); early.abort(new Error('fixture canceled before policy'));
  await assert.rejects(e.run({ signal: early.signal, components }), /fixture canceled before policy/);
  assert.equal(invoked, 1); assert.equal(e.requests.length, 0);
});

test('219 selected resolver failure is not silently replaced and transport abort cannot start fallback', async t => {
  const e = environment(t, { thinkingMode: 'on', thinkingEffort: 'high', fallbackModels: [{ model: 'backup' }] }); await e.boot();
  const bad = { ...e.components, 'llm.thinking': () => ({ mode: 'bad', on: false, effort: '' }) };
  await assert.rejects(e.run({ components: bad }), /思考策略需要返回/);
  assert.equal(e.requests.length, 0);
  const controller = new AbortController(), entered = deferred();
  const pending = e.run({ signal: controller.signal, fetchImpl: async (_url, init) => { entered.resolve(); return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })); } });
  await entered.promise; controller.abort(new Error('fixture transport canceled'));
  await assert.rejects(pending, /fixture transport canceled/);
  assert.equal(e.requests.length, 1); assert.equal(e.requests[0].body.model, 'deepseek-chat');
});

test('219 default rejection downgrade retains one retry, temperature restoration and request counts', async t => {
  const e = environment(t, { thinkingMode: 'on', thinkingEffort: 'high', temperature: 0.27 }); await e.boot();
  for (const status of [400, 422]) {
    const r = await e.run({ fetchImpl: async (_url, _init, _request, count) => count === 1 ? new Response('unsupported thinking parameter', { status }) : success() });
    assert.equal(r.requests.length, 2); assert.equal(r.notices.length, 2); assert.equal(r.result.degraded, true);
    assert.deepEqual(r.requests[0].body.thinking, { type: 'enabled' }); assert.equal(r.requests[0].body.temperature, undefined);
    assert.deepEqual(thinking(r.requests[1].body), {}); assert.equal(r.requests[1].body.temperature, 0.27);
  }
  const start = e.requests.length;
  await assert.rejects(e.run({ fetchImpl: async () => new Response('unsupported thinking parameter', { status: 400 }) }), error => error.status === 400);
  assert.equal(e.requests.length - start, 2);
  e.capabilities.unregisterOwner('llm-dialects');
  const absent = e.requests.length;
  await assert.rejects(e.run({ fetchImpl: async () => new Response('unsupported thinking parameter', { status: 400 }) }), error => error.status === 400);
  assert.equal(e.requests.length - absent, 1, 'no hidden dialect/rejection rule when its provider is absent');
});

test('219 custom dialect owns rejection handling even when policy chooses model default', async t => {
  const e = environment(t);
  e.plugin('custom-rejection', `export const calls=[];export function setup(ctx){ctx.registerCapability('llm.dialect',{
    detect(){calls.push('detect');return 'fixture';},build({mode}){calls.push('build:'+mode);return {params:{fixture_think:true},omitTemperature:true};},
    looksLikeRejection(text){calls.push('reject');return text.includes('fixture_think');},strip(body){calls.push('strip');const out={...body};delete out.fixture_think;return out;}
  });}`);
  await e.boot();
  e.capabilities.register('llm.request-params', 'kernel', ({ body }) => ({ body: { ...body, fixture_transform: true } }));
  const r = await e.run({ fetchImpl: async (_url, _init, _request, count) => count === 1 ? new Response('unsupported fixture_think', { status: 400 }) : success() });
  assert.equal(r.result.degraded, true); assert.equal(r.requests.length, 2);
  assert.equal(r.requests[0].body.fixture_think, true); assert.equal(r.requests[0].body.temperature, undefined);
  assert.equal(r.requests[1].body.fixture_think, undefined); assert.equal(r.requests[1].body.temperature, 0.35);
  assert.ok(r.requests.every(row => row.body.fixture_transform === true));
  assert.deepEqual(e.loader.hostEntry('custom-rejection').instance.calls, ['detect', 'build:default', 'reject', 'strip']);
});

test('219 thinking policy sees the effective vision/video/explicit target and per-call off survives', async t => {
  const e = environment(t, { provider: 'primary', baseUrl: 'https://primary.fixture/v1', model: 'main', thinkingMode: 'auto', thinkingEffort: 'low', visionProvider: 'vision', visionModel: 'o3', videoProvider: 'video', videoModel: 'deepseek-video' });
  e.config.update({ providers: [{ id: 'primary', baseUrl: 'https://primary.fixture/v1' }, { id: 'vision', baseUrl: 'https://api.openai.com/v1' }, { id: 'video', baseUrl: 'https://api.deepseek.com/v1' }], dshProviderKeys: { primary: 'synthetic-primary', vision: 'synthetic-vision', video: 'synthetic-video' } });
  await e.boot();
  const seen = [], components = { ...e.components, 'llm.thinking': input => { seen.push({ baseUrl: input.api.baseUrl, model: input.api.model, effort: input.api.thinkingEffort, contextMode: input.context.thinkingMode }); return defaults['llm.thinking'](input); } };
  const vision = await e.run({ messages: image, components });
  assert.equal(vision.requests[0].body.model, 'o3'); assert.equal(vision.requests[0].body.reasoning_effort, 'low'); assert.equal(vision.requests[0].authorization, 'Bearer synthetic-vision');
  const movie = await e.run({ messages: video, components });
  assert.equal(movie.requests[0].body.model, 'deepseek-video'); assert.deepEqual(movie.requests[0].body.thinking, { type: 'enabled' }); assert.equal(movie.requests[0].authorization, 'Bearer synthetic-video');
  const explicit = await e.run({ messages: image, components, overrides: { baseUrl: 'https://dashscope.fixture/v1', model: 'qwen-explicit', apiKey: '' }, skillContext: { thinkingMode: 'off', source: 'fixture-memory' } });
  assert.equal(explicit.requests[0].body.model, 'qwen-explicit'); assert.equal(explicit.requests[0].body.enable_thinking, false);
  assert.deepEqual(seen, [
    { baseUrl: 'https://api.openai.com/v1', model: 'o3', effort: 'low', contextMode: undefined },
    { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-video', effort: 'low', contextMode: undefined },
    { baseUrl: 'https://dashscope.fixture/v1', model: 'qwen-explicit', effort: 'low', contextMode: 'off' },
  ]);
});

test('219 fallback re-resolves thinking for its actual target and existing vendor budgets remain intact', async t => {
  const e = environment(t, { baseUrl: 'https://api.openai.com/v1', model: 'o3', thinkingMode: 'on', thinkingEffort: '', fallbackModels: [{ provider: 'backup', model: 'deepseek-backup' }] });
  e.config.update({ providers: [{ id: 'backup', baseUrl: 'https://api.deepseek.com/v1' }] }); await e.boot();
  const seen = [], components = { ...e.components, 'llm.thinking': input => { seen.push(input.api.model); return defaults['llm.thinking'](input); } };
  const r = await e.run({ components, fetchImpl: async (_url, _init, request) => request.body.model === 'o3' ? new Response('fixture failed', { status: 500 }) : success() });
  assert.equal(r.requests.length, 2); assert.deepEqual(seen, ['o3', 'deepseek-backup']);
  assert.equal(r.requests[0].body.reasoning_effort, 'medium'); assert.deepEqual(r.requests[1].body.thinking, { type: 'enabled' });
  for (const [baseUrl, model, expected] of [
    ['https://dashscope.fixture/v1', 'qwen', { enable_thinking: true, thinking_budget: 128 }],
    ['https://api.anthropic.com/v1', 'claude', { thinking: { type: 'enabled', budget_tokens: 128 } }],
    ['https://generativelanguage.googleapis.com/v1', 'gemini', { extra_body: { google: { thinking_config: { thinking_budget: 128 } } } }],
    ['https://openrouter.ai/api/v1', 'claude', { reasoning: { max_tokens: 128 } }],
  ]) {
    e.config.update({ api: { baseUrl, model, thinkingMode: 'auto', thinkingEffort: 'medium', thinkingBudget: 128, fallbackModels: [] } }); e.reloadSaved();
    const budget = await e.run(); assert.equal(budget.requests.length, 1); assert.deepEqual(thinking(budget.requests[0].body), expected);
  }
});
