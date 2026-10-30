import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadComposition, inspectComposition, createApplication } from '../src/kernel/composition.js';
import { createCompositionLifecycle } from '../src/kernel/composition-lifecycle.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-composition-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  const layer = (name, manifest, source = 'export default () => "replacement";') => {
    const folder = path.join(root, 'overrides', name);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'composition.json'), JSON.stringify({ version: 1, id: name, ...manifest }));
    fs.writeFileSync(path.join(folder, 'implementation.mjs'), source);
    return folder;
  };
  t.after(() => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('qqa-composition-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, layer, load: options => loadComposition({ appRoot: root, defaults: { 'core.example': () => 'default' }, ...options }) };
}

test('empty composition uses defaults and adding/removing a layer replaces/restores them', async t => {
  const f = fixture(t);
  assert.equal((await f.load()).components['core.example'](), 'default');
  const folder = f.layer('20-custom', { components: { 'core.example': './implementation.mjs' } });
  const selected = await f.load();
  assert.equal(selected.components['core.example'](), 'replacement');
  assert.equal(selected.composition.owners['core.example'], '20-custom');
  fs.renameSync(path.join(folder, 'composition.json'), path.join(folder, 'disabled.json'));
  assert.equal((await f.load()).components['core.example'](), 'default');
});

test('ordered layers select only final implementations without evaluating shadowed modules', async t => {
  const f = fixture(t);
  f.layer('early', { order: -10, components: { 'core.example': './implementation.mjs' } }, 'throw new Error("shadowed code must not execute");');
  f.layer('later', { requires: ['early'], components: { 'core.example': { module: './implementation.mjs', export: 'replacement' } } }, 'export function replacement() { return "selected"; }');
  const result = await f.load();
  assert.equal(result.components['core.example'](), 'selected');
  assert.equal(result.composition.owners['core.example'], 'later');
});

test('all paths and dependencies validate before added module evaluation', async t => {
  const f = fixture(t);
  f.layer('a', { components: { 'core.example': './implementation.mjs' } }, 'throw new Error("executed too early");');
  f.layer('b', { components: { 'other.component': '../outside.mjs' } });
  await assert.rejects(f.load(), /非法相对路径/);
});

test('disabled layers are not loaded, missing dependency and duplicate id fail explicitly', async t => {
  const f = fixture(t);
  const folder = f.layer('a', { enabled: false, components: { 'core.example': './absent.mjs' } }, 'throw new Error("disabled");');
  assert.equal((await f.load()).components['core.example'](), 'default');
  f.layer('b', { requires: ['a'] });
  await assert.rejects(f.load(), /依赖尚未挂载/);
  fs.writeFileSync(path.join(folder, 'composition.json'), JSON.stringify({ version: 1, id: 'b' }));
  await assert.rejects(f.load(), /重复层 id/);
});

test('schema version, scalar types, unknown fields and dangerous component keys are rejected', async t => {
  const f = fixture(t);
  const folder = f.layer('a', {}), manifest = path.join(folder, 'composition.json');
  for (const value of [
    { version: 99, id: 'a' }, { version: 1, id: 'a', enabled: 'yes' },
    { version: 1, id: 'a', order: 0.5 }, { version: 1, id: 'a', component: {} },
    { version: 1, id: 'a', components: JSON.parse('{"__proto__":"./implementation.mjs"}') },
  ]) {
    fs.writeFileSync(manifest, JSON.stringify(value));
    await assert.rejects(f.load());
  }
});

test('component exports must be callable and import failures do not silently fall back', async t => {
  const f = fixture(t);
  f.layer('a', { components: { 'core.example': './implementation.mjs' } }, 'export default 123;');
  await assert.rejects(f.load(), /不是函数/);
});

test('explicit host binding wins over disk and does not evaluate the shadowed override', async t => {
  const f = fixture(t);
  f.layer('a', { components: { 'core.example': './implementation.mjs' } }, 'throw new Error("unselected");');
  const result = await f.load({ components: { 'core.example': () => 'host' } });
  assert.equal(result.components['core.example'](), 'host');
  assert.equal(result.composition.owners['core.example'], 'host');
});

test('UI layers resolve page and individual asset replacements, last matching page wins', async t => {
  const f = fixture(t);
  for (const name of ['a', 'b']) {
    const folder = f.layer(name, { ui: {
      panels: [{ id: 'sessions', title: name, assetRoot: './ui', permissions: [], api: [] }],
      assets: { 'panels/icons.js': './ui/icons.js' },
    } });
    fs.mkdirSync(path.join(folder, 'ui'));
    fs.writeFileSync(path.join(folder, 'ui', 'index.html'), '<!doctype html>isolated UI fixture');
    fs.writeFileSync(path.join(folder, 'ui', 'icons.js'), 'export const fixture = true;');
  }
  const result = await f.load();
  assert.equal(result.composition.ui.panels.length, 1);
  assert.equal(result.composition.ui.panels[0].title, 'b');
  assert.ok(result.composition.ui.assets['panels/icons.js'].endsWith(path.join('b', 'ui', 'icons.js')));
});

test('reserved UI URLs, escaped code paths and junction roots are rejected', async t => {
  const f = fixture(t);
  const folder = f.layer('a', {}), manifest = path.join(folder, 'composition.json');
  for (const module of ['../implementation.mjs', 'C:/outside.mjs', '%2e%2e/implementation.mjs', './.hidden.mjs']) {
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, id: 'a', components: { 'core.example': module } }));
    await assert.rejects(f.load());
  }
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, id: 'a', ui: { assets: { 'panels/u/plugin/entry.js': './implementation.mjs' } } }));
  await assert.rejects(f.load(), /非法静态资源目标/);
  const target = path.join(f.root, 'outside'); fs.mkdirSync(target);
  fs.symlinkSync(target, path.join(folder, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, id: 'a', ui: { shell: './linked' } }));
  await assert.rejects(f.load(), /不接受符号链接/);
});

