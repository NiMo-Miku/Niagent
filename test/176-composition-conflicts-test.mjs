import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadComposition, describeComposition } from '../src/kernel/composition.js';
import { wrapMethods } from '../src/kernel/composition-methods.js';
import { createHttpServer } from '../src/kernel/http.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createUiAssetResolver } from '../src/console/ui-composition.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-overlap176-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  const write = (name, manifest = {}, source = `export default () => '${name}';`) => {
    const folder = path.join(root, 'overrides', name); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'composition.json'), JSON.stringify({ version: 2, id: name, ...manifest }));
    fs.writeFileSync(path.join(folder, 'implementation.mjs'), source);
    return folder;
  };
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('qqa-overlap176-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, write, load: options => loadComposition({ appRoot: root, defaults: { 'core.shared': () => 'base' }, ...options }) };
}
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(tail => [value, ...tail])) : [[]];

test('all 48 order/subset combinations retain independent features and compose only the shared target', async t => {
  const f = fixture(t), names = ['a', 'b', 'c'];
  for (const order of permutations(names)) for (let mask = 0; mask < 8; mask++) {
    for (const [index, name] of order.entries()) f.write(name, {
      order: index, enabled: Boolean(mask & (1 << names.indexOf(name))),
      components: { 'core.shared': { module: './implementation.mjs', export: 'wrap', mode: 'wrap' }, [`core.${name}`]: { module: './implementation.mjs', export: 'own' } },
    }, `export const wrap = previous => () => '${name}(' + previous() + ')'; export const own = () => 'only-${name}';`);
    const result = await f.load(), active = order.filter(name => mask & (1 << names.indexOf(name)));
    assert.equal(result.components['core.shared'](), active.reduce((text, name) => `${name}(${text})`, 'base'));
    for (const name of names) assert.equal(result.components[`core.${name}`]?.(), active.includes(name) ? `only-${name}` : undefined);
    assert.deepEqual(result.composition.selection.components['core.shared'].chain.map(entry => entry.ownerId), ['defaults', ...active]);
  }
});

test('a later replacement removes only the old shared chain, never its independent exports', async t => {
  const f = fixture(t), marker = path.join(f.root, 'calls.txt');
  f.write('a', { components: {
    'core.shared': { module: './implementation.mjs', export: 'unused', mode: 'wrap' },
    'core.a': { module: './implementation.mjs', export: 'own' },
  } }, `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'module-a');export function unused(){throw new Error('shadowed wrapper called');}export const own=()=> 'only-a';`);
  f.write('b', { order: 1, components: { 'core.shared': './implementation.mjs', 'core.b': './implementation.mjs' } });
  f.write('c', { order: 2, components: { 'core.shared': { module: './implementation.mjs', mode: 'wrap' } } }, `export default previous=>()=> 'c('+previous()+')';`);
  const { components, composition } = await f.load();
  assert.equal(components['core.shared'](), 'c(b)');
  assert.equal(components['core.a'](), 'only-a'); assert.equal(components['core.b'](), 'b');
  assert.equal(fs.readFileSync(marker, 'utf8'), 'module-a', 'a module still loads when another selected export needs it');
  assert.deepEqual(composition.selection.components['core.shared'].history.map(entry => [entry.ownerId, entry.active]), [['defaults', false], ['a', false], ['b', true], ['c', true]]);
  assert.deepEqual(composition.conflicts.find(entry => entry.target === 'component:core.shared').chain, ['b', 'c']);
});

test('wrapping a missing target and unknown modes fail before native modules run', async t => {
  const f = fixture(t);
  f.write('a', { components: { 'new.service': { module: './implementation.mjs', mode: 'wrap' } } }, `throw new Error('must not evaluate');`);
  await assert.rejects(f.load(), /没有可调用/);
  f.write('a', { components: { 'core.shared': { module: './implementation.mjs', mode: 'guess' } } }, `throw new Error('must not evaluate');`);
  await assert.rejects(f.load(), /未知组件组合模式/);
  f.write('a', { version: 1, components: { 'core.shared': { module: './implementation.mjs', mode: 'wrap' } } }, `throw new Error('must not evaluate');`);
  await assert.rejects(f.load(), /需要 version:2/);
});

test('ordering ties are deterministic, visible, and inspection executes no contributed code', async t => {
  const f = fixture(t);
  for (const name of ['b', 'a']) f.write(name, { components: { 'core.shared': './implementation.mjs' } }, `throw new Error('inspection must not execute');`);
  const result = await describeComposition({ appRoot: f.root, defaults: { 'core.shared': () => 'base' } });
  assert.equal(result.selection.components['core.shared'].ownerId, 'b');
  assert.equal(result.conflicts[0].tiedOrder, true); assert.equal(result.conflicts[0].winner, 'b');
  assert.ok(!JSON.stringify(result).includes(f.root), 'diagnostics reveal logical ownership, not filesystem paths');
});

test('reserved ids, asset aliases and reserved endpoints reject structural ambiguity before imports', async t => {
  const f = fixture(t);
  for (const id of ['host', 'defaults']) { f.write('a', { id }); await assert.rejects(f.load(), /非保留/); }
  for (const assets of [
    { 'shell/panels/icons.js': './implementation.mjs', 'panels/icons.js': './implementation.mjs' },
    { 'shell/api/private.js': './implementation.mjs' }, { 'shell/events/private.js': './implementation.mjs' },
  ]) {
    f.write('a', { ui: { assets }, components: { 'core.shared': './implementation.mjs' } }, `throw new Error('must not evaluate');`);
    await assert.rejects(f.load(), /重复静态资源|保留的静态资源/);
  }
  const folder = f.write('a', { components: { 'core.shared': './implementation.mjs' } }, `throw new Error('must not evaluate');`);
  fs.writeFileSync(path.join(folder, 'composition.json'), '{"routeConfig":"synthetic-private-value",');
  await assert.rejects(f.load(), error => /清单不是有效 JSON：a/.test(error.message) && !error.message.includes('synthetic-private-value'));
});

