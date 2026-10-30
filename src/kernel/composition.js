// Boot-time composition is an administrator-owned native-code boundary. Ordinary
// skill/plugin ZIPs never populate overrides/. Stateful implementations are bound
// once per application generation, before any stores, timers or listeners exist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from './env.js';
import { createCompositionLifecycle } from './composition-lifecycle.js';
import { resolveCompositionSelection } from './composition-selection.js';

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i;
const CODE = new Set(['.js', '.mjs', '.cjs']);
const ASSET = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2']);
const own = (value, key) => Object.hasOwn(value, key);
const preparedCompositions = new WeakSet();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`[composition] ${message}`); };
function safeKey(key) {
  if (!KEY.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail(`非法组件名 ${key}`);
  return key;
}
function relative(value) {
  if (typeof value !== 'string' || value.length > 512 || /[\\:%\x00-\x1f?#]/.test(value)) fail('路径必须为层目录内的相对路径');
  const clean = value.startsWith('./') ? value.slice(2) : value;
  if (!clean || clean.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) fail(`非法相对路径 ${value}`);
  return clean;
}
function contained(root, value, directory = false) {
  const clean = relative(value);
  let current = root;
  for (const part of clean.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail(`不接受符号链接 ${value}`);
  }
  const resolved = fs.realpathSync(current), rel = path.relative(root, resolved);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail(`路径越界 ${value}`);
  const stat = fs.statSync(resolved);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail(`路径类型错误 ${value}`);
  return resolved;
}
function moduleDefinition(root, value) {
  const definition = typeof value === 'string' ? { module: value } : value;
  if (!object(definition)) fail('模块声明必须是对象或相对路径');
  const filename = contained(root, definition.module);
  if (!CODE.has(path.extname(filename))) fail(`模块必须为 JS/ESM 文件 ${definition.module}`);
  const exported = definition.export ?? 'default';
  if (typeof exported !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(exported)) fail('模块导出名非法');
  const mode = definition.mode ?? 'replace';
  if (!['replace', 'wrap'].includes(mode)) fail(`未知组件组合模式 ${mode}`);
  return { filename, exported, mode };
}
async function implementation(definition) {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(definition.filename)).digest('hex');
  const url = pathToFileURL(definition.filename); url.searchParams.set('composition', digest);
  const module = await import(url.href), value = module[definition.exported];
  if (typeof value !== 'function') fail(`${definition.filename} 的 ${definition.exported} 不是函数`);
  return value;
}
function readLayers(appRoot) {
  const root = fs.realpathSync(appRoot), directory = path.join(root, 'overrides');
  if (!fs.existsSync(directory)) return [];
  if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) fail('overrides 必须是实际目录');
  const layers = [], ids = new Set();
  for (const name of fs.readdirSync(directory).sort()) {
    const folder = path.join(directory, name), stat = fs.lstatSync(folder);
    if (stat.isSymbolicLink()) fail(`不接受层目录符号链接 ${name}`);
    if (!stat.isDirectory()) continue;
    const manifest = path.join(folder, 'composition.json');
    if (!fs.existsSync(manifest)) continue;
    if (fs.lstatSync(manifest).isSymbolicLink() || fs.statSync(manifest).size > 64 * 1024) fail(`层清单非法或超过 64KiB ${name}`);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(manifest, 'utf8').replace(/^\uFEFF/, '')); }
    catch { fail(`层清单不是有效 JSON：${name}`); }
    if (!object(raw) || ![1, 2].includes(raw.version) || !ID.test(raw.id ?? '') || ['host', 'defaults'].includes(raw.id)) fail(`层必须声明 version:1/2 和合法非保留 id：${name}`);
    if (ids.has(raw.id)) fail(`重复层 id ${raw.id}`);
    ids.add(raw.id);
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') fail(`enabled 必须为布尔值 ${raw.id}`);
    if (raw.enabled === false) continue;
    if (!Number.isSafeInteger(raw.order ?? 0)) fail(`order 必须为整数 ${raw.id}`);
    if (raw.requires !== undefined && (!Array.isArray(raw.requires) || !raw.requires.every(id => typeof id === 'string' && ID.test(id)))) fail(`requires 必须为层 id 数组 ${raw.id}`);
    if (layers.length >= 64) fail('最多允许 64 个组合层');
    layers.push({ ...raw, root: fs.realpathSync(folder), directory: name, order: raw.order ?? 0 });
  }
  layers.sort((a, b) => a.order - b.order || (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0));
  const mounted = new Set();
  for (const layer of layers) {
    for (const dependency of layer.requires ?? []) if (!mounted.has(dependency)) fail(`${layer.id} 依赖尚未挂载的层 ${dependency}`);
    mounted.add(layer.id);
  }
  return layers;
}
function prepareLayer(layer) {
  const components = [], routes = [], ui = { panels: [], assets: {} };
  for (const key of Object.keys(layer)) if (!['version', 'id', 'enabled', 'order', 'requires', 'components', 'routes', 'ui', 'root', 'directory'].includes(key)) fail(`未知层字段 ${layer.id}/${key}`);
  if (layer.components !== undefined && !object(layer.components)) fail(`components 必须为对象 ${layer.id}`);
  for (const [key, definition] of Object.entries(layer.components ?? {})) {
    const normalized = moduleDefinition(layer.root, definition);
    if (normalized.mode === 'wrap' && layer.version < 2) fail(`组件包装需要 version:2 清单 ${layer.id}/${key}`);
    components.push({ key: safeKey(key), ...normalized });
  }
  if (layer.routes !== undefined && !Array.isArray(layer.routes)) fail(`routes 必须为数组 ${layer.id}`);
  const routeIds = new Set();
  for (const route of layer.routes ?? []) {
    if (!object(route) || !ID.test(route.id ?? '') || routeIds.has(route.id)) fail(`路由贡献 id 非法或重复 ${layer.id}`);
    routeIds.add(route.id);
    if (route.config !== undefined && !object(route.config)) fail(`路由 config 必须为对象 ${layer.id}/${route.id}`);
    const definition = moduleDefinition(layer.root, route);
    if (definition.mode !== 'replace') fail('路由模块不使用组件 wrap 模式，请注册具名控制器');
    routes.push({ id: `${layer.id}/${route.id}`, config: structuredClone(route.config ?? {}), ...definition });
  }
  if (layer.ui !== undefined && !object(layer.ui)) fail(`ui 必须为对象 ${layer.id}`);
  if (layer.ui?.shell !== undefined) {
    ui.shell = contained(layer.root, layer.ui.shell, true);
    contained(ui.shell, 'index.html');
  }
  if (layer.ui?.assets !== undefined && !object(layer.ui.assets)) fail('ui.assets 必须为对象');
  for (const [url, file] of Object.entries(layer.ui?.assets ?? {})) {
    let key = relative(url);
    if ((!key.startsWith('shell/') && !key.startsWith('panels/')) || key.startsWith('panels/u/') || !ASSET.has(path.extname(key))) fail(`非法静态资源目标 ${url}`);
    const requestPath = '/' + (key.startsWith('shell/') ? key.slice(6) : key);
    if (/^\/(?:api|events)(?:\/|$)/.test(requestPath) || /^\/panels\/u(?:\/|$)/.test(requestPath)) fail(`保留的静态资源目标 ${url}`);
    if (key.startsWith('shell/panels/')) key = key.slice(6);
    if (own(ui.assets, key)) fail(`重复静态资源目标 ${url}`);
    const filename = contained(layer.root, file);
    if (!ASSET.has(path.extname(filename))) fail(`静态资源类型不受支持 ${file}`);
    ui.assets[key] = filename;
  }
  if (layer.ui?.panels !== undefined && !Array.isArray(layer.ui.panels)) fail('ui.panels 必须为数组');
  const panels = new Set();
  for (const panel of layer.ui?.panels ?? []) {
    if (!object(panel) || !/^[A-Za-z0-9_-]{1,64}$/.test(panel.id ?? '') || panel.id === 'u' || panels.has(panel.id)) fail(`页面 id 非法或重复 ${layer.id}`);
    panels.add(panel.id);
    if (typeof panel.title !== 'string' || !panel.title.trim()) fail(`页面缺少标题 ${panel.id}`);
    if (!Array.isArray(panel.permissions) || !panel.permissions.every(scope => typeof scope === 'string')) fail(`页面必须声明 permissions ${panel.id}`);
    const assetRoot = contained(layer.root, panel.assetRoot, true), entry = relative(panel.entry ?? 'index.html');
    if (!entry.endsWith('.html')) fail(`页面 entry 必须为 HTML ${panel.id}`);
    contained(assetRoot, entry);
    const api = panel.api ?? [];
    if (!Array.isArray(api) || !api.every(rule => object(rule) && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(rule.method) && /^\/api(?:\/[A-Za-z0-9._~-]+|\/:id|\/:key|\/:uid)*$/.test(rule.path ?? ''))) fail(`页面 API 契约非法 ${panel.id}`);
    ui.panels.push({ id: panel.id, title: panel.title.trim(), entry, permissions: [...panel.permissions], api: structuredClone(api), assetRoot });
  }
  return { layer, components, routes, ui };
}

