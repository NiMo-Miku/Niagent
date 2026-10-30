// Synthetic files and real SDK/kernel/HTTP/composition consumers; no browser,
// installed extension, QQ process, external network or billed model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createLogger } from '../src/kernel/log.js';
import { createLogPolicy } from '../src/kernel/log-policy.js';
import { Bus } from '../src/kernel/bus.js';
import { createKernel } from '../src/kernel/kernel.js';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const workspace = path.resolve(import.meta.dirname, '..');
const today = () => new Date().toISOString().slice(0, 10) + '.log';
const rows = file => fs.readFileSync(file, 'utf8').trimEnd().split('\n').map(text => JSON.parse(text));
const smallPolicy = () => createLogPolicy({ maxDiskEntryBytes: 1024, maxStartupFileBytes: 4096, startupTailBytes: 2048 });
const cleanups = new Map();
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-log246-'));
  cleanups.set(root, []);
  t.after(async () => {
    for (const stop of cleanups.get(root)) await stop();
    cleanups.delete(root);
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('qqa-log246-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}

function observer(root, stateKey) {
  for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, folder));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  const dir = path.join(root, 'plugins', 'observer246'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'observer246', kind: 'plugin', version: '1.0.0', permissions: [] }));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default {setup(ctx){
    const state=globalThis[${JSON.stringify(stateKey)}];state.ctx=ctx;
    ctx.events.on('log',entry=>{if(state.mode==='none')return;state.hits++;
      if(state.hits>20)return;
      if(state.mode==='write')ctx.log.error('observer echo '+entry.msg);
      if(state.mode==='throw')throw new Error('observer synthetic failure');
    });
  }};`);
}

function kernelOptions(root, components = {}) {
  return {
    appRoot: root, env: { QQ_AGENT_DATA_DIR: path.join(root, 'data'), QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent') },
    transport: { id: 'inert246', start() {}, stop() {}, status: () => ({ connected: false }), actions: {} },
    priceUpdates: { refresh: async () => ({ ok: true, remote: false }) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
    fetchImpl: async () => { assert.fail('QA246 forbids external network'); },
    components,
  };
}

test('real SDK log observers and bus error reports cannot reenter the shared root/child logger', async t => {
  const root = temporary(t), key = '__qa246_' + randomUUID();
  const state = globalThis[key] = { mode: 'none', hits: 0 }; observer(root, key);
  const app = createKernel(kernelOptions(root, { 'runtime.logger': options => createLogger({ ...options, mirrorConsole: false }) }));
  cleanups.get(root).push(async () => { await app.stop(); delete globalThis[key]; });
  await app.loader.loadAll(); assert.equal(app.loader.isActive('observer246'), true);
  const file = path.join(app.dataDir, 'logs', today());
  for (const mode of ['write', 'throw']) {
    state.mode = mode; state.hits = 0;
    const prior = rows(file).length;
    app.log.error('outer ' + mode);
    assert.equal(state.hits, 1, 'SDK child writes and Bus error logging are dropped only during the outer record');
    assert.equal(rows(file).length, prior + 1);
    assert.equal(app.log.recent({ n: 1 })[0].msg, 'outer ' + mode);
    state.hits = 0; app.log.child('independent').error('next ' + mode); assert.equal(state.hits, 1);
  }
  state.mode = 'none';
  await app.loader.setEnabled('observer246', false);
  const before = state.hits; app.log.error('observer disabled'); assert.equal(state.hits, before);
  await app.loader.setEnabled('observer246', true); assert.equal(app.loader.isActive('observer246'), true);
  state.mode = 'write'; state.hits = 0; app.log.info('observer restored'); assert.equal(state.hits, 1);
  state.mode = 'none';
  const bad = { toJSON() { throw new Error('bad json'); }, toString() { throw new Error('bad string'); } };
  assert.throws(() => app.log.info(bad), /bad string/);
  app.log.info('guard released after formatting error'); assert.equal(app.log.recent({ n: 1 })[0].msg, 'guard released after formatting error');
});

test('disk budget is UTF-8 bytes of valid JSONL, with honest markers and complete ring/bus diagnostics', t => {
  const root = temporary(t), logger = createLogger({ dataDir: root, mirrorConsole: false, policy: smallPolicy() });
  const bus = new Bus(logger), observed = []; logger.setBus(bus); bus.on('log', entry => observed.push(entry));
  const text = '中文😀\n\t"\\'.repeat(1500);
  logger.child('budget').warn(text, { object: text });
  const file = path.join(root, 'logs', today()), disk = fs.readFileSync(file);
  assert.ok(disk.length <= 1024); assert.equal(disk.at(-1), 10);
  const entry = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(disk));
  assert.equal(entry.level, 'warn'); assert.equal(entry.src, 'budget'); assert.match(entry.msg, /磁盘记录过长，已截断/);
  assert.equal(entry.truncated.reason, 'disk-entry-budget'); assert.equal(entry.truncated.limitBytes, 1024);
  assert.equal(entry.truncated.originalBytes, Buffer.byteLength(JSON.stringify(observed[0]) + '\n'));
  assert.equal(observed[0].msg, text + ' ' + JSON.stringify({ object: text }));
  assert.deepEqual(logger.recent()[0], observed[0]); assert.equal(observed[0].truncated, undefined);
  assert.doesNotMatch(entry.msg, /\uFFFD/);
  logger.child('来源😀'.repeat(1000)).info(text);
  const second = fs.readFileSync(file, 'utf8').trimEnd().split('\n')[1];
  assert.ok(Buffer.byteLength(second + '\n') <= 1024); assert.equal(JSON.parse(second).truncated.sourceTruncated, true);
  const normal = { at: '2026-10-17T00:00:00.000Z', level: 'info', src: 'app', msg: 'unchanged' };
  assert.equal(smallPolicy().diskLine(normal), JSON.stringify(normal) + '\n');
  assert.throws(() => createLogPolicy({ maxDiskEntryBytes: 100 }), /maxDiskEntryBytes/);
  const alternate = path.join(root, 'disk-only'), basePolicy = smallPolicy();
  const diskOnly = createLogger({ dataDir: alternate, mirrorConsole: false, policy: {
    prepare: basePolicy.prepare,
    diskLine(entry) { entry.msg = 'policy disk-only transform'; return basePolicy.diskLine(entry); },
  } });
  diskOnly.info('original diagnostic');
  assert.equal(diskOnly.recent()[0].msg, 'original diagnostic');
  assert.equal(rows(path.join(alternate, 'logs', today()))[0].msg, 'policy disk-only transform');
});

test('level, 500-entry ring, child and stopWrites contracts survive budget policy; null is an explicit disk-policy bypass', t => {
  const root = temporary(t), logger = createLogger({ dataDir: root, mirrorConsole: false });
  const observed = [], bus = new Bus(logger); logger.setBus(bus); bus.on('log', entry => observed.push(entry));
  logger.debug('filtered'); assert.deepEqual(logger.recent(), []);
  assert.equal(logger.setLevel('error'), 'error'); assert.equal(logger.setLevel('unknown'), 'error');
  logger.warn('filtered warning'); logger.child('worker').error('retained');
  const file = path.join(root, 'logs', today()), before = fs.readFileSync(file);
  logger.stopWrites(); logger.child('worker').error('late callback');
  assert.deepEqual(fs.readFileSync(file), before); assert.equal(observed.at(-1).msg, 'late callback');
  logger.setLevel('debug'); for (let i = 0; i < 505; i++) logger.debug('ring ' + i);
  assert.equal(logger.recent({ n: 1000 }).length, 500); assert.equal(logger.recent({ n: 1000 })[0].msg, 'ring 5');
  const other = path.join(root, 'policy-disabled'), unlimited = createLogger({ dataDir: other, mirrorConsole: false, policy: null });
  unlimited.info('中'.repeat(40000)); assert.ok(fs.statSync(path.join(other, 'logs', today())).size > 65536);
  assert.equal(unlimited.startupMaintenance, null);
  const budgeted = path.join(root, 'default-budget'), defaultLogger = createLogger({ dataDir: budgeted, mirrorConsole: false });
  const full = '中文😀'.repeat(10000); defaultLogger.info(full);
  assert.ok(fs.statSync(path.join(budgeted, 'logs', today())).size <= 65536);
  assert.equal(defaultLogger.recent()[0].msg, full);
});

test('startup cleanup keeps complete UTF-8 JSONL tail rows and marks every discarded byte; thresholds and retention remain startup-only', t => {
  const root = temporary(t), dir = path.join(root, 'logs'); fs.mkdirSync(dir);
  const row = msg => Buffer.from(JSON.stringify({ at: '2026-10-17', level: 'info', src: 'fixture', msg }) + '\n');
  const old = path.join(dir, 'old.log'); fs.writeFileSync(old, 'expired'); const oldDate = new Date(Date.now() - 9 * 86400_000); fs.utimesSync(old, oldDate, oldDate);
  const nonLog = path.join(dir, 'old.txt'); fs.writeFileSync(nonLog, 'unrelated'); fs.utimesSync(nonLog, oldDate, oldDate);
  const exact = path.join(dir, 'exact.log'); fs.writeFileSync(exact, Buffer.alloc(4096, 65));
  const below = path.join(dir, 'below.log'); fs.writeFileSync(below, 'keep');
  const valid = [row('尾部中文😀一'), row('尾部中文😀二')], invalid = Buffer.from([0xff, 10]);
  const original = Buffer.concat([row('前缀😀'.repeat(1500)), invalid, ...valid, Buffer.from('{"msg":"incomplete')]);
  const recent = path.join(dir, 'recent.log'); fs.writeFileSync(recent, original);
  // A custom small budget exercises the same real file I/O without a large copy.
  const policy = createLogPolicy({ maxStartupFileBytes: 4096, startupTailBytes: Buffer.concat([Buffer.from([0x9f, 0x98, 0x80]), Buffer.from('\n'), invalid, ...valid, Buffer.from('{"msg":"incomplete')]).length });
  const logger = createLogger({ dataDir: root, mirrorConsole: false, policy });
  const content = fs.readFileSync(recent), decoded = new TextDecoder('utf-8', { fatal: true }).decode(content), kept = rows(recent);
  assert.doesNotMatch(decoded, /\uFFFD/); assert.equal(kept[0].truncated.reason, 'startup-file-budget');
  assert.equal(kept[0].truncated.originalBytes, original.length); assert.equal(kept[0].truncated.retainedBytes, Buffer.concat(valid).length);
  assert.equal(kept[0].truncated.discardedBytes, original.length - Buffer.concat(valid).length); assert.equal(kept[0].truncated.invalidLines, 1);
  assert.deepEqual(kept.slice(1).map(entry => entry.msg), ['尾部中文😀一', '尾部中文😀二']);
  assert.equal(fs.existsSync(old), false); assert.equal(fs.readFileSync(nonLog, 'utf8'), 'unrelated');
  assert.equal(fs.statSync(exact).size, 4096); assert.equal(fs.readFileSync(below, 'utf8'), 'keep');
  assert.equal(logger.startupMaintenance.compacted.length, 1); assert.deepEqual(logger.startupMaintenance.removed, ['old.log']);
  fs.writeFileSync(below, Buffer.alloc(5000, 65)); logger.info('runtime does not prune'); assert.equal(fs.statSync(below).size, 5000);
  assert.equal(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')).length, 0);
});

test('a window beginning exactly at a line boundary retains that first complete row', t => {
  const root = temporary(t), dir = path.join(root, 'logs'); fs.mkdirSync(dir);
  const first = JSON.stringify({ msg: 'prefix'.repeat(1000) }) + '\n', last = JSON.stringify({ msg: '完整😀' }) + '\n';
  const file = path.join(dir, 'boundary.log'); fs.writeFileSync(file, first + last);
  createLogger({ dataDir: root, mirrorConsole: false, policy: createLogPolicy({ maxStartupFileBytes: 1024, startupTailBytes: Buffer.byteLength(last) }) });
  assert.equal(rows(file)[1].msg, '完整😀');
  assert.equal(rows(file)[0].truncated.retainedBytes, Buffer.byteLength(last));
});

test('startup validation preserves raw BOM semantics and never retains an unparseable BOM-prefixed JSONL row', t => {
  const root = temporary(t), dir = path.join(root, 'logs'); fs.mkdirSync(dir);
  const bad = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify({ msg: 'BOM-prefixed invalid row' }) + '\n')]);
  const valid = Buffer.from(JSON.stringify({ msg: 'valid content retains an embedded \uFEFF and 中文😀' }) + '\n');
  const original = Buffer.concat([Buffer.from(JSON.stringify({ msg: 'oversized-prefix'.repeat(100) }) + '\n'), bad, valid]);
  const file = path.join(dir, 'bom.log'); fs.writeFileSync(file, original);
  assert.throws(() => JSON.parse(bad.toString('utf8')));
  const logger = createLogger({ dataDir: root, mirrorConsole: false, policy: createLogPolicy({ maxStartupFileBytes: 256, startupTailBytes: bad.length + valid.length }) });
  const actual = fs.readFileSync(file), firstLf = actual.indexOf(10);
  assert.deepEqual(actual.subarray(firstLf + 1), valid, 'the bytes retained are exactly the bytes accepted by strict JSON validation');
  const parsed = rows(file); assert.equal(parsed.length, 2); assert.equal(parsed[1].msg, JSON.parse(valid.toString('utf8')).msg);
  assert.equal(parsed[0].truncated.originalBytes, original.length); assert.equal(parsed[0].truncated.retainedBytes, valid.length);
  assert.equal(parsed[0].truncated.discardedBytes, original.length - valid.length); assert.equal(parsed[0].truncated.invalidLines, 1);
  assert.equal(logger.startupMaintenance.compacted[0].invalidLines, 1); assert.deepEqual(logger.startupMaintenance.failed, []);
});

test('nonregular files, hardlinks and real symlink/junction targets are untouched by cleanup and daily append', t => {
  const root = temporary(t), dir = path.join(root, 'logs'); fs.mkdirSync(dir);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); const target = path.join(outside, 'target'); fs.writeFileSync(target, 'outside-original');
  fs.linkSync(target, path.join(dir, 'linked.log')); fs.mkdirSync(path.join(dir, 'directory.log'));
  // Windows junctions need no symlink privilege and are real filesystem links.
  fs.symlinkSync(outside, path.join(dir, today()), process.platform === 'win32' ? 'junction' : 'dir');
  const logger = createLogger({ dataDir: root, mirrorConsole: false, policy: smallPolicy() }); logger.info('must not follow daily link');
  assert.equal(fs.readFileSync(target, 'utf8'), 'outside-original'); assert.deepEqual(fs.readdirSync(outside), ['target']);
  assert.equal(logger.startupMaintenance.skipped.length, 3);
  const linkedRoot = path.join(root, 'linked-root'); fs.mkdirSync(linkedRoot);
  fs.symlinkSync(outside, path.join(linkedRoot, 'logs'), process.platform === 'win32' ? 'junction' : 'dir');
  const viaLinkedDirectory = createLogger({ dataDir: linkedRoot, mirrorConsole: false }); viaLinkedDirectory.warn('must not follow logs directory');
  assert.deepEqual(viaLinkedDirectory.startupMaintenance.skipped, [{ file: '.', reason: 'non-regular-directory' }]);
  assert.deepEqual(fs.readdirSync(outside), ['target']);
  const blockedRoot = path.join(root, 'blocked-root'); fs.mkdirSync(blockedRoot); fs.writeFileSync(path.join(blockedRoot, 'logs'), 'ordinary-file');
  const blocked = createLogger({ dataDir: blockedRoot, mirrorConsole: false }); blocked.info('memory survives a non-directory log path');
  assert.equal(blocked.recent().at(-1).msg, 'memory survives a non-directory log path');
  assert.equal(fs.readFileSync(path.join(blockedRoot, 'logs'), 'utf8'), 'ordinary-file');
});

test('read, write, fsync, verification and rename failures preserve original bytes and remove temporary files; file changes are never replaced', t => {
  const root = temporary(t), logUrl = pathToFileURL(path.join(workspace, 'src/kernel/log.js')).href, policyUrl = pathToFileURL(path.join(workspace, 'src/kernel/log-policy.js')).href;
  for (const fault of ['read', 'write', 'fsync', 'verify', 'rename', 'changed']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
      import {createLogger} from ${JSON.stringify(logUrl)};import {createLogPolicy} from ${JSON.stringify(policyUrl)};
      const root=${JSON.stringify(root)},fault=${JSON.stringify(fault)},dir=path.join(root,fault,'logs');fs.mkdirSync(dir,{recursive:true});
      const file=path.join(dir,new Date().toISOString().slice(0,10)+'.log'),original=Buffer.from(JSON.stringify({msg:'原件😀'.repeat(1500)})+'\\n');fs.writeFileSync(file,original);
      const methods=['readSync','writeFileSync','fsyncSync','renameSync'],saved=Object.fromEntries(methods.map(key=>[key,fs[key]]));
      let armed=true;
      try{
        if(fault==='read')fs.readSync=()=>0;
        if(fault==='write')fs.writeFileSync=(target,...args)=>{if(typeof target==='number')throw new Error('synthetic write failure');return saved.writeFileSync(target,...args);};
        if(fault==='fsync')fs.fsyncSync=()=>{throw new Error('synthetic fsync failure');};
        if(fault==='verify')fs.fsyncSync=fd=>{saved.fsyncSync(fd);saved.writeFileSync(fd,'corrupted-after-write');};
        if(fault==='rename')fs.renameSync=()=>{throw new Error('synthetic rename failure');};
        if(fault==='changed')fs.fsyncSync=fd=>{saved.fsyncSync(fd);if(armed){armed=false;fs.appendFileSync(file,'concurrent-suffix');}};
        const logger=createLogger({dataDir:path.dirname(dir),mirrorConsole:false,policy:createLogPolicy({maxStartupFileBytes:1024,startupTailBytes:512})});
        for(const[key,value]of Object.entries(saved))fs[key]=value;
        const expected=fault==='changed'?Buffer.concat([original,Buffer.from('concurrent-suffix')]):original;
        assert.deepEqual(fs.readFileSync(file),expected);assert.equal(logger.startupMaintenance.failed.length,1);
        assert.match(logger.recent()[0].msg,/启动整理失败，原日志文件未替换/);assert.doesNotMatch(logger.recent()[0].msg,/成功/);
        assert.deepEqual(fs.readdirSync(dir),[path.basename(file)]);console.log(JSON.stringify({fault,originalPreserved:true}));
      }finally{for(const[key,value]of Object.entries(saved))fs[key]=value;}
    `], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `${fault}: ${result.stderr || result.error || result.stdout}`);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { fault, originalPreserved: true });
  }
});

