// Host-only offline fixture. Never imported by an extension or used as its API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPluginLoader, readManifest, normalizeManifest } from '../../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../../src/kernel/tools.js';
import { createCapabilityRegistry } from '../../src/kernel/capability.js';
import { createPermissions } from '../../src/kernel/permissions.js';
import { createScheduler } from '../../src/kernel/scheduler.js';
import { createStorage } from '../../src/kernel/storage.js';
import { createConfig, buildDefaultConfig } from '../../src/kernel/config.js';
import { createSdkAccess } from '../../src/kernel/sdk-services.js';
import { Bus } from '../../src/kernel/bus.js';

const clone = value => value === undefined ? undefined : structuredClone(value);
const secretValues = new Set();
const SECRET_KEY = /(?:api.?key|access.?token|authorization|password|private.?key|secret|cookie|^token$)/i;
function rememberSecrets(value, schema = {}) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const rule = schema[key];
    if ((SECRET_KEY.test(key) || rule?.secret === true || rule?.sensitive === true || rule?.format === 'password') && typeof item === 'string' && item) secretValues.add(item);
    rememberSecrets(item);
  }
}
function redact(value, key = '') {
  if (SECRET_KEY.test(key) && !/^has[A-Z]/.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    for (const secret of [...secretValues].sort((a, b) => b.length - a.length)) value = value.replaceAll(secret, '[REDACTED]');
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redact(item));
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
}
function subset(actual, expected, label = 'value') {
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') throw new Error(`${label} 应为对象`);
    if (Array.isArray(expected)) assert.equal(actual.length, expected.length, `${label} 数组长度`);
    for (const [key, value] of Object.entries(expected)) subset(actual[key], value, `${label}.${key}`);
  } else assert.deepEqual(actual, expected, label);
}
function clean(value) {
  if (typeof value === 'function' || value instanceof AbortSignal) return undefined;
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clean);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]).filter(([, item]) => item !== undefined));
}
async function delay(ms, signal) {
  if (signal?.aborted) throw signal.reason;
  if (!(ms > 0)) return;
  await new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const abort = () => finish(signal.reason ?? new Error('操作已中止'));
    const timer = setTimeout(() => finish(), ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function run(directory, definition, root) {
  const errors = [], calls = [], sends = [], transport = [], results = [], violations = [];
  let loader, permissions, scheduler, timersAfterStop = null, storageValue = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { const message = '离线自检拒绝全局 fetch；请使用 ctx.http.fetch 与用例 HTTP 夹具'; violations.push(message); throw new Error(message); };
  const log = { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } };
  try {
    const raw = readManifest(directory).raw;
    const manifest = normalizeManifest(structuredClone(raw), path.basename(directory)).manifest;
    rememberSecrets(manifest.settings, manifest.configSchema); rememberSecrets(definition.config, manifest.configSchema); rememberSecrets(definition);
    for (const name of ['bundled', 'skills', 'plugins']) fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    const kind = manifest.kind === 'plugin' ? 'plugins' : 'skills';
    fs.cpSync(directory, path.join(root, kind, manifest.id), { recursive: true });
    if (manifest.legacy) {
      const source = fileURLToPath(new URL('../../bundled/compat-04/', import.meta.url));
      fs.cpSync(source, path.join(root, 'bundled', 'compat-04'), { recursive: true });
    }
    const dataDir = path.join(root, 'data');
    const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
    config.update({ skills: { watch: false, [manifest.id]: { enabled: true, settings: definition.config ?? {} } } });
    const bus = new Bus(log);
    permissions = createPermissions({ log, bus, headless: false, dataDir });
    const choices = definition.permissions ?? {};
    for (const [scope, value] of Object.entries(choices)) {
      if (!['allow', 'deny'].includes(value)) throw new Error(`测试权限 ${scope} 必须为 allow 或 deny`);
      if (!manifest.permissions.some(item => (item === 'web_fetch' ? 'net.outbound' : item) === scope) && !['fs.namespace', 'scheduler'].includes(scope)) throw new Error(`用例不能批准清单未声明的权限 ${scope}`);
    }
    permissions.onAsk(request => permissions.resolveAsk(request.id, choices[request.scope] === 'allow' ? 'always' : 'deny'));
    const capabilities = createCapabilityRegistry({ log });
    const registry = createToolRegistry({ log, bus, permissions, capabilities });
    scheduler = createScheduler({ log });
    const storage = createStorage({ dataDir, log });
    const fetchFixture = async (url, options = {}) => {
      const index = calls.length, expected = definition.http?.[index];
      let requestJson;
      if (typeof options.body === 'string') { try { requestJson = JSON.parse(options.body); } catch {} }
      const request = { url: String(url), method: String(options.method ?? 'GET').toUpperCase(), headers: Object.fromEntries(new Headers(options.headers).entries()), json: requestJson, body: options.body };
      rememberSecrets(request);
      calls.push(clean(request));
      if (!expected || request.url !== expected.url || request.method !== String(expected.method ?? 'GET').toUpperCase()) {
        const message = `HTTP 请求没有匹配离线夹具 #${index + 1}：${request.method} ${request.url}`; violations.push(message); throw new Error(message);
      }
      try { if (expected.request) subset(request, expected.request, `http[${index}].request`); }
      catch (error) { violations.push(error.message); throw error; }
      await delay(expected.responseDelayMs, options.signal);
      if (expected.error) throw new Error(String(expected.error));
      const status = expected.status ?? 200;
      const body = expected.bodyBase64 !== undefined ? Buffer.from(expected.bodyBase64, 'base64') : expected.json !== undefined ? JSON.stringify(expected.json) : expected.body ?? '';
      const response = new Response([204, 205, 304].includes(status) ? null : body, { status, headers: { ...(expected.json !== undefined ? { 'content-type': 'application/json' } : {}), ...expected.headers } });
      Object.defineProperty(response, 'url', { value: String(url) }); return response;
    };
    const sendFixture = method => async (chatKey, ...args) => {
      const options = args.at(-1);
      if (options?.signal?.aborted) throw options.signal.reason;
      await delay(definition.sendDelayMs, options?.signal);
      sends.push(clean({ method, chatKey, args }));
      if (definition.sendError) throw new Error(String(definition.sendError));
      const receipt = clone(definition.sendResult ?? { ok: true, sent: [{ index: 0, text: '[offline fixture]', msgId: sends.length, at: 1 }], failed: [] });
      // Records indicate a controlled host API call, never actual QQ delivery.
      transport.push({ chatKey, method, accepted: receipt.ok === true }); return receipt;
    };
    const facets = {
      'core.send': Object.fromEntries(['sendTextBatch', 'sendImage', 'sendSticker', 'sendSegments', 'poke'].map(method => [method, sendFixture(method)])),
      'compat04.http': { fetchFor: fetchFixture },
    };
    const sdk = createSdkAccess({ config, permissions, loaderOf: () => loader, facets, bus });
    loader = createPluginLoader({ appRoot: root, log, bus, config, permissions, capabilityRegistry: capabilities, registry, scheduler, storage,
      sdkHost: { ...sdk, send: facets['core.send'].sendSegments, fetch: fetchFixture, emit() { throw new Error('离线自检不开放宿主写事件'); } } });
    for (const [name, provider] of Object.entries(facets)) capabilities.register(name, 'kernel', provider);
    await loader.loadAll();
    const entry = loader.hostEntry(manifest.id);
    const expectedStatus = definition.expect.status ?? 'active';
    assert.equal(entry?.status, expectedStatus, `加载状态：${entry?.loadError ?? ''}`);
    const loadedStatus = entry?.status;
    if (entry?.status === 'active') {
      // Apply explicit deny even for default-allowed namespace/scheduler scopes.
      for (const [scope, value] of Object.entries(choices)) {
        if (!permissions.setOverride(manifest.id, scope, value, { fingerprint: entry.fingerprint })) throw new Error(`无法设置测试权限 ${scope}`);
      }
      const inputs = definition.inputs ?? (definition.input ? [definition.input] : []);
      for (const input of inputs) {
        const controller = new AbortController();
        const timer = input.cancelAfterMs === undefined ? null : setTimeout(() => controller.abort(new Error('自检调用已取消')), input.cancelAfterMs);
        const stopTimer = input.stopAfterMs === undefined ? null : setTimeout(() => loader.unload(manifest.id, 'offline-test-stop'), input.stopAfterMs);
        try {
          const ids = registry.byOwner(manifest.id);
          const id = ids.includes(input.tool) ? input.tool : ids.find(value => value.endsWith(`__${String(input.tool).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 38)}`));
          const receipt = await registry.invoke(id ?? input.tool, input.args ?? {}, { execCtx: { chatKey: input.chatKey, signal: controller.signal, botName: 'Offline test', session: { id: 'test-session' } } });
          results.push(clean(receipt));
        } finally { clearTimeout(timer); clearTimeout(stopTimer); }
      }
    }
    try { storageValue = JSON.parse(fs.readFileSync(path.join(dataDir, 'plugins', manifest.id, 'kv.json'), 'utf8')); } catch {}
    const expected = definition.expect, last = results.at(-1);
    const verify = (label, fn) => { try { fn(); } catch (error) { errors.push(`${label}: ${error.message}`); } };
    if (results.length || Object.hasOwn(expected, 'ok')) verify('invoke.ok', () => assert.equal(last?.ok, expected.ok ?? true));
    if (Object.hasOwn(expected, 'result')) verify('result', () => subset(last?.result, expected.result));
    if (Object.hasOwn(expected, 'resultIncludes')) verify('resultIncludes', () => assert.ok((typeof last?.result === 'string' ? last.result : JSON.stringify(last?.result) ?? '').includes(expected.resultIncludes)));
    if (expected.errorIncludes) verify('errorIncludes', () => assert.ok(String(last?.error ?? '').includes(expected.errorIncludes), `预期错误含 ${expected.errorIncludes}`));
    if (expected.results) verify('results', () => subset(results, expected.results));
    if (expected.sends) verify('sends', () => subset(sends, expected.sends));
    if (expected.storage) verify('storage', () => subset(storageValue, expected.storage));
    if (Object.hasOwn(expected, 'sendCount')) verify('sendCount', () => assert.equal(sends.length, expected.sendCount));
    if (Object.hasOwn(expected, 'httpCount')) verify('httpCount', () => assert.equal(calls.length, expected.httpCount));
    if (calls.length !== (definition.http?.length ?? 0)) errors.push(`HTTP 夹具消费 ${calls.length}/${definition.http?.length ?? 0}，存在未使用或多余请求`);
    errors.push(...violations);
    const toolsBeforeStop = registry.byOwner(manifest.id).length;
    const lifecycleSignal = entry?.ctx?.lifecycle.signal;
    loader.stopAll(); scheduler.stop(); permissions.close();
    timersAfterStop = scheduler.count();
    assert.equal(registry.byOwner(manifest.id).length, 0, '停用后工具应撤销');
    assert.equal(timersAfterStop, 0, '停用后定时器应回收');
    if (lifecycleSignal) assert.equal(lifecycleSignal.aborted, true, '停用后实例取消信号应中止');
    return { ok: errors.length === 0, name: definition.name ?? 'unnamed', errors, status: loadedStatus, results, sends, http: calls, storage: clean(storageValue), lifecycle: { toolsBeforeStop, toolsAfterStop: 0, timersAfterStop, abortedAfterStop: lifecycleSignal?.aborted ?? null }, offline: true };
  } catch (error) {
    return { ok: false, name: definition.name ?? 'unnamed', errors: [...errors, String(error?.message ?? error)], results, sends, http: calls, offline: true };
  } finally {
    loader?.stopAll(); scheduler?.stop(); permissions?.close(); globalThis.fetch = originalFetch;
    if (fs.existsSync(root)) {
      const tempRoot = fs.realpathSync(os.tmpdir()), resolved = fs.realpathSync(root), relative = path.relative(tempRoot, resolved);
      if (fs.lstatSync(root).isSymbolicLink() || !path.basename(root).startsWith('qq-agent-extension-check-') || !relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('自检临时目录身份已改变，拒绝递归清理');
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

process.once('message', async ({ directory, definition, tempRoot }) => {
  let result;
  try { result = redact(await run(directory, definition, tempRoot)); }
  catch (error) { result = redact({ ok: false, name: definition.name ?? 'unnamed', errors: [String(error?.message ?? error)] }); }
  if (process.send) process.send(result, () => process.exit(0));
});
