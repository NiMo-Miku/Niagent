// Exact filesystem faults live only in an isolated child. Application consumers
// use real copied production code, appended composition layers and loopback HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createBlocklistRawController } from '../src/console/blocklist-raw.js';

const workspace = path.resolve(import.meta.dirname, '..');
const qa = path.join(workspace, '.qa-local/v04-parity-20261016/config245');
const check = (report, name) => { report.checks.push(name); console.log('✓ 245 ' + name); };
const secret = 'synthetic245-never-log-credential';
const bad = Buffer.from(`{"apiKey":"${secret}", invalid`);
function removeTemporary(root, prefix) {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith(prefix));
  fs.rmSync(root, { recursive: true, force: true });
}

function isolatedChecks() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-config245-unit-'));
  const report = { checks: [] };
  const rename = fs.renameSync, read = fs.readFileSync, now = Date.now;
  const fixture = name => {
    const dir = path.join(root, name), messages = [];
    fs.mkdirSync(dir);
    const config = createConfig({ dataDir: dir, defaults: buildDefaultConfig(), log: { warn: message => messages.push(message) } });
    return { dir, config, messages, backups: () => fs.readdirSync(dir).filter(name => name.startsWith('config.json.corrupt-')) };
  };
  const fault = (f, action, operation = 'rename') => {
    let hits = 0;
    if (operation === 'rename') fs.renameSync = (source, target) => {
      if (source === f.config.file && path.dirname(target) === f.dir && path.basename(target).startsWith('config.json.corrupt-')) {
        hits++; throw Object.assign(new Error(secret), { code: 'EACCES' });
      }
      return rename(source, target);
    };
    else fs.readFileSync = (source, ...args) => {
      if (source === f.config.file && args[0] === 'utf8') {
        hits++; throw Object.assign(new Error(secret), { code: 'EIO' });
      }
      return read(source, ...args);
    };
    try { action(); } finally { fs.renameSync = rename; fs.readFileSync = read; }
    assert.equal(hits, 1, 'only the intended load operation is faulted');
  };
  const safeLog = messages => {
    assert.ok(!messages.join('\n').includes(secret), 'diagnostics contain no synthetic credential or exception message');
    assert.match(messages.join('\n'), /首次加载为默认配置/);
    assert.match(messages.join('\n'), /后续保存会覆盖全量 config\.json/);
  };
  try {
    const missing = fixture('missing');
    assert.equal(missing.config.load(), missing.config.get());
    assert.equal(missing.config.get().persona.botName, '小鲸鱼');
    assert.equal(fs.existsSync(missing.config.file), false);
    assert.deepEqual(missing.messages, []);
    check(report, 'missing config preserves defaults, return identity and no eager file write');

    const good = fixture('backup-success');
    fs.writeFileSync(good.config.file, bad);
    assert.equal(good.config.load(), good.config.get());
    assert.equal(fs.existsSync(good.config.file), false);
    assert.equal(good.backups().length, 1);
    assert.deepEqual(fs.readFileSync(path.join(good.dir, good.backups()[0])), bad);
    assert.match(good.messages[0], /JSON 语法错误.*已备份到/);
    assert.ok(!good.messages[0].includes('备份失败'));
    safeLog(good.messages);
    good.config.update({ persona: { botName: 'saved-after-backup' } });
    assert.equal(JSON.parse(fs.readFileSync(good.config.file)).persona.botName, 'saved-after-backup');
    assert.deepEqual(fs.readFileSync(path.join(good.dir, good.backups()[0])), bad);
    check(report, 'real successful rename preserves exact corrupt bytes and later normal save remains writable');

    const denied = fixture('backup-denied');
    fs.writeFileSync(denied.config.file, bad);
    fault(denied, () => assert.equal(denied.config.load(), denied.config.get()));
    assert.deepEqual(denied.backups(), []);
    assert.deepEqual(fs.readFileSync(denied.config.file), bad);
    assert.equal(denied.config.get().persona.botName, '小鲸鱼');
    assert.match(denied.messages[0], /备份失败（EACCES）.*原 config\.json 仍在原位，未改写/);
    assert.ok(!denied.messages[0].includes('已备份'));
    safeLog(denied.messages);
    denied.config.update({ persona: { botName: 'explicit-recovery-save' } });
    assert.equal(JSON.parse(fs.readFileSync(denied.config.file)).persona.botName, 'explicit-recovery-save');
    assert.deepEqual(denied.backups(), [], 'failed backup never acquires a fake success file');
    check(report, 'isolated exact-target rename denial reports failure, retains original bytes and does not freeze later saves');

    const collision = fixture('collision');
    Date.now = () => 245;
    fs.writeFileSync(path.join(collision.dir, 'config.json.corrupt-245'), 'older-backup-0');
    fs.writeFileSync(path.join(collision.dir, 'config.json.corrupt-245-1'), 'older-backup-1');
    fs.writeFileSync(collision.config.file, bad);
    try { collision.config.load(); } finally { Date.now = now; }
    assert.equal(fs.readFileSync(path.join(collision.dir, 'config.json.corrupt-245'), 'utf8'), 'older-backup-0');
    assert.equal(fs.readFileSync(path.join(collision.dir, 'config.json.corrupt-245-1'), 'utf8'), 'older-backup-1');
    assert.deepEqual(fs.readFileSync(path.join(collision.dir, 'config.json.corrupt-245-2')), bad);
    assert.match(collision.messages[0], /已备份到 config\.json\.corrupt-245-2/);
    check(report, 'existing timestamp and suffix backups remain byte-for-byte intact');

    const unreadable = fixture('read-denied');
    const validBytes = Buffer.from(JSON.stringify({ api: { apiKey: secret }, persona: { botName: 'unreadable-user-value' } }));
    fs.writeFileSync(unreadable.config.file, validBytes);
    fault(unreadable, () => unreadable.config.load(), 'read');
    assert.equal(unreadable.config.get().persona.botName, '小鲸鱼');
    assert.equal(fs.existsSync(unreadable.config.file), false);
    assert.equal(unreadable.backups().length, 1);
    assert.deepEqual(fs.readFileSync(path.join(unreadable.dir, unreadable.backups()[0])), validBytes);
    assert.match(unreadable.messages[0], /读取错误 EIO.*已备份到/);
    assert.ok(!unreadable.messages[0].includes('JSON 语法错误'));
    safeLog(unreadable.messages);
    check(report, 'exact-target read failure is identified without claiming JSON corruption or exposing error text');

    const repeated = fixture('repeated-load');
    repeated.config.update({ persona: { botName: 'current-memory-value' } });
    let notices = 0;
    repeated.config.onChange(() => notices++);
    const current = repeated.config.get();
    fs.writeFileSync(repeated.config.file, bad);
    assert.equal(repeated.config.load(), current, 'repeated failed load keeps the original in-memory object');
    assert.equal(repeated.config.get().persona.botName, 'current-memory-value');
    assert.equal(notices, 0);
    safeLog(repeated.messages);
    check(report, 'failed repeated load preserves current memory and original notification/return semantics');

    const healthy = fixture('healthy-write-contract');
    fs.writeFileSync(healthy.config.file, '\uFEFF' + JSON.stringify({ api: { apiKey: secret }, providers: [{ id: 'p245', apiKey: secret }], blocklist: { '245': ['111'] } }));
    healthy.config.load();
    healthy.config.update({ api: { model: 'local-model245' }, providers: [{ id: 'p245', name: 'renamed' }] });
    assert.equal(healthy.config.get().api.apiKey, secret);
    assert.equal(healthy.config.get().providers[0].apiKey, secret);
    const controller = createBlocklistRawController({ config: healthy.config });
    const before = controller.get().fields.blocklist;
    controller.put({ patch: { blocklist: { '245': ['222'] } }, expected: { blocklist: { source: before.source, revision: before.revision } } });
    const disk = fs.readFileSync(healthy.config.file), memory = healthy.config.get();
    assert.throws(() => controller.put({ patch: { blocklist: {} }, expected: { blocklist: { source: before.source, revision: before.revision } } }), error => error.status === 409);
    let noticesAfter = 0;
    healthy.config.onChange(() => noticesAfter++);
    fs.renameSync = (source, target) => {
      if (source === healthy.config.file + '.tmp' && target === healthy.config.file) throw Object.assign(new Error('synthetic save failure'), { code: 'EACCES' });
      return rename(source, target);
    };
    try { assert.throws(() => healthy.config.update({ persona: { botName: 'not-committed' } })); }
    finally { fs.renameSync = rename; }
    assert.equal(healthy.config.get(), memory);
    assert.deepEqual(fs.readFileSync(healthy.config.file), disk);
    assert.equal(noticesAfter, 0);
    healthy.config.update({ persona: { botName: 'committed-retry' } });
    assert.equal(noticesAfter, 1);
    assert.equal(healthy.config.get().api.apiKey, secret);
    assert.equal(fs.existsSync(healthy.config.file + '.tmp'), false);
    assert.deepEqual(healthy.messages, []);
    check(report, 'valid BOM load, secret retention, raw CAS and atomic-save failure memory/notification contracts remain unchanged');
    console.log('UNIT245 ' + JSON.stringify(report));
  } finally {
    fs.renameSync = rename; fs.readFileSync = read; Date.now = now;
    removeTemporary(root, 'qqa-config245-unit-');
  }
}