export async function loadComposition({ appRoot = APP_ROOT, defaults = null, components: supplied = {} } = {}) {
  // Validate the complete filesystem plan before evaluating any added module.
  const plan = readLayers(appRoot).map(prepareLayer);
  const base = defaults ?? (await import('../../bundled/runtime-defaults/components.js')).defaultComponents;
  if (!object(base) || !object(supplied)) fail('默认及调用方 components 必须为对象');
  for (const [key, value] of [...Object.entries(base), ...Object.entries(supplied)]) {
    safeKey(key); if (typeof value !== 'function') fail(`组件必须是函数 ${key}`);
  }
  const components = Object.assign(Object.create(null), base);
  const resolved = resolveCompositionSelection(plan, Object.keys(base), Object.keys(supplied));
  const owners = Object.fromEntries(Object.entries(resolved.selection.components).map(([key, entry]) => [key, entry.ownerId]));
  const composition = { version: 1, layers: resolved.layers, owners, routes: [], ui: resolved.ui, selection: resolved.selection, conflicts: resolved.conflicts };
  // Resolve every structural conflict before evaluating added native modules.
  for (const [key, chain] of resolved.chains) {
    let current = base[key];
    for (const contribution of chain) {
      if (contribution.ownerId === 'defaults') { current = base[key]; continue; }
      if (contribution.ownerId === 'host') { current = supplied[key]; continue; }
      const candidate = await implementation(contribution.definition);
      if (contribution.mode === 'replace') current = candidate;
      else {
        const previous = current;
        const previousOwnerId = chain[chain.indexOf(contribution) - 1]?.ownerId;
        current = await candidate(previous, Object.freeze({ key, ownerId: contribution.ownerId, previousOwnerId }));
        if (typeof current !== 'function') fail(`组件包装器 ${key}/${contribution.ownerId} 必须返回函数`);
      }
    }
    components[key] = current;
  }
  for (const item of plan) {
    for (const definition of item.routes) composition.routes.push({ id: definition.id, config: definition.config, register: await implementation(definition) });
  }
  for (const [key, value] of Object.entries(components)) if (typeof value !== 'function') fail(`组件必须是函数 ${key}`);
  const result = { components: Object.freeze(components), composition };
  preparedCompositions.add(result);
  return result;
}

