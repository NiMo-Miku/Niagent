// 定时任务：every(ms) / at(时刻)，按 owner 回收（幽灵定时器防护）。
// 出处：DSH §3.1 模块 8；SPEC §7.7（禁用必调 deactivate，否则定时器泄漏成幽灵行为——真实事故）。
export function createScheduler({ log = console } = {}) {
  const timers = new Set(); // { _stop, ownerId, name }
  const invoke = (fn, ownerId, name) => {
    try { Promise.resolve(fn()).catch((e) => log.error?.(`[scheduler] ${name}(${ownerId}) 执行异常：${e?.stack || e}`)); }
    catch (e) { log.error?.(`[scheduler] ${name}(${ownerId}) 执行异常：${e?.stack || e}`); }
  };

  function reg(handle, ownerId, name) {
    const entry = { _stop: handle, ownerId, name };
    timers.add(entry);
    return {
      stop: () => { timers.delete(entry); try { handle(); } catch (e) { log.error?.(`[scheduler] 停止 ${name} 异常：${e}`); } },
    };
  }

  function every(ms, fn, { ownerId = 'kernel', name = 'every' } = {}) {
    const id = setInterval(() => {
      invoke(fn, ownerId, name);
    }, ms);
    if (typeof id?.unref === 'function') id.unref(); // 不阻退出
    return reg(() => clearInterval(id), ownerId, name);
  }

  // at：具体 Date 一次性；'HH:MM' 每日循环
  function at(when, fn, { ownerId = 'kernel', name = 'at' } = {}) {
    if (when instanceof Date) {
      const delay = Math.max(0, when.getTime() - Date.now());
      const id = setTimeout(() => {
        invoke(fn, ownerId, name);
        const entry = [...timers].find((t) => t._stop === stopRaw);
        if (entry) timers.delete(entry);
      }, delay);
      const stopRaw = () => clearTimeout(id);
      return reg(stopRaw, ownerId, name);
    }
    if (typeof when === 'string' && /^\d{1,2}:\d{2}$/.test(when)) { // SPEC §17.2：HH:MM 峰谷时段解析
      const fire = () => {
        invoke(fn, ownerId, name);
      };
      const scheduleNext = () => {
        const [h, m] = when.split(':').map(Number);
        const now = new Date();
        let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        const id = setTimeout(() => { fire(); if (!stopped) scheduleNext(); }, next.getTime() - now.getTime());
        rawStop = () => clearTimeout(id);
      };
      let rawStop = () => {};
      let stopped = false;
      scheduleNext();
      const entry = { _stop: () => { stopped = true; rawStop(); }, ownerId, name };
      timers.add(entry);
      return { stop: () => { timers.delete(entry); entry._stop(); } };
    }
    throw new Error(`scheduler.at：不支持的时刻 ${when}`);
  }

  return {
    every,
    at,
    // 插件停用/卸载时回收其全部定时器（幽灵定时器防护）
    disposeOwner(ownerId) {
      const doomed = [...timers].filter((t) => t.ownerId === ownerId);
      for (const t of doomed) {
        timers.delete(t);
        try { t._stop(); } catch (e) { log.error?.(`[scheduler] 回收 ${t.name}(${ownerId}) 异常：${e}`); }
      }
      return doomed.length;
    },
    stop() { for (const t of [...timers]) { timers.delete(t); try { t._stop(); } catch { /* 退出清理尽力而为 */ } } },
    count: () => timers.size,
  };
}
