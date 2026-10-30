// UI-only bounded log stream. Snapshot requests never gate streamed output.
export function createLogStream(node, { format, limit = 200, onSnapshot = () => {} } = {}) {
  let entries = [], snapshot = null, version = 0, frame = null, disposed = false, error = '';
  const valid = entry => typeof entry === 'string' || (entry && typeof entry === 'object' && ['text', 'message', 'msg'].some(key => typeof entry[key] === 'string'));
  const identity = entry => typeof entry === 'string' ? JSON.stringify(entry) : JSON.stringify([entry.at ?? entry.ts, entry.stream, entry.level, entry.src, entry.text ?? entry.message ?? entry.msg]);
  function render() {
    frame = null;
    if (disposed) return;
    const text = [error, entries.map(format).join('\n')].filter(Boolean).join('\n') || '暂无日志';
    if (node.textContent === text) return;
    const following = node.scrollHeight - node.scrollTop - node.clientHeight < 32, position = node.scrollTop;
    node.textContent = text;
    node.scrollTop = following ? node.scrollHeight : position;
  }
  function schedule() { if (!disposed && frame === null) frame = requestAnimationFrame(render); }
  function append(entry) {
    if (disposed || !valid(entry)) return false;
    entries.push(entry); entries = entries.slice(-limit);
    if (snapshot) { snapshot.events.push(entry); snapshot.events = snapshot.events.slice(-limit); }
    error = ''; schedule(); return true;
  }
  async function refresh(read) {
    if (disposed) return;
    const ticket = { version: ++version, events: [] }; snapshot = ticket;
    try {
      const data = await read();
      if (disposed || version !== ticket.version) return;
      const history = (Array.isArray(data?.logs) ? data.logs : []).filter(valid).slice(-limit);
      // Match only the ordered snapshot tail against the live prefix. A Set
      // would erase legitimate identical log lines (including same-ms output).
      const left = history.map(identity), right = ticket.events.map(identity);
      let overlap = Math.min(left.length, right.length);
      while (overlap && !right.slice(0, overlap).every((key, i) => key === left[left.length - overlap + i])) overlap--;
      entries = [...history, ...ticket.events.slice(overlap)].slice(-limit);
      error = ''; snapshot = null; onSnapshot(data); schedule();
    } catch (failure) {
      if (disposed || version !== ticket.version) return;
      snapshot = null; error = `日志快照读取失败：${failure.message || '请重试'}`; schedule();
    }
  }
  function dispose() {
    disposed = true; ++version; snapshot = null; entries = [];
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  return Object.freeze({ append, refresh, dispose });
}