test('route contributions carry their owner/config and selected function', async t => {
  const f = fixture(t);
  f.layer('a', { routes: [{ id: 'new-api', module: './implementation.mjs', config: { label: 'fixture' } }] }, 'export default (http, deps, config) => config.label;');
  const { composition } = await f.load();
  assert.equal(composition.routes[0].id, 'a/new-api');
  assert.equal(composition.routes[0].register(null, null, composition.routes[0].config), 'fixture');
});

test('inspection does not evaluate native code', t => {
  const f = fixture(t);
  f.layer('a', { components: { 'core.example': './implementation.mjs' } }, 'throw new Error("inspection executed code");');
  assert.equal(inspectComposition({ appRoot: f.root })[0].components[0].key, 'core.example');
});

test('the production application entry can replace the entire default assembly', async t => {
  const f = fixture(t);
  f.layer('custom', { components: { 'runtime.kernel': './implementation.mjs' } }, `export default ({ composition, components }) => ({
    owner: composition.owners['runtime.kernel'], selectedPrompt: typeof components['core.prompt.system'],
    start: async () => 12345, stop: async () => undefined,
  });`);
  const application = await createApplication({ appRoot: f.root });
  assert.equal(application.owner, 'custom');
  assert.equal(application.selectedPrompt, 'function');
  assert.equal(await application.start(), 12345);
  await application.stop();
});

test('host binding validation happens before any contributed module executes', async t => {
  const f = fixture(t);
  f.layer('a', { routes: [{ id: 'guard', module: './implementation.mjs' }] }, 'throw new Error("executed before validation");');
  await assert.rejects(f.load({ components: { 'core.example': 123 } }), /组件必须是函数/);
});

