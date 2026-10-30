import { createTelemetry } from './service.js';

export function createTelemetryService(ctx) {
  const environment = ctx.capability('host.environment');
  const config = ctx.capability('host.config');
  if (!environment?.dataDir || !config) throw new Error('匿名遥测缺少宿主数据接口');
  let active = false;
  let unwatch = null;
  let controller = null;
  const engine = createTelemetry({
    dataDir: environment.dataDir,
    version: environment.version,
    sessions: ctx.capability('data.sessions'),
    registry: ctx.capability('tools.catalog'),
    fetchImpl: (url, options) => ctx.http.fetch(url, { ...options, signal: controller?.signal }),
    log: ctx.log,
    setTimeoutFn: (fn, delay) => ctx.scheduler.at(new Date(Date.now() + delay), fn, { name: 'anonymous-report' }),
    clearTimeoutFn: (timer) => timer?.stop(),
  });
  const applyConfig = () => {
    if (!active) return;
    if (config.get()?.telemetry?.enabled !== false) {
      if (!controller || controller.signal.aborted) controller = new AbortController();
      engine.start();
    } else {
      engine.stop();
      controller?.abort(new Error('匿名遥测已关闭'));
    }
  };
  return {
    identity: engine.identity, totals: engine.totals, report: engine.report,
    start() {
      if (active) return;
      active = true;
      unwatch = config.onChange?.(applyConfig) ?? null;
      applyConfig();
    },
    stop() {
      active = false;
      unwatch?.();
      unwatch = null;
      engine.stop();
      controller?.abort(new Error('匿名遥测服务已停止'));
    },
  };
}

export default {
  setup(ctx) {
    const service = createTelemetryService(ctx);
    ctx.registerCapability('telemetry.service', service, { default: true, lifecycle: true });
    ctx.lifecycle.onStop(() => service.stop());
  },
};
