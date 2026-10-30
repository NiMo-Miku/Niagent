// Synchronous reading-position policy. The caller owns request/selection
// generations; no timers, observers or retained session data live here.
export function createSessionDetailScrollPolicy() {
  const rows = detail => [...detail.querySelectorAll('.session-body > [data-key]')];
  return {
    capture(detail, { id, renderedId, status }) {
      const first = id !== renderedId;
      const top = detail.scrollTop;
      const bottom = detail.scrollHeight - top - detail.clientHeight <= 48;
      const bounds = detail.getBoundingClientRect();
      const body = detail.querySelector('.session-body');
      const anchor = !first && body && !body.hidden
        ? rows(detail).find(node => {
          const rect = node.getBoundingClientRect();
          return rect.bottom > bounds.top + detail.clientTop && rect.top < bounds.bottom;
        }) : null;
      const raw = !first && detail.querySelector('.raw-json');
      return {
        first, followBottom: first || (status === 'running' && bottom), top,
        anchor: anchor ? { key: anchor.dataset.key, offset: anchor.getBoundingClientRect().top - bounds.top } : null,
        raw: raw && !raw.hidden ? { top: raw.scrollTop, left: raw.scrollLeft } : null,
      };
    },
    restore(detail, snapshot, { isCurrent = () => true } = {}) {
      if (!snapshot || !isCurrent()) return;
      if (snapshot.followBottom) detail.scrollTop = detail.scrollHeight;
      else {
        const anchor = snapshot.anchor && rows(detail).find(node => node.dataset.key === snapshot.anchor.key);
        detail.scrollTop = anchor
          ? detail.scrollTop + anchor.getBoundingClientRect().top - detail.getBoundingClientRect().top - snapshot.anchor.offset
          : snapshot.top;
      }
      // Raw JSON has its own bounded scrolling surface. Keep its reading
      // position on the same session without changing the selected mode.
      const raw = snapshot.raw && detail.querySelector('.raw-json');
      if (raw && !raw.hidden) { raw.scrollTop = snapshot.raw.top; raw.scrollLeft = snapshot.raw.left; }
    },
  };
}
