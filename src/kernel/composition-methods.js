// Compose a few methods without mutating a previous provider or losing its
// private-field receiver. Each wrapper may delegate, replace, or add a method.
export function wrapMethods(service, methods) {
  if (!service || !['object', 'function'].includes(typeof service)) throw new TypeError('wrapMethods 需要服务对象');
  if (!methods || typeof methods !== 'object' || Array.isArray(methods)) throw new TypeError('方法包装声明必须为对象');
  const overrides = new Map(), bound = new Map();
  for (const [key, wrapper] of Object.entries(methods)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || typeof wrapper !== 'function') throw new TypeError(`方法包装非法 ${key}`);
    const old = Reflect.get(service, key, service);
    if (old !== undefined && typeof old !== 'function') throw new TypeError(`属性 ${key} 不是可包装方法`);
    const previous = old === undefined ? undefined : old.bind(service);
    overrides.set(key, (...args) => wrapper.call(service, previous, ...args));
  }
  return new Proxy({}, {
    get(_target, key) {
      if (overrides.has(key)) return overrides.get(key);
      const value = Reflect.get(service, key, service);
      if (typeof value !== 'function') return value;
      if (!bound.has(value)) bound.set(value, value.bind(service));
      return bound.get(value);
    },
    set(_target, key, value) {
      // Host guards may wrap a method on the composed facade. Keep that change
      // local to this facade rather than rewriting a lower provider's method.
      if (overrides.has(key) || typeof value === 'function') { overrides.set(key, value); return true; }
      return Reflect.set(service, key, value, service);
    },
    has(_target, key) { return overrides.has(key) || key in service; },
    ownKeys() { return [...new Set([...Reflect.ownKeys(service), ...overrides.keys()])]; },
    getOwnPropertyDescriptor(_target, key) {
      if (overrides.has(key)) return { value: overrides.get(key), enumerable: true, configurable: true, writable: true };
      const descriptor = Object.getOwnPropertyDescriptor(service, key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
