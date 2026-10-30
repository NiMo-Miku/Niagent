// Read-only archive paging. Cancelling a generation stops waiting and rejects
// its late result; the existing panel RPC may finish its HTTP GET independently.
const abortError = () => new DOMException('聊天读取已取消', 'AbortError');

function distinct(rows) {
  const ids = new Map();
  for (const row of rows) if (row && Number.isFinite(Number(row.id))) ids.set(String(row.id), row);
  const sorted = [...ids.values()].sort((a, b) => Number(a.id) - Number(b.id));
  // Unknown legacy mids are not identities. A repeated protocol message keeps
  // its newest stored representation, including recall/media/read changes.
  const mids = new Map();
  for (const row of sorted) if (row.mid != null && String(row.mid).trim() && String(row.mid) !== '0') mids.set(String(row.mid), row);
  return sorted.filter(row => row.mid == null || !String(row.mid).trim() || String(row.mid) === '0' || mids.get(String(row.mid)) === row);
}

function waiting(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); if (!signal.aborted) resolve(value); }, error => { cleanup(); if (!signal.aborted) reject(error); });
  });
}

export function createChatHistory({ request, onChange, onError = () => {} }) {
  let key = null, generation = 0, rows = [], more = false, task = null, pendingRefresh = null, disposed = false, selectionFloor = null;
  const firstId = items => items.reduce((id, row) => Math.min(id, Number(row.id)), Infinity);
  async function run(kind) {
    const active = { key, generation, controller: new AbortController(), promise: null };
    task = active;
    const current = () => !disposed && generation === active.generation && key === active.key && !active.controller.signal.aborted;
    const read = async query => {
      const result = await waiting(request(active.key, query), active.controller.signal);
      if (!current()) throw abortError();
      return { messages: distinct(structuredClone(result.messages || [])), hasMore: Boolean(result.hasMore) };
    };
    active.promise = (async () => {
      try {
        let page = await read({ limit: kind === 'older' ? 200 : 500, ...(kind === 'older' && rows.length ? { beforeId: firstId(rows) } : {}) });
        let incoming = page.messages, nextMore = page.hasMore;
        if (kind === 'older') {
          incoming = [...rows, ...incoming];
          if (!page.messages.length) nextMore = false;
        } else if (incoming.length && (kind === 'refresh' && rows.length || Number.isFinite(selectionFloor))) {
          const floor = rows.length ? firstId(rows) : selectionFloor;
          // Revalidate the whole loaded window: SSE identifies the chat, not
          // the changed message, so its older prefix may have been mutated.
          while (nextMore && firstId(incoming) > floor) {
            const beforeId = firstId(incoming), older = await read({ limit: 200, beforeId });
            if (!older.messages.length || firstId(older.messages) >= beforeId) { nextMore = false; break; }
            incoming = [...older.messages, ...incoming]; nextMore = older.hasMore;
          }
          incoming = incoming.filter(row => Number(row.id) >= floor);
        }
        if (!current()) return;
        rows = distinct(incoming); more = nextMore; selectionFloor = null;
        onChange({ key, kind, messages: rows, hasMore: more });
      } catch (error) {
        if (current() && error.name !== 'AbortError') onError(error, { key: active.key, kind });
      } finally {
        if (task === active) {
          task = null;
          if (current() && pendingRefresh) { pendingRefresh = null; void run('refresh'); }
        }
      }
    })();
    return active.promise;
  }
  return {
    reset(){generation++;task?.controller.abort();task=null;pendingRefresh=null;key=null;rows=[];more=false;selectionFloor=null;},
    select(next, { floor = null } = {}) {
      generation++; task?.controller.abort(); task = null; pendingRefresh = null;
      key = next; rows = []; more = false; selectionFloor = Number.isFinite(floor) ? floor : null;
      return disposed ? Promise.resolve() : run('select');
    },
    older() { return !key || !more || disposed ? Promise.resolve() : task?.promise || run('older'); },
    refresh() {
      if (!key || disposed) return Promise.resolve();
      if (task) { pendingRefresh = true; return task.promise; }
      return run('refresh');
    },
    get loading() { return Boolean(task); },
    get messages() { return rows; },
    get hasMore() { return more; },
    dispose() { disposed = true; generation++; pendingRefresh = null; task?.controller.abort(); task = null; },
  };
}

export function captureMessageAnchor(host) {
  if (!host) return null;
  const bounds = host.getBoundingClientRect();
  const node = [...host.children].find(child => child.dataset.message && child.getBoundingClientRect().bottom > bounds.top + host.clientTop);
  return { id: node?.dataset.message, top: node?.getBoundingClientRect().top, scroll: host.scrollTop };
}

export function restoreMessageAnchor(host, anchor) {
  if (!host || !anchor) return;
  const node = [...host.children].find(child => child.dataset.message === anchor.id);
  host.scrollTop = node ? host.scrollTop + node.getBoundingClientRect().top - anchor.top : anchor.scroll;
}