async function applicationChecks(report) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-config245-app-'));
  const applications = [], origins = new Set();
  const calls = { externalFetch: 0, model: 0, send: 0 };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!origins.has(url.origin)) { calls.externalFetch++; throw Error('245 forbids external HTTP'); }
    return nativeFetch(input, options);
  };
  try {
    for (const name of ['src', 'bundled', 'ui']) fs.cpSync(path.join(workspace, name), path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.symlinkSync(path.join(workspace, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const { createApplication } = await import(pathToFileURL(path.join(root, 'src/kernel/composition.js')));
    const { defaultComponents } = await import(pathToFileURL(path.join(root, 'bundled/runtime-defaults/components.js')));
    const replaceDir = path.join(root, 'overrides/10-config245'), wrapDir = path.join(root, 'overrides/20-config245-wrap');
    fs.mkdirSync(replaceDir, { recursive: true }); fs.mkdirSync(wrapDir);
    const replacement = { version: 2, id: 'config245-replace', order: 10, components: { 'runtime.config': { module: './implementation.mjs', export: 'replace' } } };
    const wrapper = { version: 2, id: 'config245-wrap', order: 20, enabled: false, components: { 'runtime.config': { module: './implementation.mjs', export: 'wrap', mode: 'wrap' } } };
    fs.writeFileSync(path.join(replaceDir, 'implementation.mjs'), `
import { createConfig } from '../../src/kernel/config.js';
export function replace(options) {
  const config = createConfig({ ...options, defaults: { ...options.defaults, persona: { ...options.defaults.persona, botName: 'replacement245' } } });
  config.trace245 = ['replace'];
  return config;
}
`);
    fs.writeFileSync(path.join(wrapDir, 'implementation.mjs'), `
export function wrap(previous) { return options => {
  const config = previous(options), load = config.load.bind(config), update = config.update.bind(config);
  config.trace245.push('wrap'); config.loads245 = 0; config.updates245 = 0;
  config.load = (...args) => { config.loads245++; return load(...args); };
  config.update = (...args) => { config.updates245++; return update(...args); };
  return config;
}; }
`);
    const writeManifests = () => {
      fs.writeFileSync(path.join(replaceDir, 'composition.json'), JSON.stringify(replacement));
      fs.writeFileSync(path.join(wrapDir, 'composition.json'), JSON.stringify(wrapper));
    };
    report.generations = [];
    for (const [index, mode] of ['replace', 'wrap', 'disabled-default'].entries()) {
      wrapper.enabled = mode === 'wrap'; replacement.enabled = mode !== 'disabled-default'; writeManifests();
      const dataDir = path.join(root, `synthetic-data-${index}`);
      fs.mkdirSync(dataDir); fs.writeFileSync(path.join(dataDir, 'config.json'), bad);
      let callbacks;
      const application = await createApplication({
        appRoot: root, headless: true,
        env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent-source') },
        transport: { id: 'passive245', selfId: '9245', everConnected: true, segmentSupport: ['text'], actions: {}, bind(context) { callbacks = context; }, start() { callbacks.onStatus({ connected: true, selfId: '9245' }); }, stop() {}, status: () => ({ connected: true, selfId: '9245' }), send() { calls.send++; throw Error('245 forbids sends'); } },
        fetchImpl: async () => { calls.externalFetch++; throw Error('245 forbids external HTTP'); },
        priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true, remote: false }) },
        communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }), getBlocklist: () => ({ ok: true, ids: [] }), listAccounts: () => ({ ok: true, accounts: [] }) },
        components: { 'runtime.logger': options => defaultComponents['runtime.logger']({ ...options, mirrorConsole: false }), 'llm.complete': async () => { calls.model++; throw Error('245 forbids model calls'); } },
      });
      applications.push(application);
      const expectedName = mode === 'disabled-default' ? '小鲸鱼' : 'replacement245';
      assert.equal(application.config.get().persona.botName, expectedName, 'kernel load consumes the selected config defaults after corruption');
      const backups = fs.readdirSync(dataDir).filter(name => name.startsWith('config.json.corrupt-'));
      assert.equal(backups.length, 1);
      assert.deepEqual(fs.readFileSync(path.join(dataDir, backups[0])), bad);
      if (mode === 'disabled-default') {
        assert.equal(application.components['runtime.config'], defaultComponents['runtime.config']);
        assert.equal(application.composition.owners['runtime.config'], 'defaults');
        assert.equal(application.config.trace245, undefined);
      } else {
        assert.deepEqual(application.config.trace245, mode === 'wrap' ? ['replace', 'wrap'] : ['replace']);
        assert.equal(application.composition.owners['runtime.config'], mode === 'wrap' ? 'config245-wrap' : 'config245-replace');
        if (mode === 'wrap') assert.equal(application.config.loads245, 1);
      }
      application.config.update({ server: { token: 'synthetic245-console-token' }, telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false }, });
      application.orchestrator.pause();
      const port = await application.start(), base = `http://127.0.0.1:${port}`;
      assert.notEqual(port, 15967); origins.add(base);
      await application.services.idle();
      const request = async (route, method = 'GET', body) => {
        const response = await fetch(base + route, { method, headers: { 'x-console-token': 'synthetic245-console-token', origin: base, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, body: await response.json() };
      };
      const view = await request('/api/config');
      assert.equal(view.status, 200); assert.equal(view.body.persona.botName, expectedName);
      assert.equal(view.body.server.token, undefined); assert.equal(view.body.server.hasToken, true);
      const logs = await request('/api/logs');
      const warning = logs.body.logs.find(entry => entry.msg.includes('config.json 读取或解析失败'));
      assert.ok(warning, 'the real log HTTP consumer exposes the recovery diagnostic');
      assert.match(warning.msg, /已备份到.*首次加载为默认配置.*后续保存会覆盖/);
      assert.ok(!JSON.stringify(logs.body).includes(secret));
      const saved = await request('/api/config', 'POST', { persona: { botName: `recovered-${mode}` }, api: { apiKey: secret } });
      assert.equal(saved.status, 200);
      assert.equal((await request('/api/config', 'POST', { api: { model: 'synthetic245' } })).status, 200);
      assert.equal(JSON.parse(fs.readFileSync(application.config.file)).api.apiKey, secret);
      assert.equal((await request('/api/config')).body.persona.botName, `recovered-${mode}`);
      const raw = (await request('/api/blocklist-raw')).body.fields.blocklist;
      const oldVersion = { source: raw.source, revision: raw.revision };
      assert.equal((await request('/api/blocklist-raw', 'PUT', { patch: { blocklist: { '245': ['111'] } }, expected: { blocklist: oldVersion } })).status, 200);
      const committed = fs.readFileSync(application.config.file);
      assert.equal((await request('/api/blocklist-raw', 'PUT', { patch: { blocklist: {} }, expected: { blocklist: oldVersion } })).status, 409);
      assert.deepEqual(fs.readFileSync(application.config.file), committed);
      if (mode === 'wrap') assert.ok(application.config.updates245 >= 3, 'actual HTTP saves call the selected wrapper');
      assert.deepEqual(fs.readFileSync(path.join(dataDir, backups[0])), bad);
      await application.stop();
      assert.equal(application.scheduler.count(), 0); assert.equal(fs.existsSync(path.join(dataDir, 'qq-agent.lock')), false);
      report.generations.push({ mode, configOwner: application.composition.owners['runtime.config'], diagnosticVisible: true, recoverySave: 200, staleRawCas: 409, stopped: true });
      check(report, `real createApplication ${mode}: selected config, backup bytes, HTTP diagnostic/recovery, secret retention, CAS and cleanup`);
    }
    assert.deepEqual(calls, { externalFetch: 0, model: 0, send: 0 }); report.calls = calls;
  } finally {
    try { for (const application of applications) await application.stop(); }
    finally { globalThis.fetch = nativeFetch; removeTemporary(root, 'qqa-config245-app-'); }
  }
}

if (process.env.QA245_UNIT_CHILD === '1') isolatedChecks();
else {
  const report = { startedAt: new Date().toISOString(), checks: [], scope: 'isolated synthetic filesystem + real composed application/HTTP; no browser or full regression' };
  try {
    const child = spawnSync(process.execPath, [path.join(import.meta.dirname, '245-config-corrupt-diagnostic-test.mjs')], { env: { ...process.env, QA245_UNIT_CHILD: '1' }, encoding: 'utf8', timeout: 30000 });
    report.childExit = child.status;
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 0);
    const line = child.stdout.split('\n').find(line => line.startsWith('UNIT245 '));
    assert.ok(line); report.checks.push(...JSON.parse(line.slice(8)).checks);
    await applicationChecks(report); report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; throw error; }
  finally {
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(qa, { recursive: true });
    fs.writeFileSync(path.join(qa, `result-${report.startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2));
  }
}