test('method wrapping preserves private getters, frozen receivers and both independent enhancements', () => {
  class Service { #number = 3; get number() { return this.#number; } shared(n) { return this.#number + n; } original() { return this.#number; } }
  const base = Object.freeze(new Service());
  const a = wrapMethods(base, { shared: (next, n) => next(n) * 2, onlyA: () => 'a' });
  const b = wrapMethods(a, { shared: (next, n) => next(n) + 10, onlyB: () => 'b' });
  assert.equal(b.shared(2), 20); assert.equal(b.onlyA(), 'a'); assert.equal(b.onlyB(), 'b');
  assert.equal(b.number, 3); assert.equal(b.original(), 3); assert.equal(base.shared(2), 5);
  const before = b.shared; b.shared = (...args) => before(...args) + 1;
  assert.equal(b.shared(2), 21); assert.equal(a.shared(2), 10, 'host guard assignment does not mutate the previous layer');
  assert.throws(() => wrapMethods(base, { number() {} }), /不是可包装方法/);
});

test('authenticated conflict diagnostics show winners without exposing native paths, modules or route config', async t => {
  const f = fixture(t);
  f.write('a', { components: { 'core.shared': './implementation.mjs' } });
  f.write('b', { order: 1, components: { 'core.shared': './implementation.mjs' }, routes: [{ id: 'private', module: './implementation.mjs', config: { secret: 'synthetic-not-public' } }] });
  const { composition } = await f.load();
  const config = createConfig({ dataDir: path.join(f.root, 'data'), defaults: buildDefaultConfig(), log: {} }); config.load();
  config.update({ server: { port: 0, token: 'synthetic-conflict176-token' } });
  const http = createHttpServer({ config, staticDir: f.root, log: {} });
  registerConsoleRoutes(http, { config, composition, version: '0.5.0', dataDir: path.join(f.root, 'data') });
  t.after(() => http.close());
  const port = await http.listen(), url = `http://127.0.0.1:${port}/api/composition`;
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { 'x-console-token': 'synthetic-conflict176-token' } });
  const value = await response.json(); assert.equal(value.conflicts[0].winner, 'b');
  const serialized = JSON.stringify(value); assert.ok(!serialized.includes(f.root)); assert.ok(!serialized.includes('synthetic-not-public'));
  assert.ok(!serialized.includes('register')); assert.ok(!serialized.includes('implementation.mjs'));
});

test('two layers can change a shared file within one page while keeping that page’s other independent files', async t => {
  const f = fixture(t);
  const a = f.write('a', { ui: {
    panels: [{ id: 'sessions', title: 'A page', entry: 'index.html', assetRoot: './page', permissions: [] }],
    assets: { 'panels/sessions/style.css': './a.css', 'panels/feature-a.js': './a-feature.js', 'panels/fonts/theme.woff': './theme.woff' },
  } });
  fs.mkdirSync(path.join(a, 'page'));
  fs.writeFileSync(path.join(a, 'page', 'index.html'), '<!doctype html><link rel="stylesheet" href="style.css"><button id="independent-a">A</button><script src="panel.js"></script>');
  fs.writeFileSync(path.join(a, 'page', 'panel.js'), 'window.independentA=true;');
  fs.writeFileSync(path.join(a, 'page', 'style.css'), '/* root-a */');
  fs.writeFileSync(path.join(a, 'a.css'), '/* explicit-a */');
  fs.writeFileSync(path.join(a, 'a-feature.js'), 'export const a=true;');
  fs.writeFileSync(path.join(a, 'theme.woff'), 'synthetic-font-bytes');
  const b = f.write('b', { order: 1, ui: { assets: { 'panels/sessions/style.css': './b.css', 'panels/feature-b.js': './b-feature.js' } } });
  fs.writeFileSync(path.join(b, 'b.css'), '/* explicit-b */');
  fs.writeFileSync(path.join(b, 'b-feature.js'), 'export const b=true;');
  const { composition } = await f.load(), resolve = createUiAssetResolver(composition.ui);
  const config = createConfig({ dataDir: path.join(f.root, 'data'), defaults: buildDefaultConfig(), log: {} }); config.load(); config.update({ server: { port: 0 } });
  const http = createHttpServer({ config, staticDir: f.root, uiAssetResolver: resolve, log: {} }); t.after(() => http.close());
  const port = await http.listen(), get = async file => { const response = await fetch(`http://127.0.0.1:${port}${file}`); assert.equal(response.status, 200); return response.text(); };
  assert.match(await get('/panels/sessions/index.html'), /independent-a/);
  assert.match(await get('/panels/sessions/panel.js'), /independentA/);
  assert.equal(await get('/panels/sessions/style.css'), '/* explicit-b */');
  assert.match(await get('/panels/feature-a.js'), /a=true/); assert.match(await get('/panels/feature-b.js'), /b=true/);
  assert.equal(await get('/panels/fonts/theme.woff'), 'synthetic-font-bytes', 'an accepted font contribution also reaches the HTTP resolver');
  assert.equal(composition.selection.ui.panels.sessions.ownerId, 'a');
  assert.equal(composition.selection.ui.assets['panels/sessions/style.css'].ownerId, 'b');
});
