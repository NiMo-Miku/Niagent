// Actual temporary module graphs and native fs.watch; no vendor/real data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { Bus } from '../src/kernel/bus.js';

const option = process.argv.indexOf('--loader');
const loaderFile = option < 0 ? path.resolve('src/kernel/plugin-loader.js') : path.resolve(process.argv[option + 1]);
const { createPluginLoader } = await import(pathToFileURL(loaderFile));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-watch-root156-'));
assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
const log = { info() {}, warn() {}, error() {}, child() { return this; } };
const nativeWatch = fs.watch;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message) {
  const end = Date.now() + 8000;
  while (!fn()) { assert.ok(Date.now() < end, message); await pause(25); }
}
let passed = 0, failed = 0;
async function check(name, test) {
  try { await test(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); }
}
function make(label) {
  const appRoot = path.join(temp, label); fs.mkdirSync(appRoot);
  for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, name));
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  const records = [], live = new Set(), listeners = new Set();
  const permissions = createPermissions({ log, headless: true }), scheduler = createScheduler({ log });
  const capabilities = createCapabilityRegistry({ log }), bus = new Bus(log);
  const registry = createToolRegistry({ log, bus, permissions, capabilities });
  let value = { skills: {}, extensions: { hotReload: true } };
  const config = {
    get: () => value,
    update(patch) { value = { ...value, ...patch }; for (const fn of listeners) fn(value); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const watch = (file, options, callback) => {
    const handle = nativeWatch(file, options, callback);
    const record = { path: path.resolve(file), handle, callback }; records.push(record); live.add(record);
    handle.on('close', () => live.delete(record)); return handle;
  };
  // Observe the native function used by older and newer production code alike.
  // The optional host injection is not itself a pass criterion.
  fs.watch = watch;
  const loader = createPluginLoader({ appRoot, log, bus, registry, permissions,
    capabilityRegistry: capabilities, scheduler, config,
    storage: createStorage({ dataDir: path.join(appRoot, 'data'), log }), watch });
  function write(kind, id, text) {
    const folder = path.join(appRoot, kind, id); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'skill.json'), JSON.stringify({ id, permissions: [] }));
    fs.writeFileSync(path.join(folder, 'helper.js'), `export const value = ${JSON.stringify(text)};`);
    fs.writeFileSync(path.join(folder, 'index.js'), "import {value} from './helper.js'; export default {setup(ctx){ctx.registerTool({id:'read',name:'Read',execute:()=>value});}};");
    return folder;
  }
  const read = async id => (await registry.invoke(id + '__read', {})).result;
  const cleanup = async () => { loader.stopAll(); scheduler.stop(); permissions.close(); if (fs.watch === watch) fs.watch = nativeWatch; await pause(75); };
  return { appRoot, loader, registry, scheduler, permissions, config, records, live, listeners, write, read, cleanup };
}

