// JSON-RPC 2.0 protocol validator for trusted shell panels.
export const RPC_ERRORS = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  TIMEOUT: -32004,
});

const METHOD_RE = /^[a-z][a-z0-9._-]{0,63}$/i;
const PANEL_RE = /^[a-z][a-z0-9._-]{0,63}$/i;
const ORIGIN_RE = /^https?:\/\/[^/]+$/i;

function failure(message, code = RPC_ERRORS.INVALID_REQUEST, data = undefined) {
  const error = new Error(message);
  error.code = code;
  if (data !== undefined) error.data = data;
  return { ok: false, error };
}

/** Validate an untrusted panel JSON-RPC envelope. */
export function validateRequest(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return failure('请求必须是对象');
  if (req.jsonrpc !== '2.0') return failure('jsonrpc 必须为 2.0');
  if (req.id !== undefined && (typeof req.id !== 'string' || req.id.length > 128)) return failure('id 必须是长度不超过 128 的字符串');
  if (typeof req.method !== 'string' || !METHOD_RE.test(req.method)) return failure('method 非法');
  if (req.params !== undefined && (!req.params || typeof req.params !== 'object' || Array.isArray(req.params))) return failure('params 必须是对象');
  const meta = req.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return failure('meta 必须是对象');
  if (typeof meta.panel !== 'string' || !PANEL_RE.test(meta.panel)) return failure('meta.panel 非法');
  if (meta.version !== undefined && (typeof meta.version !== 'string' || meta.version.length > 32)) return failure('meta.version 非法');
  if (meta.ts !== undefined && (typeof meta.ts !== 'string' || Number.isNaN(Date.parse(meta.ts)))) return failure('meta.ts 非法');
  if (meta.source !== undefined && (typeof meta.source !== 'string' || meta.source.length > 256)) return failure('meta.source 非法');
  if (meta.origin !== undefined && (typeof meta.origin !== 'string' || !ORIGIN_RE.test(meta.origin))) return failure('meta.origin 非法');
  if (meta.nonce !== undefined && (typeof meta.nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(meta.nonce))) return failure('meta.nonce 非法');
  if (meta.timeout !== undefined && (!Number.isInteger(meta.timeout) || meta.timeout < 1 || meta.timeout > 15000)) return failure('meta.timeout 必须在 1-15000ms');
  return { ok: true, value: req };
}

export function makeResponse(id, result) { return { jsonrpc: '2.0', id: id ?? null, result }; }
export function makeError(id, code, message, data = undefined) {
  const out = { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  if (data !== undefined) out.error.data = data;
  return out;
}

/** Dispatch a validated request through a method map. */
export async function handle(req, ctx = {}, methods = {}) {
  const checked = validateRequest(req);
  if (!checked.ok) return makeError(req?.id, checked.error.code, checked.error.message);
  const fn = methods[req.method];
  if (typeof fn !== 'function') return makeError(req.id, RPC_ERRORS.METHOD_NOT_FOUND, '方法不存在');
  try { return makeResponse(req.id, await fn(req.params ?? {}, ctx)); }
  catch (err) { return makeError(req.id, err.code ?? RPC_ERRORS.INTERNAL_ERROR, err.message ?? '内部错误', err.data); }
}

export default { validateRequest, makeResponse, makeError, handle, RPC_ERRORS };
