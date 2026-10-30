const LOOPBACK_HOSTS = [
  /^127\.0\.0\.1(:\d+)?$/,
  /^localhost(:\d+)?$/,
  /^\[::1\](:\d+)?$/,
];

export const KEY_READ_DENIED_MESSAGE = '请求来源不被信任，已拒绝读取明文密钥。';

function suppliedConsoleToken(req) {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    return req.headers['x-console-token'] ?? url.searchParams.get('token');
  } catch {
    return req.headers['x-console-token'];
  }
}

// 明文密钥端点只接受本机同源控制台，或已配置的精确控制台令牌。
export function trustedConsoleOrigin(req) {
  const host = req.headers.host ?? '';
  if (!LOOPBACK_HOSTS.some((pattern) => pattern.test(host))) return false;
  const source = req.headers.origin ?? req.headers.referer;
  if (!source) return true;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export function keyEndpointAllowed(req, serverToken = '') {
  return Boolean(serverToken && suppliedConsoleToken(req) === serverToken) || trustedConsoleOrigin(req);
}