test('reentrant lifecycle close shares one sequential cleanup and reports all failures', async () => {
  const lifecycle = createCompositionLifecycle(), calls = [];
  let nested, release;
  const gate = new Promise(resolve => { release = resolve; });
  lifecycle.onStop(() => { calls.push('first'); throw new Error('first failed'); });
  lifecycle.onStop(async () => { calls.push('last-start'); await gate; calls.push('last-end'); });
  lifecycle.signal.addEventListener('abort', () => { nested = lifecycle.close(); });
  const outer = lifecycle.close();
  assert.equal(outer, nested);
  assert.equal(lifecycle.signal.aborted, true);
  await Promise.resolve();
  assert.deepEqual(calls, ['last-start']);
  release();
  await assert.rejects(outer, /组合资源清理失败/);
  assert.deepEqual(calls, ['last-start', 'last-end', 'first']);
  assert.equal(lifecycle.close(), outer);
});

test('frozen custom applications and private getters retain lifecycle cleanup', async t => {
  const f = fixture(t), marker = path.join(f.root, 'closed.txt');
  f.layer('custom', { components: { 'runtime.kernel': './implementation.mjs' } }, `
    import fs from 'node:fs';
    export default ({ lifecycle }) => {
      lifecycle.onStop(() => fs.writeFileSync(${JSON.stringify(marker)}, 'closed'));
      class App { #port = 23456; get port() { return this.#port; } async start() { return this.#port; } async stop() {} }
      return Object.freeze(new App());
    }`);
  const application = await createApplication({ appRoot: f.root });
  assert.equal(application.port, 23456);
  assert.equal(await application.start(), 23456);
  await application.stop();
  assert.equal(fs.readFileSync(marker, 'utf8'), 'closed');
  await assert.rejects(application.start(), /组合实例已停止/);
});

test('constructor and start failures unwind their composition resources', async t => {
  const f = fixture(t), marker = path.join(f.root, 'closed.txt');
  for (const phase of ['constructor', 'start']) {
    const folder = f.layer('custom', { components: { 'runtime.kernel': './implementation.mjs' } }, `
      import fs from 'node:fs';
      export default ({ lifecycle }) => {
        lifecycle.onStop(() => fs.writeFileSync(${JSON.stringify(marker)}, '${phase}'));
        ${phase === 'constructor' ? 'throw new Error("fixture constructor");' : 'return { start() { throw new Error("fixture start"); }, stop() {} };'}
      }`);
    if (phase === 'constructor') await assert.rejects(createApplication({ appRoot: f.root }), /fixture constructor/);
    else { const application = await createApplication({ appRoot: f.root }); await assert.rejects(application.start(), /fixture start/); }
    assert.equal(fs.readFileSync(marker, 'utf8'), phase);
  }
});

test('start failure cancels the generation before awaiting abort-dependent shutdown', async t => {
  const f = fixture(t);
  f.layer('custom', { components: { 'runtime.kernel': './implementation.mjs' } }, `
    export default ({ lifecycle }) => {
      const aborted = new Promise(resolve => lifecycle.signal.addEventListener('abort', resolve, { once: true }));
      return { start() { throw new Error('fixture boot'); }, stop: () => aborted };
    }`);
  const application = await createApplication({ appRoot: f.root });
  await assert.rejects(application.start(), /fixture boot/);
});

test('a validated startup plan is reused across desktop preflight without rescanning', async t => {
  const f = fixture(t);
  const folder = f.layer('custom', { components: { 'runtime.kernel': './implementation.mjs' } }, 'export default () => ({ start: () => 34567, stop() {} });');
  const plan = await loadComposition({ appRoot: f.root });
  fs.renameSync(path.join(folder, 'composition.json'), path.join(folder, 'disabled.json'));
  const lifecycle = createCompositionLifecycle();
  let closed = false;
  lifecycle.onStop(() => { closed = true; });
  const application = await createApplication({ appRoot: f.root, lifecycle }, plan);
  assert.equal(await application.start(), 34567);
  await application.stop();
  assert.equal(closed, true);
  assert.deepEqual(inspectComposition({ appRoot: f.root }), []);
});

test('foreign startup plans are rejected and existing preflight resources are released', async t => {
  const f = fixture(t), lifecycle = createCompositionLifecycle();
  let closed = false;
  lifecycle.onStop(() => { closed = true; });
  await assert.rejects(createApplication({ appRoot: f.root, lifecycle }, { components: {} }), /必须由 loadComposition 校验/);
  assert.equal(closed, true);
});
