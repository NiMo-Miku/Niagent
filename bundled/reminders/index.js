export function createReminderService(ctx) {
  const store = ctx.capability('data.reminders');
  const runtime = ctx.capability('runtime.reminders');
  if (!store || typeof runtime?.start !== 'function' || typeof runtime?.stop !== 'function') {
    throw new Error('提醒任务缺少宿主数据或运行时接口');
  }
  let active = false;
  return {
    start() {
      if (active) return;
      runtime.start(store);
      active = true;
    },
    stop() {
      if (!active) return;
      active = false;
      runtime.stop();
    },
  };
}

export default {
  setup(ctx) {
    const service = createReminderService(ctx);
    ctx.registerCapability('reminders.service', service, { default: true, lifecycle: true });
    ctx.lifecycle.onStop(() => service.stop());
  },
};
