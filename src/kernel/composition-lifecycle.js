// Resources of a boot composition generation unwind in reverse acquisition order.
export function createCompositionLifecycle() {
  const controller = new AbortController(), effects = [];
  let closing = null;
  return Object.freeze({
    signal: controller.signal,
    cancel(reason = new Error('组合实例已停止')) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    onStop(dispose) {
      if (typeof dispose !== 'function') throw new TypeError('lifecycle.onStop 需要清理函数');
      if (controller.signal.aborted) throw new Error('组合实例已停止，不能注册资源');
      const effect = { dispose, active: true }; effects.push(effect);
      return () => {
        effect.active = false;
        const index = effects.indexOf(effect);
        if (index !== -1) effects.splice(index, 1);
      };
    },
    close() {
      if (closing) return closing;
      // Publish the promise before abort listeners or disposers can reenter.
      closing = Promise.resolve().then(async () => {
        const errors = [];
        while (effects.length) {
          const effect = effects.pop();
          if (!effect.active) continue;
          effect.active = false;
          try { await effect.dispose(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, '组合资源清理失败');
      });
      controller.abort(new Error('组合实例已停止'));
      return closing;
    },
  });
}
