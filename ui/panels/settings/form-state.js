// Only dirty fields leave the editor. A save acknowledgement cannot erase newer input.
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
export function getPath(value, field) {
  return field.split('.').reduce((node, key) => node?.[key], value);
}
export function setPath(value, field, next) {
  const parts = field.split('.');
  if (parts.some((key) => !key || FORBIDDEN.has(key))) throw new Error('配置路径不合法');
  let node = value;
  for (const key of parts.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== 'object' || Array.isArray(node[key])) node[key] = {};
    node = node[key];
  }
  node[parts.at(-1)] = structuredClone(next);
}
export class FormState {
  constructor(base = {}) { this.base = structuredClone(base); this.pending = new Map(); this.version = 0; }
  get dirty() { return this.pending.size > 0; }
  value(field) {
    let value = getPath(this.base, field);
    const parts = field.split('.');
    for (let end = parts.length; end > 0; end--) {
      const entry = this.pending.get(parts.slice(0, end).join('.'));
      if (!entry) continue;
      value = end === parts.length ? entry.value : getPath(entry.value, parts.slice(end).join('.'));
      break;
    }
    value = structuredClone(value);
    // 读取父路径也包含未保存的子字段，另存方案不能遗漏刚刚编辑的颜色/布局。
    for (const [key, entry] of this.pending) {
      if (!key.startsWith(`${field}.`)) continue;
      if (!value || typeof value !== 'object') value = {};
      setPath(value, key.slice(field.length + 1), entry.value);
    }
    return value;
  }
  set(field, value, { replace = false } = {}) {
    const parts = field.split('.');
    if (parts.some((key) => !key || FORBIDDEN.has(key))) throw new Error('配置路径不合法');
    for (let end = parts.length - 1; end > 0; end--) {
      const parent = parts.slice(0, end).join('.');
      const entry = this.pending.get(parent);
      if (!entry) continue;
      const next = structuredClone(entry.value) ?? {};
      setPath(next, parts.slice(end).join('.'), value);
      this.pending.set(parent, { ...entry, value: next, version: ++this.version });
      return;
    }
    for (const key of this.pending.keys()) if (key.startsWith(`${field}.`)) this.pending.delete(key);
    this.pending.set(field, { value: structuredClone(value), version: ++this.version, replace });
  }
  // 映射键（例如带点的 toolId）是一个完整键，不作为点分隔配置路径。
  setKey(field, key, value) {
    if (typeof key !== 'string' || !key || FORBIDDEN.has(key)) throw new Error('配置映射键不合法');
    this.set(field, { ...this.value(field), [key]: structuredClone(value) });
  }
  mergeBase(base) { this.base = structuredClone(base); }
  snapshot() {
    const fields = new Map([...this.pending].map(([key, entry]) => [key, structuredClone(entry)]));
    const patch = {};
    for (const [key, entry] of fields) setPath(patch, key, entry.replace ? { __replace__: entry.value } : entry.value);
    return { fields, patch };
  }
  accept(snapshot, base) {
    if (base) this.mergeBase(base);
    this.discardPending(snapshot);
  }
  // A discard decision applies only to the versions the user was shown.
  // Input entered while a confirmation or reload is pending remains dirty.
  discardPending(snapshot) {
    for (const [key, entry] of snapshot.fields) {
      if (this.pending.get(key)?.version === entry.version) this.pending.delete(key);
    }
  }
  // A failed picker commit restores only its own still-current staged edits.
  // Unrelated fields and input entered while the request was pending survive.
  restorePending(previous, staged, fields) {
    for (const key of fields) {
      const expected = staged.fields.get(key);
      if (!expected || this.pending.get(key)?.version !== expected.version) continue;
      const entry = previous.fields.get(key);
      if (entry) this.pending.set(key, structuredClone(entry)); else this.pending.delete(key);
    }
  }
  discard(base) { this.pending.clear(); this.mergeBase(base); }
}
