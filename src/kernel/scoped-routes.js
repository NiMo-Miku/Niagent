// A route scope owns records rather than mutating someone else's handler. This
// lets a trusted composition layer replace a controller and reveal it again on
// disposal, including when a later layer fails during registration.
function methodsOverlap(left, right) {
  return left === '*' || right === '*' || left === right;
}

function matchPattern(pattern, pathname) {
  if (typeof pattern === 'string') return pathname === pattern || pathname === `${pattern}/` ? {} : null;
  pattern.lastIndex = 0;
  const match = pattern.exec(pathname);
  pattern.lastIndex = 0;
  return match ? match.groups ?? {} : null;
}

function patternsOverlap(left, right) {
  if (typeof left === 'string') return matchPattern(right, left) !== null || matchPattern(right, `${left}/`) !== null;
  if (typeof right === 'string') return matchPattern(left, right) !== null || matchPattern(left, `${right}/`) !== null;
  // General RegExp intersection is undecidable here. A scoped dynamic route
  // must explicitly opt into replacement when another same-method regex exists.
  return true;
}

function validate(method, pattern, handler) {
  if (typeof method !== 'string' || !/^(?:[A-Za-z]+|\*)$/.test(method)) throw new TypeError('Route method must be an HTTP method or *');
  if (!(typeof pattern === 'string' || pattern instanceof RegExp)) throw new TypeError('Route pattern must be a string or RegExp');
  if (typeof handler !== 'function') throw new TypeError('Route handler must be a function');
  return { method: method.toUpperCase(), pattern: pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : pattern, handler };
}

export function createScopedRouteRegistry() {
  const records = [];
  let sequence = 0;

  function append(record, owned) {
    records.push(record);
    owned?.add(record);
    return () => {
      const index = records.indexOf(record);
      if (index !== -1) records.splice(index, 1);
      owned?.delete(record);
    };
  }

  // The established API preserves first-registration matching. Returning a
  // disposer is additive; old callers can continue ignoring the return value.
  function route(method, pattern, handler) {
    return append({ ...validate(method, pattern, handler), priority: 0 });
  }

  function createRouteScope({ id = 'composition', strict = true } = {}) {
    const owned = new Set();
    let disposed = false;
    function scopedRoute(method, pattern, handler, { replace = false } = {}) {
      if (disposed) throw new Error(`Route scope ${id} has been disposed`);
      const record = validate(method, pattern, handler);
      if (strict && ((typeof record.pattern === 'string' && !record.pattern.startsWith('/api/')) || matchPattern(record.pattern, '/api/events') !== null || matchPattern(record.pattern, '/api/events/') !== null)) {
        throw new Error(`Route scope ${id} must register a non-reserved /api/ endpoint`);
      }
      const overlapping = records.filter(previous => methodsOverlap(record.method, previous.method) && patternsOverlap(record.pattern, previous.pattern));
      if (strict && overlapping.length && !replace) {
        throw new Error(`Route ${record.method} ${record.pattern} overlaps an existing route; pass { replace: true } explicitly`);
      }
      if (strict && replace && !overlapping.length) {
        throw new Error(`Route ${record.method} ${record.pattern} has no existing route to replace`);
      }
      record.priority = replace ? ++sequence : 0;
      return append(record, owned);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of owned) {
        const index = records.indexOf(record);
        if (index !== -1) records.splice(index, 1);
      }
      owned.clear();
    }
    return Object.freeze({ route: scopedRoute, dispose });
  }

  function matchRoute(method, pathname) {
    // Explicit replacements have newest-layer priority. Ordinary registrations
    // retain their original order, so unrelated legacy callers do not change.
    const candidate = record => {
      if (record.method !== '*' && record.method !== method) return null;
      const params = matchPattern(record.pattern, pathname);
      if (params !== null) return { r: record, params, query: {} };
      return null;
    };
    for (let index = records.length - 1; index >= 0; index--) {
      if (!records[index].priority) continue;
      const hit = candidate(records[index]);
      if (hit) return hit;
    }
    for (const record of records) {
      if (record.priority) continue;
      const hit = candidate(record);
      if (hit) return hit;
    }
    return null;
  }

  return Object.freeze({ route, createRouteScope, matchRoute });
}