export function inspectComposition({ appRoot = APP_ROOT } = {}) {
  return readLayers(appRoot).map(prepareLayer).map(({ layer, components, routes, ui }) => ({
    id: layer.id, order: layer.order, requires: [...(layer.requires ?? [])],
    components: components.map(({ key, filename, exported, mode }) => ({ key, module: filename, export: exported, mode })),
    routes: routes.map(({ id, filename, exported }) => ({ id, module: filename, export: exported })),
    ui,
  }));
}

export async function describeComposition(options = {}) {
  const plan = readLayers(options.appRoot ?? APP_ROOT).map(prepareLayer);
  const defaults = options.defaults ?? (await import('../../bundled/runtime-defaults/components.js')).defaultComponents;
  const { layers, selection, conflicts } = resolveCompositionSelection(plan, Object.keys(defaults), Object.keys(options.components ?? {}));
  return { version: 1, layers, selection, conflicts };
}

export async function createApplication(options = {}, prepared = null) {
  const lifecycle = options.lifecycle ?? createCompositionLifecycle();
  if (!lifecycle?.signal || typeof lifecycle.onStop !== 'function' || typeof lifecycle.close !== 'function' || typeof lifecycle.cancel !== 'function') fail('应用生命周期接口非法');
  let application;
  try {
    if (prepared !== null && !preparedCompositions.has(prepared)) fail('启动计划必须由 loadComposition 校验');
    const { components, composition } = prepared ?? await loadComposition({ appRoot: options.appRoot ?? APP_ROOT, components: options.components });
    const factory = components['runtime.kernel'];
    if (typeof factory !== 'function') fail('缺少 runtime.kernel');
    application = await factory({ ...options, components, composition, lifecycle });
    if (!application || typeof application.start !== 'function' || typeof application.stop !== 'function') fail('runtime.kernel 必须返回 start/stop 应用接口');
  } catch (error) {
    try { await lifecycle.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], '组合创建与清理失败'); }
    throw error;
  }
  const start = application.start.bind(application), stop = application.stop.bind(application);
  const managedStart = async (...args) => {
    if (lifecycle.signal.aborted) fail('组合实例已停止，请创建新的应用实例');
    try { return await start(...args); }
    catch (error) {
      const errors = [error];
      lifecycle.cancel(error);
      try { await stop(); } catch (cleanup) { errors.push(cleanup); }
      try { await lifecycle.close(); } catch (cleanup) { errors.push(cleanup); }
      if (errors.length > 1) throw new AggregateError(errors, '组合启动与清理失败');
      throw error;
    }
  };
  const managedStop = async (...args) => {
    const errors = [];
    lifecycle.cancel();
    try { await stop(...args); } catch (error) { errors.push(error); }
    try { await lifecycle.close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, '组合停止失败');
  };
  // Do not mutate a custom assembly: frozen instances and private-field getters
  // are valid implementations of the application contract.
  const bound = new Map();
  return new Proxy({}, {
    get(_target, key) {
      if (key === 'start') return managedStart;
      if (key === 'stop') return managedStop;
      const value = Reflect.get(application, key, application);
      if (typeof value !== 'function') return value;
      if (!bound.has(value)) bound.set(value, value.bind(application));
      return bound.get(value);
    },
    set(_target, key, value) { return Reflect.set(application, key, value, application); },
    has(_target, key) { return key in application; },
    ownKeys() { return Reflect.ownKeys(application); },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Object.getOwnPropertyDescriptor(application, key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
