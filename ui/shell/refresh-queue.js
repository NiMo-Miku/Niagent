/** Coalesce refresh notifications without caching data or dropping a final update. */
export function createRefreshQueue(run) {
  let pending = null, dirty = false, closed = false, revision = 0;
  function request() {
    if (closed) return Promise.resolve();
    dirty = true;
    ++revision;
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        let failure;
        try {
          while (dirty && !closed) {
            dirty = false;
            const current = revision;
            // A notification received while this request is in flight makes its
            // snapshot obsolete. A following request still reads fresh data.
            try { await run({ isCurrent: () => !closed && revision === current }); failure = null; }
            catch (error) { failure = error; }
          }
          if (failure && !closed) throw failure;
        } finally { pending = null; }
      });
    }
    return pending;
  }
  function close() { closed = true; dirty = false; ++revision; }
  return Object.freeze({ request, close });
}
