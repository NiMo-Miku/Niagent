// Generic presentation only. Providers own protocol discovery and readiness.
export function safeTransportText(value) {
  return String(value ?? '').slice(0, 2048)
    .replace(/\b(Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/((?:access[_-]?token|token|api[_-]?key|password|secret)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&#)]+)/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/|wss?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');
}

export function transportDiagnosis(status) {
  if (status.connected && status.transportReady === true) return null;
  if (status.diagnosis) return safeTransportText(status.diagnosis);
  const error = safeTransportText(status.error);
  if (error) {
    if (/401|unauthor|令牌不匹配/i.test(error)) return '接入认证失败，请核对对应协议的令牌';
    if (/ECONNREFUSED/i.test(error)) return `连接地址或端口未监听：${error}`;
    if (/ENOTFOUND|EAI_AGAIN/i.test(error)) return `连接地址无法解析：${error}`;
    if (/timeout|超时|ETIMEDOUT/i.test(error)) return `连接超时：${error}`;
    return error;
  }
  if (status.connected && status.transportReady === false) return '服务连接已建立，正在验证账号与收发通道';
  return status.connected ? null : '尚未连接协议服务，请检查接入地址与服务状态';
}

export function copyTransportReadiness(source, target) {
  for (const key of ['transportReady', 'identityBound']) if (typeof source[key] === 'boolean') target[key] = key === 'transportReady' ? !!source.connected && source[key] : source[key];
  for (const key of ['stage', 'errorCode', 'diagnosis']) if (typeof source[key] === 'string' || source[key] === null) target[key] = source[key] === null ? null : safeTransportText(source[key]);
  if (source.connection && typeof source.connection === 'object') {
    target.connection = {};
    for (const key of ['mode', 'accountId', 'wsUrl', 'httpUrl']) {
      if (typeof source.connection[key] === 'string') target.connection[key] = safeTransportText(source.connection[key]);
    }
  }
  return target;
}