try {
  await check('root replacement automatically unloads old extension and loads new graph, then continues watching helpers', async () => {
    const f = make('replacement');
    try {
      f.write('skills', 'previous', 'previous'); await f.loader.loadAll(); f.loader.startWatchers();
      assert.equal(await f.read('previous'), 'previous');
      const root = path.join(f.appRoot, 'skills'), retired = path.join(f.appRoot, 'retired-skills');
      // Move only this newly created fixture tree. Both absolute targets were checked above.
      for (const target of [root, retired]) assert.equal(path.dirname(target), f.appRoot);
      fs.renameSync(root, retired); fs.mkdirSync(root);
      const current = f.write('skills', 'current', 'first');
      await until(() => f.loader.isActive('current') && !f.loader.hostEntry('previous'), 'new root must be discovered without manual rescan/restart');
      assert.equal(f.registry.get('previous__read'), undefined); assert.equal(await f.read('current'), 'first');
      fs.writeFileSync(path.join(current, 'helper.js'), "export const value = 'second';");
      await until(() => f.loader.contentCurrent('current'), 'newly recreated root helper must still hot reload');
      assert.equal(await f.read('current'), 'second');
    } finally { await f.cleanup(); }
  });
  await check('native watcher error is contained and rebound; obsolete callback cannot duplicate active registration', async () => {
    const f = make('error-recovery');
    try {
      const folder = f.write('plugins', 'error-recovery', 'first'); await f.loader.loadAll(); f.loader.startWatchers();
      await until(() => f.records.some(r => r.path === path.join(f.appRoot, 'plugins')), 'watch injection must observe the real root watcher');
      const old = f.records.find(r => r.path === path.join(f.appRoot, 'plugins'));
      assert.ok(old.handle.listenerCount('error') > 0, 'native fs.watch errors need an owned listener');
      old.handle.emit('error', Object.assign(new Error('QA_ONLY_WATCH_FAILURE'), { code: 'EPERM' }));
      await until(() => f.records.some(r => r !== old && r.path === old.path) && !f.live.has(old), 'failed watcher must be closed and rebound');
      old.callback('change', 'error-recovery/helper.js');
      fs.writeFileSync(path.join(folder, 'helper.js'), "export const value = 'recovered';");
      await until(() => f.loader.contentCurrent('error-recovery'), 'rebound watcher must reload changed helper');
      assert.equal(await f.read('error-recovery'), 'recovered');
      assert.equal(f.registry.byOwner('error-recovery').length, 1);
      assert.equal([...f.live].filter(r => r.path === old.path).length, 1);
    } finally { await f.cleanup(); }
    assert.equal(f.live.size, 0, 'stopAll closes parent and root watchers');
    assert.equal(f.listeners.size, 0, 'stopAll unsubscribes the hot-reload preference');
  });
  await check('saved hot-reload preference pauses and resumes live watchers, including changes made while disabled', async () => {
    const f = make('preference');
    try {
      const folder = f.write('skills', 'preference', 'first'); await f.loader.loadAll(); f.loader.startWatchers();
      await until(() => f.live.size >= 3, 'native root watchers available');
      f.config.update({ extensions: { hotReload: false } });
      await until(() => f.live.size === 0, 'saved false must immediately stop watching');
      fs.writeFileSync(path.join(folder, 'helper.js'), "export const value = 'second';");
      await pause(750); assert.equal(f.loader.contentCurrent('preference'), false);
      f.config.update({ extensions: { hotReload: true } });
      await until(() => f.loader.contentCurrent('preference'), 'saved true must resume and discover missed edits');
      assert.equal(await f.read('preference'), 'second');
      f.loader.stopWatchers(); await until(() => f.live.size === 0, 'manual stop closes every watcher');
      assert.equal(f.listeners.size, 0, 'manual stop does not retain config subscription');
      const before = f.records.length; f.config.update({ extensions: { hotReload: true } });
      await pause(700); assert.equal(f.records.length, before, 'config change after manual stop cannot resurrect watchers');
    } finally { await f.cleanup(); }
  });
  await check('parent watcher ignores non-extension files and late callbacks after shutdown', async () => {
    const f = make('shutdown');
    try {
      f.write('skills', 'shutdown', 'first'); await f.loader.loadAll(); f.loader.startWatchers();
      const entry = f.loader.hostEntry('shutdown'), generation = entry.generation;
      fs.writeFileSync(path.join(f.appRoot, 'unrelated.txt'), 'QA_ONLY'); await pause(800);
      assert.equal(f.loader.hostEntry('shutdown').generation, generation, 'snapshot/data/other root activity cannot create reload loops');
      const callbacks = f.records.map(r => r.callback); f.loader.stopAll(); await until(() => f.live.size === 0, 'shutdown closes every native watcher');
      for (const callback of callbacks) callback('rename', 'skills');
      await pause(750); assert.deepEqual(f.loader.listEntries(), []); assert.equal(f.live.size, 0);
      assert.equal(f.listeners.size, 0); assert.equal(f.scheduler.count(), 0);
    } finally { await f.cleanup(); }
  });
} finally {
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('qqa-watch-root156-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ test: '156-plugin-watch-root-recovery', passed, failed, vendorExecuted: false, realDataUsed: false }));
if (failed) process.exitCode = 1;