test('real appended policy and selected logger reach SDK, JSONL, authenticated logs and SSE; disabling restores defaults', async t => {
  const root = temporary(t), key = '__qa246_composition_' + randomUUID(), state = globalThis[key] = { mode: 'none', hits: 0, policies: 0, writes: 0, loggers: 0 };
  observer(root, key); const layer = path.join(root, 'overrides', '10-log246'); fs.mkdirSync(layer, { recursive: true });
  const manifest = { version: 1, id: 'qa-log246', components: {
    'runtime.log.policy': { module: './policy.mjs', export: 'policy' },
    'runtime.logger': { module: './policy.mjs', export: 'logger' },
  } };
  const policyUrl = pathToFileURL(path.join(workspace, 'src/kernel/log-policy.js')).href, loggerUrl = pathToFileURL(path.join(workspace, 'src/kernel/log.js')).href;
  const files = ['src/kernel/log.js', 'src/kernel/log-policy.js'], hashes = () => files.map(file => createHash('sha256').update(fs.readFileSync(path.join(workspace, file))).digest('hex')), before = hashes();
  fs.writeFileSync(path.join(layer, 'composition.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(layer, 'policy.mjs'), `import {createLogPolicy} from ${JSON.stringify(policyUrl)};import {createLogger} from ${JSON.stringify(loggerUrl)};
    const s=globalThis[${JSON.stringify(key)}];export function policy(){s.policies++;const p=createLogPolicy({maxDiskEntryBytes:1024,maxStartupFileBytes:4096,startupTailBytes:2048});return {prepare:args=>p.prepare(args),diskLine:entry=>{s.writes++;return p.diskLine({...entry,msg:'selected-policy:'+entry.msg});}};}
    export function logger(args){s.loggers++;const log=createLogger({...args,mirrorConsole:false}),child=log.child;log.child=source=>child('selected:'+source);return log;}`);
  const apps = []; let currentStream;
  cleanups.get(root).push(async () => { currentStream?.abort(); for (const app of apps) await app.stop(); delete globalThis[key]; assert.deepEqual(hashes(), before); });
  async function start() {
    const app = await createApplication(kernelOptions(root)); apps.push(app); app.loader.startWatchers = () => {};
    app.config.update({ server: { port: 0, token: 'synthetic-log246' }, telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false }, });
    const port = await app.start(); assert.notEqual(port, 15967); return { app, base: `http://127.0.0.1:${port}`, headers: { 'x-console-token': 'synthetic-log246' } };
  }
  const selected = await start(); assert.equal(selected.app.composition.owners['runtime.log.policy'], 'qa-log246'); assert.equal(selected.app.composition.owners['runtime.logger'], 'qa-log246');
  assert.equal(state.policies, 1); assert.equal(state.loggers, 1);
  currentStream = new AbortController(); const sse = await fetch(selected.base + '/api/events', { headers: selected.headers, signal: currentStream.signal });
  const reader = sse.body.getReader(); await reader.read();
  const full = 'actual SDK 中文😀'.repeat(250), source = 'selected:plugin:observer246'; state.ctx.log.info(full);
  let event = '', timer = setTimeout(() => currentStream.abort(), 3000);
  try { while (!event.includes(full)) { const next = await reader.read(); assert.equal(next.done, false); event += new TextDecoder().decode(next.value); } }
  finally { clearTimeout(timer); currentStream.abort(); await reader.cancel().catch(() => {}); }
  assert.match(event, /event: log/); assert.ok(event.includes(source));
  assert.equal((await fetch(selected.base + '/api/logs')).status, 401);
  const logs = await (await fetch(selected.base + '/api/logs', { headers: selected.headers })).json();
  assert.equal(logs.logs.at(-1).msg, full); assert.equal(logs.logs.at(-1).src, source);
  const file = path.join(selected.app.dataDir, 'logs', today()), last = fs.readFileSync(file, 'utf8').trimEnd().split('\n').at(-1);
  assert.ok(Buffer.byteLength(last + '\n') <= 1024); assert.match(JSON.parse(last).msg, /^selected-policy:/); assert.ok(state.writes > 0);
  await selected.app.stop(); fs.writeFileSync(path.join(layer, 'composition.json'), JSON.stringify({ ...manifest, enabled: false }));
  const priorWrites = state.writes, restored = await start();
  assert.equal(restored.app.components['runtime.log.policy'], defaultComponents['runtime.log.policy']); assert.equal(restored.app.components['runtime.logger'], defaultComponents['runtime.logger']);
  state.ctx.log.info('default restored246');
  const restoredLogs = await (await fetch(restored.base + '/api/logs', { headers: restored.headers })).json();
  assert.equal(restoredLogs.logs.at(-1).src, 'plugin:observer246'); assert.equal(restoredLogs.logs.at(-1).msg, 'default restored246');
  assert.equal(rows(file).at(-1).msg, 'default restored246'); assert.equal(state.writes, priorWrites); assert.equal(state.policies, 1); assert.equal(state.loggers, 1);
  assert.deepEqual(hashes(), before);
});
