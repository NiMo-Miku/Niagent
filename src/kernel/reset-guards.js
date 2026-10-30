import { wrapMethods } from './composition-methods.js';

// The host owns these facades. A selected implementation may be frozen or use
// private fields; reset protection must never rewrite that implementation.
export function createResetGuards({ isSealed, canConfigure }) {
  function methods(target, names, { quiet = false } = {}) {
    const wrappers = {};
    for (const name of names) {
      if (typeof target?.[name] !== 'function') continue;
      wrappers[name] = (next, ...args) => {
        if (isSealed()) {
          if (quiet) return undefined;
          throw Object.assign(new Error('当前实例业务已封闭，请重启后继续'), { status: 409, expose: true, code: 'DATA_RESET' });
        }
        return next(...args);
      };
    }
    return wrapMethods(target, wrappers);
  }
  function config(target) {
    const wrappers = {};
    for (const name of ['update', 'updateRawFields', 'reset', 'load']) {
      if (typeof target?.[name] !== 'function') continue;
      wrappers[name] = (next, ...args) => {
        if (!canConfigure()) throw Object.assign(new Error('已提交重置，请退出并重新打开应用'), { status: 409, expose: true });
        return next(...args);
      };
    }
    return wrapMethods(target, wrappers);
  }
  function storage(target) {
    return wrapMethods(methods(target, ['ensureDirs']), {
      namespace(next, ...args) {
        return methods(next(...args), ['ensure', 'set', 'delete']);
      },
    });
  }
  return { methods, config, storage };
}
