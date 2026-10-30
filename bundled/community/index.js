import { createDefaultMarketClient } from '../market/index.js';
import { createQuoteClient } from './quote-client.js';
import { createFeedbackClient } from './feedback-client.js';

const SYNC_PERIOD_MS = 300_000;

export function createCommunityService(ctx) {
  let controller = new AbortController();
  const client = createDefaultMarketClient(ctx, { signal: () => controller.signal, config: ctx.capability('host.config') });
  const quotes = createQuoteClient({ fetchImpl: (url, options) => ctx.http.fetch(url, options), signal: () => controller.signal });
  const feedback = createFeedbackClient({ fetchImpl: (url, options) => ctx.http.fetch(url, options), signal: () => controller.signal });
  let active = false;
  let generation = 0;
  let timer = null;
  let inFlight = null;

  const sync = async (epoch) => {
    if (!active || epoch !== generation || inFlight === epoch) return;
    inFlight = epoch;
    try {
      const result = await client.syncGlobalBlocklist({ pushLocal: true });
      if (!active || epoch !== generation) return;
      ctx.events.emit('blocklist-sync', { ok: Boolean(result?.ok), count: result?.ids?.length ?? 0, error: result?.error ?? null });
    } catch (error) {
      if (!active || epoch !== generation) return;
      ctx.log.warn?.(`屏蔽名单同步失败：${error?.message ?? error}`);
      ctx.events.emit('blocklist-sync', { ok: false, count: 0, error: String(error?.message ?? error) });
    } finally { if (inFlight === epoch) inFlight = null; }
  };

  return {
    getBlocklist: (...args) => client.getBlocklist(...args),
    syncGlobalBlocklist: (...args) => client.syncGlobalBlocklist(...args),
    updateBlocklist: (...args) => client.updateBlocklist(...args),
    quoteStatus: (...args) => quotes.quoteStatus(...args),
    publishQuote: (...args) => quotes.publishQuote(...args),
    feedbackStatus: (...args) => feedback.feedbackStatus(...args),
    publishFeedback: (...args) => feedback.publishFeedback(...args),
    start() {
      if (active) return;
      active = true;
      if (controller.signal.aborted) controller = new AbortController();
      const epoch = ++generation;
      void sync(epoch);
      timer = ctx.scheduler.every(SYNC_PERIOD_MS, () => sync(epoch), { name: 'global-blocklist' });
    },
    stop() {
      active = false;
      generation++;
      timer?.stop();
      timer = null;
      controller.abort(new Error('社区屏蔽名单服务已停止'));
    },
  };
}

export default {
  setup(ctx) {
    const service = createCommunityService(ctx);
    ctx.registerCapability('community.client', service, { default: true, lifecycle: true });
    ctx.lifecycle.onStop(() => service.stop());
  },
};
