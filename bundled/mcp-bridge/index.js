// MCP 客户端桥：传输与 OS 副作用由注入的 mcp adapter 承担。
import { createMcpProcessAdapter } from './adapter.js';
const SAFE_SCOPE_NAMES = new Set(['qq.send', 'net.outbound', 'fs.namespace', 'fs.outsideNamespace', 'proc.exec', 'data.memory.read', 'data.sessions.read', 'ui.panel', 'scheduler', 'mcp.connect']);
const NEVER_SCOPES = new Set(['net.raw']);
const idPart = (value) => String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20) || 'server';
function hash(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
async function scopeDecision(ctx, scope, detail) {
  if (NEVER_SCOPES.has(scope)) return { decision: 'deny', reason: '该权限不开放授权' };
  if (!SAFE_SCOPE_NAMES.has(scope)) return { decision: 'deny', reason: `未知权限范围 ${scope}` };
  const checker = ctx?.permissions?.request;
  if (typeof checker !== 'function') return { decision: 'deny', reason: 'MCP 权限适配器不可用' };
  try { return await checker(scope, detail); }
  catch (error) { return { decision: 'deny', reason: '权限检查失败' }; }
}
export function createMcpBridge({ ctx, adapter = ctx?.capability?.('process.mcp'), log = ctx?.log ?? console, register = true } = {}) {
  const children = new Map(); const connecting = new Map(); const dynamicToolIds = new Map(); let stopped = false;
  const report = (category) => { try { log?.warn?.(`[mcp-bridge] ${String(category).replace(/[^a-z_]/gi, '_')}`); } catch {} };
  const permission = (scope, detail) => scopeDecision(ctx, scope, detail);
  const removeTools = (serverId) => { for (const id of dynamicToolIds.get(serverId) ?? []) ctx?.unregisterTool?.(id); dynamicToolIds.delete(serverId); };
  const stopServer = (serverId, reason = 'stop') => { serverId = String(serverId); connecting.delete(serverId); const state = children.get(serverId); if (!state) { removeTools(serverId); return; } state.closed = true; try { state.stop?.(reason); } catch {} children.delete(serverId); removeTools(serverId); };
  function registerTool(server, state, tool) {
    const originalName = String(tool?.name ?? '').trim(); if (!originalName) return null;
    const source = `mcp:${server.id}`; const id = `mcp_${idPart(server.id)}_${idPart(originalName)}_${hash(`${source}\0${originalName}`)}`.slice(0, 64);
    const scopes = [...new Set((Array.isArray(tool.scopes) ? tool.scopes : server.scopes ?? ['mcp.connect']).map(String))];
    const def = { id, name: tool.title || originalName, description: tool.description || `MCP 工具 ${originalName}`, params: tool.inputSchema || { type: 'object', properties: {} }, scopes, ownerId: 'mcp-bridge', skillId: 'mcp-bridge', bundled: true, source, originalName, execute: async (args) => { if (stopped || state.closed) throw new Error('MCP server 不可用'); for (const scope of scopes) { const v = await permission(scope, `${source}/${originalName}`); if (v?.decision !== 'allow') throw new Error(`权限不足：${v?.reason ?? scope}`); if (stopped || state.closed) throw new Error('MCP server 不可用'); } return state.request('tools/call', { name: originalName, arguments: args ?? {} }); } };
    try { const id2 = ctx?.registerTool?.(def); if (!id2) throw new Error('工具注册表不可用'); (dynamicToolIds.get(server.id) ?? dynamicToolIds.set(server.id, []).get(server.id)).push(id2); return id2; } catch (error) { report('tool_registration_error'); return null; }
  }
  async function connect(spec) {
    if (!spec?.id || !spec?.command) throw new Error('MCP server 配置不可用');
    if (stopped) throw new Error('MCP bridge 已停止');
    const serverId = String(spec.id);
    if (children.has(serverId) || connecting.has(serverId)) throw new Error('MCP server id 已连接或正在连接');
    if (spec.interactive || spec.tty || spec.stdin === 'tty') throw new Error('interactive_tty_denied');
    // Reserve before the first permission await. stopServer invalidates this
    // attempt so a replacement may start while an old request is still settling.
    const attempt = {};
    connecting.set(serverId, attempt);
    let state;
    const current = () => !stopped && connecting.get(serverId) === attempt && (!state || (!state.closed && children.get(serverId) === state));
    const checkCurrent = () => { if (!current()) throw new Error('MCP bridge 或连接已停止'); };
    const stopOwned = (reason) => {
      if (connecting.get(serverId) === attempt) connecting.delete(serverId);
      if (!state) return;
      state.closed = true; try { state.stop?.(reason); } catch {}
      if (children.get(serverId) === state) { children.delete(serverId); removeTools(serverId); }
    };
    const onAdapterError = ({ category, fatal } = {}) => {
      report(category ?? 'adapter_error');
      if (fatal && state && !state.closed) stopOwned(category ?? 'fatal');
    };
    try {
      for (const scope of [...new Set([...(spec.scopes ?? []), ...(spec.netRaw ? ['net.raw'] : []), 'mcp.connect', 'proc.exec'].map(String))]) {
        const v = await permission(scope, `MCP ${serverId}`);
        if (v?.decision !== 'allow') throw new Error(`MCP 权限不足：${v?.reason ?? scope}`);
        checkCurrent();
      }
      if (!adapter?.startServer) throw new Error('MCP adapter unavailable');
      try { const transport = adapter.startServer(spec, { onError: onAdapterError }); state = { ...transport, closed: false }; children.set(serverId, state); }
      catch (error) { report(adapter.redactError?.(error) ?? 'adapter_error'); throw new Error('MCP server unavailable'); }
      await state.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'qq-agent-mcp-bridge', version: '0.5.0' } });
      checkCurrent(); state.notify('notifications/initialized', {});
      const listing = await state.request('tools/list', {}); checkCurrent();
      for (const tool of listing?.tools ?? []) registerTool({ ...spec, id: serverId }, state, tool);
      return { id: spec.id, tools: dynamicToolIds.get(serverId) ?? [] };
    } catch (error) { report('protocol_error'); stopOwned('protocol'); throw error; }
    finally { if (connecting.get(serverId) === attempt) connecting.delete(serverId); }
  }
  async function start(servers = []) { const out = []; for (const spec of Array.isArray(servers) ? servers : []) try { out.push(await connect(spec)); } catch (error) { report('server_unavailable'); } return out; }
  async function stop() { if (stopped) { try { adapter?.stopAll?.(); } catch {} return; } stopped = true; connecting.clear(); for (const id of [...children.keys()]) stopServer(id, 'shutdown'); try { adapter?.stopAll?.(); } catch {} if (register) ctx?.unregisterCapability?.('mcp.tools'); }
  const api = { start, stop, connect, stopServer, list: () => [...children.keys()], registerTool };
  if (register) { ctx?.registerCapability?.('mcp.tools', api); ctx?.lifecycle?.onStop?.(stop); }
  return api;
}
let activeService;
export default { setup(ctx) {
  const adapter = createMcpProcessAdapter({ log: ctx.log });
  ctx.registerCapability('process.mcp', adapter, { default: true });
  ctx.lifecycle?.onStop?.(() => adapter.stopAll());
  let bridge = null, starting = null;
  const currentBridge = () => { if (!bridge) throw new Error('MCP 服务尚未就绪'); return bridge; };
  const service = {
    start() {
      if (bridge) return starting;
      const next = createMcpBridge({ ctx, register: false }); bridge = next;
      starting = next.start(ctx.config?.get?.('servers') ?? []).finally(() => { if (bridge === next) starting = null; });
      return starting;
    },
    stop() { const owned = bridge; bridge = null; starting = null; return owned?.stop(); },
  };
  // Keep one published API while each authorized service generation owns an
  // independent bridge. An old stop/result cannot touch its successor's tools.
  ctx.registerCapability('mcp.tools', {
    start: async (...args) => currentBridge().start(...args),
    connect: async (...args) => currentBridge().connect(...args),
    stop: async () => service.stop(),
    stopServer: (...args) => bridge?.stopServer(...args),
    list: () => bridge?.list() ?? [],
    registerTool: (...args) => currentBridge().registerTool(...args),
  });
  ctx.registerCapability('mcp.service', service, { default: true, lifecycle: true, scopes: ['proc.exec', 'mcp.connect'] });
  ctx.lifecycle?.onStop?.(() => service.stop());
  activeService = service;
}, deactivate() { return activeService?.stop?.(); } };
