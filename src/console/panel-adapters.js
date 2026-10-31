// 用户面板窄宿主接口。Node 插件不是沙箱；只加载可信代码。
// iframe 不拿 token/ctx/路径，仅可调用自身工具和读取自身脱敏配置。
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeConfigForApi, SECRET_KEY_PATTERN } from '../kernel/config.js';
import { buildToolAvailabilityContext } from '../kernel/tools.js';
import { createUiAssetResolver } from './ui-composition.js';
import { createPanelMetadata } from './panel-metadata.js';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const SAFE_PATH = /^\/api(?:\/[A-Za-z0-9._~-]+|\/:id|\/:key|\/:uid)*$/;
const ASSET_EXT = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff2']);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function fail(message, status = 403) { throw Object.assign(new Error(message), { expose: true, status }); }
function safeSegments(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 512 && !value.includes('\\') && !value.includes('%') && !value.includes(':') && !/[\x00-\x1f?#]/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..' && !part.startsWith('.'));
}
function normalize(raw, ownerId = null) {
  if (!raw || !ID_RE.test(raw.id ?? '') || typeof raw.title !== 'string' || !raw.title.trim()) return null;
  const entry = raw.entry ?? 'index.html';
  if (!safeSegments(entry) || !entry.endsWith('.html')) return null;
  if (!Array.isArray(raw.permissions) || !raw.permissions.every((scope) => typeof scope === 'string')) return null;
  if (ownerId && !raw.permissions.includes('ui.panel')) return null;
  const api = raw.api ?? [];
  if (!Array.isArray(api) || !api.every((rule) => METHODS.has(rule?.method) && SAFE_PATH.test(rule.path ?? '') && (!ownerId || rule.path.startsWith(`/api/${ownerId}/`)))) return null;
  return { id: raw.id, title: raw.title.trim(), kind: ownerId ? 'user' : 'bundled', entry, permissions: [...raw.permissions], api: structuredClone(api), ...(ownerId ? { ownerId } : {}) };
}
function inside(root, file) {
  const rel = path.relative(root, file);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function createPanelAdapters({ loader, permissions, registry, config, bundledManifest = { panels: [] }, ui = {}, uiSelection = {}, staticRoot, metadataFactory = createPanelMetadata, log = console } = {}) {
  const cfg = () => config?.get?.() ?? {};
  // Trusted boot layers may replace a default page. Plugin-provided manifests
  // never enter this map and cannot acquire the bundled RPC role by reusing id.
  const bundledPanels = new Map();
  for (const raw of bundledManifest.panels ?? []) {
    const panel = normalize(raw);
    if (panel && !bundledPanels.has(panel.id)) bundledPanels.set(panel.id, panel);
  }
  for (const raw of ui.panels ?? []) {
    const panel = normalize(raw);
    if (!panel || panel.id === 'u') throw new Error('Invalid trusted UI panel manifest');
    bundledPanels.set(panel.id, panel);
  }
  const resolveUiAsset = createUiAssetResolver(ui, { selection: uiSelection });
  const bundledSnapshot = metadataFactory({ panels: [...bundledPanels.values()], defaultPanels: bundledManifest.panels ?? [], ui, resolveUiAsset, staticRoot, log });
  function entryFor(id) { return loader?.hostEntry?.(id) ?? null; }
  function declaredScopes(entry) {
    return [...new Set((entry.manifest.permissions ?? []).map((scope) => scope === 'web_fetch' ? 'net.outbound' : scope))];
  }
  function listPanels() {
    const panels = [], seen = new Set();
    for (const panel of bundledSnapshot) { panels.push(structuredClone(panel)); seen.add(panel.id); }
    for (const dto of loader?.listEntries?.() ?? []) {
      const entry = entryFor(dto.id);
      if (!entry || entry.status !== 'active' || !loader.contentCurrent(dto.id) || !permissions?.isGranted(dto.id, 'ui.panel', entry.fingerprint)) continue;
      for (const raw of entry.manifest.panels ?? []) {
        if (raw.entry && typeof raw.entry !== 'string') continue;
        const panel = normalize(raw, dto.id);
        if (!panel || seen.has(panel.id)) { log.warn?.(`[panels] 拒绝非法或重复面板 ${dto.id}`); continue; }
        // dedicated ui/ 是唯一公开目录；清单 entry 相对 ui/，不接受源码根路径。
        try {
          const root = fs.realpathSync(path.join(entry.dir, 'ui'));
          if (!inside(fs.realpathSync(entry.dir), root) || fs.lstatSync(path.join(entry.dir, 'ui')).isSymbolicLink()) continue;
          const html = fs.realpathSync(path.join(root, panel.entry));
          if (!inside(root, html) || !fs.statSync(html).isFile()) continue;
        } catch { continue; }
        panel.generation = entry.generation;
        panel.stateOwner = panel.ownerId; panel.stateGeneration = entry.generation;
        panels.push(panel); seen.add(panel.id);
      }
    }
    return panels;
  }
  function authorize(panelId, generation) {
    const panel = listPanels().find((item) => item.id === panelId && item.kind === 'user');
    if (!panel || typeof generation !== 'string' || generation !== panel.generation) fail('面板未授权、已停用或已重载，请重新打开');
    const entry = entryFor(panel.ownerId);
    return { panel, entry };
  }
  function resolveAsset(pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    const match = decoded.match(/^\/panels\/u\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9-]+)\/(.+)$/);
    if (!match) return null;
    const [, id, generation, relative] = match;
    if (!safeSegments(relative) || !ASSET_EXT.has(path.extname(relative).toLowerCase())) return null;
    try {
      const { entry } = authorize(id, generation);
      const root = fs.realpathSync(path.join(entry.dir, 'ui'));
      const file = fs.realpathSync(path.join(root, relative));
      if (!inside(root, file) || !fs.statSync(file).isFile()) return null;
      return file;
    } catch { return null; }
  }
  function schemaPublic(value, rule = {}) {
    if (Array.isArray(value)) return value.map((item) => schemaPublic(item, rule.items ?? {}));
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const property = rule.properties?.[key] ?? {};
      if (SECRET_KEY_PATTERN.test(key) || property.secret || property.sensitive || property.format === 'password') out[`has${key[0].toUpperCase()}${key.slice(1)}`] = Boolean(value[key]);
      else out[key] = schemaPublic(value[key], property);
    }
    return out;
  }
  function publicConfig(entry) {
    const out = {};
    const settings = loader.skillSettings(entry.manifest);
    for (const key of Object.keys(entry.manifest.configSchema ?? {})) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const rule = entry.manifest.configSchema[key];
      const value = settings[key];
      if (SECRET_KEY_PATTERN.test(key) || rule?.secret || rule?.sensitive || rule?.format === 'password') out[`has${key[0].toUpperCase()}${key.slice(1)}`] = Boolean(value);
      else if (value !== undefined) out[key] = schemaPublic(sanitizeConfigForApi({ value }).value, rule);
    }
    return out;
  }
  function getConfig(panelId, generation, key) {
    const { entry } = authorize(panelId, generation);
    const all = publicConfig(entry);
    if (key === undefined || key === null) return all;
    if (typeof key !== 'string' || !own(entry.manifest.configSchema ?? {}, key)) fail('只能读取本插件声明的配置项');
    return own(all, key) ? all[key] : null;
  }
  // 配置页专用写回（独立于设置弹窗线路）：schema 校验 + 密钥 hasXxx 保留/清除语义。
  function setConfig(panelId, generation, patch) {
    const { panel, entry } = authorize(panelId, generation);
    const schema = entry.manifest.configSchema ?? {};
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('配置补丁必须是对象', 400);
    const settings = loader.skillSettings(entry.manifest);
    const changes = {};
    for (const key of Object.keys(patch)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('配置项名非法', 400);
      // 密钥保留/清除形态：hasXxx 布尔（Xxx 必须是清单声明的密钥字段）。true 保留现值，false 清除。
      // hasXxx 按读回视图的键名规则匹配（首字母大写），schema 键本身可为任意大小写。
      if (key.startsWith('has') && typeof patch[key] === 'boolean') {
        const real = Object.keys(schema).find((k) => `has${k[0].toUpperCase()}${k.slice(1)}` === key);
        if (real === undefined) fail('未声明的配置项', 400);
        const realRule = schema[real] ?? {};
        const realSecret = SECRET_KEY_PATTERN.test(real) || realRule.secret === true || realRule.sensitive === true || realRule.format === 'password';
        if (!realSecret) fail(`${real} 不是密钥字段，不接受保留标记`, 400);
        if (patch[key] === false) changes[real] = null;
        continue;
      }
      if (!own(schema, key)) fail('只能保存本插件声明的配置项', 400);
      const rule = schema[key] ?? {};
      const isSecret = SECRET_KEY_PATTERN.test(key) || rule.secret === true || rule.sensitive === true || rule.format === 'password';
      const value = patch[key];
      if (isSecret) {
        if (typeof value !== 'string' || !value.length) fail(`密钥字段 ${key} 需要非空字符串（保留现值用 has${key[0].toUpperCase()}${key.slice(1)}:true）`, 400);
        changes[key] = value; continue;
      }
      const type = rule.type ?? 'string';
      if (type === 'number') {
        if (typeof value === 'boolean' || value === null || value === '' || !Number.isFinite(Number(value))) fail(`配置项 ${key} 需要数字`, 400);
        changes[key] = Number(value); continue;
      }
      if (type === 'boolean') {
        if (typeof value !== 'boolean') fail(`配置项 ${key} 需要布尔值`, 400);
        changes[key] = value; continue;
      }
      if (typeof value !== 'string') fail(`配置项 ${key} 需要字符串`, 400);
      if (value.length > 8192) fail(`配置项 ${key} 过长`, 400);
      changes[key] = value;
    }
    const merged = { ...settings };
    for (const [k, v] of Object.entries(changes)) { if (v === null) delete merged[k]; else merged[k] = v; }
    // 条目级 __replace__：skills 子树可能尚未存在，deepMerge 对缺失 base 直接整段返回，
    // 内层标记不会被消费——必须在条目层显式替换并保留 enabled 等既有字段。
    const storedEntry = config.get().skills?.[entry.manifest.id] ?? {};
    config.update({ skills: { [entry.manifest.id]: { __replace__: { ...storedEntry, settings: merged } } } });
    log.info?.(`[panels] ${panel.ownerId} 配置页保存 ${Object.keys(changes).length} 项设置`);
    return { ok: true, config: publicConfig(entry) };
  }
  async function call(panelId, generation, toolId, args) {
    const { panel, entry } = authorize(panelId, generation);
    if (typeof toolId !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) fail('工具调用参数格式错误', 400);
    // 只能使用注册表中的最终 id。客户端提供的 owner/source/权限均不参与判定。
    const tool = registry?.get(toolId);
    if (!tool || tool.ownerId !== panel.ownerId || !entry.tools.includes(toolId)) fail('面板只能调用所属插件的工具');
    const available = registry.availability(toolId, buildToolAvailabilityContext(cfg(), loader));
    if (!available.ok) fail(available.reason, 409);
    const before = (id, params) => {
      authorize(panelId, generation);
      if (registry.get(id) !== tool) return { block: true, reason: '工具已替换' };
      const verdict = registry.availability(id, buildToolAvailabilityContext(cfg(), loader));
      return verdict.ok ? null : { block: true, reason: verdict.reason };
    };
    const hooks = (loader.hooksOf?.('before-tool') ?? []).map(({ fn }) => fn);
    const result = await registry.invoke(toolId, args, {
      execCtx: { source: 'panel', panelId, pluginId: panel.ownerId, cfg: entry.ctx?.config?.all?.() ?? {} },
      beforeToolHooks: [before, ...hooks],
      isCurrent: () => {
        try { authorize(panelId, generation); return registry.get(toolId) === tool && registry.availability(toolId, buildToolAvailabilityContext(cfg(), loader)).ok; }
        catch { return false; }
      },
    });
    authorize(panelId, generation);
    if (!result.ok) fail(result.error ?? '工具调用失败', 400);
    return result;
  }
  function authorization(pluginId) {
    const entry = entryFor(pluginId);
    if (!entry?.fingerprint || entry.rootKind === 'bundled' || !loader.contentCurrent(pluginId)) fail('插件尚未加载或代码已更新，请重新加载后授权', 409);
    return {
      pluginId, fingerprint: entry.fingerprint,
      warning: '插件在 Node 进程内执行，不是代码沙箱。只授权可信代码。',
      scopes: declaredScopes(entry).filter((scope) => permissions.scopes()[scope]).map((scope) => ({ scope, ...permissions.status(pluginId, scope) })),
    };
  }
  function setAuthorization(pluginId, body) {
    const info = authorization(pluginId);
    if (body?.fingerprint !== info.fingerprint || !['allow', 'deny', 'ask'].includes(body?.value)) fail('插件版本或授权决定无效', 409);
    if (!info.scopes.some((item) => item.scope === body.scope)) fail('插件未声明该权限');
    if (body.value === 'allow' && body.confirm !== true) fail('需要管理员显式确认');
    if (body.value === 'allow' && permissions.scopes()[body.scope]?.askable === false) fail('该权限不开放授权');
    if (!permissions.setOverride(pluginId, body.scope, body.value, { fingerprint: info.fingerprint })) fail('无法采用授权决定', 409);
    return { ok: true, authorization: authorization(pluginId) };
  }
  return { listPanels, resolveAsset, resolveUiAsset, call, getConfig, setConfig, authorization, setAuthorization };
}

export function registerPanelRoutes(http, adapters) {
  http.route('GET', '/api/panels', () => ({ panels: adapters.listPanels() }));
  http.route('POST', /^\/api\/panels\/(?<id>[A-Za-z0-9_-]{1,64})\/call$/, ({ params, body }) => adapters.call(params.id, body?.generation, body?.tool, body?.args ?? {}));
  http.route('POST', /^\/api\/panels\/(?<id>[A-Za-z0-9_-]{1,64})\/config$/, ({ params, body }) => adapters.getConfig(params.id, body?.generation, body?.key));
  http.route('POST', /^\/api\/panels\/(?<id>[A-Za-z0-9_-]{1,64})\/config\/save$/, ({ params, body }) => adapters.setConfig(params.id, body?.generation, body?.patch ?? {}));
  http.route('GET', /^\/api\/plugins\/(?<id>[A-Za-z0-9._-]+)\/permissions$/, ({ params }) => adapters.authorization(params.id));
  http.route('POST', /^\/api\/plugins\/(?<id>[A-Za-z0-9._-]+)\/permissions$/, ({ params, body }) => adapters.setAuthorization(params.id, body));
}
