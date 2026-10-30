import { spawn as nodeSpawn } from 'node:child_process';

function safeCategory(error) {
  const code = String(error?.code ?? '');
  if (code === 'ENOENT') return 'spawn_unavailable';
  if (code === 'EACCES') return 'spawn_denied';
  if (error?.kind === 'protocol') return 'protocol_error';
  if (error?.kind === 'timeout') return 'request_timeout';
  return 'server_error';
}

export function createMcpProcessAdapter({ spawn = nodeSpawn, log = null, requestTimeoutMs = 30000 } = {}) {
  const states = new Set();
  function startServer(spec, handlers = {}) {
    if (!spec || typeof spec !== 'object' || !spec.command) throw new Error('MCP server 配置不可用');
    if (spec.interactive === true || spec.tty === true || spec.stdin === 'tty') throw new Error('interactive_tty_denied');
    const child = spawn(String(spec.command), Array.isArray(spec.args) ? spec.args.map(String) : [], {
      cwd: typeof spec.cwd === 'string' ? spec.cwd : undefined,
      env: spec.env && typeof spec.env === 'object' ? { ...spec.env } : {},
      stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true,
    });
    const state = { child, buffer: '', pending: new Map(), nextId: 1, stopped: false, listeners: [] };
    states.add(state);
    const emitError = (kind, error, fatal = false) => {
      const category = kind === 'protocol' ? 'protocol_error' : safeCategory(error);
      try { log?.warn?.(`[mcp-adapter] ${category}`); } catch { /* 日志隔离 */ }
      try { handlers.onError?.({ category, fatal }); } catch { /* 隔离回调异常 */ }
    };
    const settle = (id, error, result) => {
      const pending = state.pending.get(id); if (!pending) return false;
      state.pending.delete(id); clearTimeout(pending.timer);
      if (error) pending.reject(error); else pending.resolve(result);
      return true;
    };
    const finish = (kind, fatal = true) => {
      if (state.stopped) return;
      state.stopped = true;
      const error = Object.assign(new Error(kind), { kind });
      for (const [id] of state.pending) settle(id, error);
      states.delete(state);
      try { handlers.onError?.({ category: safeCategory(error), fatal }); } catch { /* 隔离回调异常 */ }
      for (const [target, event, fn] of state.listeners) target?.removeListener?.(event, fn);
      state.listeners = [];
    };
    const onData = (chunk) => {
      state.buffer += String(chunk ?? '');
      const lines = state.buffer.split(/\r?\n/); state.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { emitError('protocol', null, true); finish('protocol_error', true); return; }
        if (msg?.jsonrpc !== '2.0' || msg?.id == null) { emitError('protocol', null, true); finish('protocol_error', true); return; }
        const pending = state.pending.get(msg.id); if (!pending) continue;
        settle(msg.id, msg.error ? Object.assign(new Error('MCP request failed'), { kind: 'protocol' }) : null, msg.result);
      }
    };
    const onStderr = (chunk) => { if (String(chunk ?? '').trim()) emitError('stderr', null, false); };
    const onError = (error) => { emitError('spawn', error, true); finish('crash', true); try { child.kill(); } catch {} };
    const onExit = () => { if (!state.stopped) { emitError('exit', null, true); finish('crash', true); } };
    child.stdout?.on('data', onData); child.stderr?.on('data', onStderr); child.on('error', onError); child.on('exit', onExit);
    state.listeners.push([child.stdout, 'data', onData], [child.stderr, 'data', onStderr], [child, 'error', onError], [child, 'exit', onExit]);
    const timeoutMs = Number(spec.requestTimeoutMs ?? requestTimeoutMs) > 0 ? Number(spec.requestTimeoutMs ?? requestTimeoutMs) : 30000;
    const request = (method, params) => new Promise((resolve, reject) => {
      if (state.stopped) return reject(new Error('MCP server unavailable'));
      const id = state.nextId++;
      const timer = setTimeout(() => {
        if (settle(id, Object.assign(new Error('MCP request timeout'), { kind: 'timeout' }))) {
          try { handlers.onError?.({ category: 'request_timeout', fatal: true }); } catch { /* 隔离回调异常 */ }
          finish('request_timeout', true); try { child.kill(); } catch {}
        }
      }, timeoutMs);
      state.pending.set(id, { resolve, reject, timer });
      try { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); }
      catch (error) { clearTimeout(timer); state.pending.delete(id); reject(error); }
    });
    const notify = (method, params) => { if (!state.stopped) child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); };
    const stop = () => {
      if (!state.stopped) finish('stopped', false);
      for (const [target, event, fn] of state.listeners) target?.removeListener?.(event, fn);
      state.listeners = [];
      try { child.kill(); } catch { /* 尽力清理 */ }
    };
    state.stop = stop;
    return { request, notify, stop, pending: state.pending, child };
  }
  function stopAll() { for (const state of [...states]) { try { state.stop?.(); } catch { try { state.child.kill(); } catch {} } } states.clear(); }
  return { startServer, stopAll, redactError: safeCategory };
}

export function createUnavailableMcpAdapter() {
  return { startServer() { throw new Error('MCP adapter unavailable'); }, stopAll() {}, redactError: () => 'adapter_unavailable' };
}
