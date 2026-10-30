import { EventEmitter } from 'node:events';
import { ok, eq, section, summary } from './helpers.mjs';
import { createMcpBridge } from '../bundled/mcp-bridge/index.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createMcpProcessAdapter } from '../src/console/mcp-adapter.js';

function fakeAdapter({ hang = false } = {}) {
  const children = [];
  return {
    startServer() {
      let stopped = false; const pending = new Map(); let seq = 0;
      const request = (method) => new Promise((resolve, reject) => {
        if (stopped) return reject(new Error('stopped'));
        const id = ++seq; pending.set(id, { resolve, reject });
        if (!hang) queueMicrotask(() => { const p = pending.get(id); if (!p) return; pending.delete(id); p.resolve(method === 'tools/list' ? { tools: [{ name: 'echo tool', description: 'echo', inputSchema: { type: 'object' }, scopes: ['mystery.scope'] }] } : {}); });
      });
      const state = { request, notify() {}, stop() { stopped = true; for (const p of pending.values()) p.reject(new Error('stopped')); pending.clear(); } }; children.push(state); return state;
    },
    stopAll() { for (const child of children) child.stop(); },
    redactError: () => 'adapter_error',
  };
}

function fakeSpawn({ hang = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = { write(line) {
    const req = JSON.parse(line);
    if (!req.id || hang) return true;
    let result = {};
    if (req.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: {} };
    if (req.method === 'tools/list') result = { tools: [{ name: 'echo tool', description: 'echo', inputSchema: { type: 'object' }, scopes: ['mystery.scope'] }] };
    if (req.method === 'tools/call') result = { content: [{ type: 'text', text: 'pong' }] };
    queueMicrotask(() => child.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: req.id, result })}\n`));
    return true;
  } };
  child.kill = () => { child.emit('exit', 0, null); return true; };
  return child;
}

const log = { info() {}, warn() {}, error() {} };
const permissions = createPermissions({ log });
const registry = createToolRegistry({ log, permissions });
const ctx = {
  id: 'mcp-bridge',
  log,
  permissions: { request: (scope, detail) => permissions.check('mcp-bridge', scope, { kind: 'bundled', detail }) },
  capability: (name) => name === 'process.mcp' ? adapter : undefined,
  registerCapability() {}, unregisterCapability() {},
  registerTool: (def) => registry.register(def), unregisterTool: (id) => registry.unregister(id),
};
const adapter = fakeAdapter();
const bridge = createMcpBridge({ ctx, log });

section('MCP stdio 发现与来源追踪');
const started = await bridge.start([{ id: 'mock', command: 'mock-server' }]);
eq(started.length, 1, 'mock server 启动并完成 initialize/list');
const dynamic = registry.list().find((tool) => tool.source === 'mcp:mock');
ok(Boolean(dynamic), true, '动态工具注册');
eq(dynamic.originalName, 'echo tool', '保留 originalName');
eq(dynamic.source, 'mcp:mock', '保留 source');

section('未知 scope 权限 fail-closed');
const denied = await registry.invoke(dynamic.id, {});
eq(denied.ok, false, '未知 scope 调用失败');
ok(denied.error.includes('权限不足'), '未知 scope 返回权限不足');

section('net.raw / 交互 TTY 永远拒绝');
const raw = await bridge.start([{ id: 'raw', command: 'mock', scopes: ['net.raw'] }]);
eq(raw.length, 0, 'net.raw server 未启动');
const tty = await bridge.start([{ id: 'tty', command: 'mock', interactive: true }]);
eq(tty.length, 0, '交互 TTY server 未启动');

section('stop 清理动态工具与子进程');
await bridge.stop();
eq(bridge.list().length, 0, 'stop 清理连接');
eq(registry.get(dynamic.id), undefined, 'stop 清理动态工具');

section('stop 拒绝挂起请求且不抛异常');
const hangingAdapter = fakeAdapter({ hang: true });
const hangingCtx = { ...ctx, capability: (name) => name === 'process.mcp' ? hangingAdapter : undefined };
const hanging = createMcpBridge({ ctx: hangingCtx, adapter: hangingAdapter, log });
const pending = hanging.connect({ id: 'hang', command: 'mock' });
const pendingHandled = pending.then(() => false, () => true);
await new Promise((resolve) => setImmediate(resolve));
await hanging.stop();
const stoppedRejected = await pendingHandled;
eq(stoppedRejected, true, 'stop 拒绝挂起连接');

section('adapter 请求超时与 fatal 回收');
const timeoutChild = new EventEmitter(); timeoutChild.stdout = new EventEmitter(); timeoutChild.stderr = new EventEmitter(); timeoutChild.stdin = { write() {} }; timeoutChild.kill = () => true;
const fatal = [];
const realAdapter = createMcpProcessAdapter({ spawn: () => timeoutChild, requestTimeoutMs: 15 });
const transport = realAdapter.startServer({ id: 'timeout', command: 'mock' }, { onError: (event) => fatal.push(event) });
let timedOut = false; try { await transport.request('tools/call', {}); } catch (error) { timedOut = error.kind === 'timeout'; }
eq(timedOut, true, '无响应请求按 timeout 拒绝');
ok(fatal.some((event) => event.fatal && event.category === 'request_timeout'), 'timeout 标记 fatal');
realAdapter.stopAll();
eq(transport.pending.size, 0, 'timeout/stop 后 pending 清空');

summary('42-mcp-bridge');
