// safe-fetch：出站 HTTP 安全基线（SPEC §16 SSRF 契约 + §12 安全基线 1）。
// - 逐跳校验：每一次连接（含重定向）都重新解析 DNS 并复核 IP 段
// - 拒绝私网/回环/链路本地/保留段（除非 security.allowPrivateImageHosts）
// - 流式下载 + 字节上限截断（96MB 堆上限事故：必须流式、不 buffer 全量）
// - 浏览锁定白名单（security.browseLock，逐跳校验）
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

const PRIVATE_V4 = [
  /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^198\.(1[89])\./, /^22[4-9]\./, /^2[3-5]\d\./,
];

function checkCanceled(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('请求已中止');
}

// A trusted injected transport/DNS/reader may ignore signal. Cancellation must
// still settle the consumer and discard a late response, without unhandled IO.
async function whileActive(start, signal, discard) {
  checkCanceled(signal);
  let onAbort, accepted = false;
  const canceled = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error('请求已中止'));
    signal.addEventListener('abort', onAbort, { once:true });
    if (signal.aborted) onAbort();
  });
  const work = Promise.resolve().then(() => { checkCanceled(signal); return start(); });
  try {
    const value = await Promise.race([canceled, work]);
    checkCanceled(signal);
    accepted = true;
    return value;
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!accepted && discard) void work.then(value => discard(value)).catch(() => {});
  }
}

function discardResponse(response) {
  try { return Promise.resolve(response?.body?.cancel?.()).catch(() => {}); }
  catch { /* A failed/locked body is already unavailable; cleanup is best effort. */ }
}

function ipv6Words(address) {
  const expandedTail = address.toLowerCase().replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_, a, b, c, d) =>
    `${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`);
  const [left, right] = expandedTail.split('::');
  const before = left ? left.split(':') : [];
  const after = right ? right.split(':') : [];
  const words = right === undefined ? before : [...before, ...Array(8 - before.length - after.length).fill('0'), ...after];
  return words.map((word) => parseInt(word, 16));
}

export function isPrivateAddress(ip) {
  const s = String(ip ?? '');
  if (!s) return true;
  if (net.isIPv4(s)) return PRIVATE_V4.some((re) => re.test(s));
  if (net.isIPv6(s)) {
    const w = ipv6Words(s);
    if ((w[0] & 0xfe00) === 0xfc00 || (w[0] & 0xffc0) === 0xfe80
      || (w[0] & 0xffc0) === 0xfec0 || (w[0] & 0xff00) === 0xff00) return true;
    if (w[0] === 0x2001 && [0xdb8, 2, 0x10, 0x20].includes(w[1])) return true;
    const embedded = (a, b) => isPrivateAddress(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
    // 压缩、展开、点分和十六进制形式统一判定 IPv4-mapped / compatible / NAT64。
    if (w.slice(0, 5).every((word) => word === 0) && (w[5] === 0 || w[5] === 0xffff)) return embedded(w[6], w[7]);
    if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((word) => word === 0)) return embedded(w[6], w[7]);
    if (w[0] === 0x2002) return embedded(w[1], w[2]);
    return false;
  }
  return true; // 非法 IP 一律拒
}

function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (options?.all) callback(null, addresses);
    else {
      const selected = addresses.find((item) => !options?.family || item.family === options.family) ?? addresses[0];
      callback(null, selected.address, selected.family);
    }
  };
}

// 使用原 hostname 构造请求（Host / HTTPS SNI / 证书校验仍是原域名），
// socket 的 lookup 只返回本跳已经检查过的地址，不再次向 DNS 查询。
async function requestPinned(url, init, addresses) {
  const request = new Request(url, init);
  if (!request.headers.has('accept-encoding')) request.headers.set('accept-encoding', 'gzip, deflate, br');
  request.headers.delete('host');
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: request.method, headers: Object.fromEntries(request.headers), signal: init.signal,
      lookup: pinnedLookup(addresses), autoSelectFamily: true, agent: false,
    }, (response) => {
      const responseHeaders = new Headers();
      for (let i = 0; i < response.rawHeaders.length; i += 2) responseHeaders.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
      const hasBody = request.method !== 'HEAD' && ![204, 205, 304].includes(response.statusCode);
      const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase().trim();
      const decoder = !hasBody ? null : encoding === 'gzip' || encoding === 'x-gzip' ? createGunzip()
        : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
      let stream = response;
      if (decoder) {
        response.on('error', (err) => decoder.destroy(err));
        decoder.on('close', () => { if (!response.destroyed) response.destroy(); });
        stream = response.pipe(decoder);
      }
      if (!hasBody) stream.resume();
      resolve(new Response(hasBody ? Readable.toWeb(stream) : null, { status: response.statusCode, headers: responseHeaders }));
    });
    req.on('error', reject);
    if (request.body) {
      const source = Readable.fromWeb(request.body);
      source.on('error', (err) => req.destroy(err));
      req.on('close', () => source.destroy());
      source.pipe(req);
    } else req.end();
  });
}

async function checkedAddress(url, dnsLookup, allowPrivate, signal) {
  checkCanceled(signal);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIP(hostname) }];
  else {
    try {
      addresses = await whileActive(() => dnsLookup(hostname, { all: true, verbatim: true }), signal);
    } catch (err) {
      checkCanceled(signal);
      throw new Error(`域名解析失败：${hostname}（${err?.message ?? err}）`);
    }
  }
  checkCanceled(signal);
  if (!addresses?.length) throw new Error(`域名解析失败：${hostname}（没有可用地址）`);
  for (const item of addresses) {
    const family = net.isIP(item.address);
    if (!family || (!allowPrivate && isPrivateAddress(item.address))) throw new Error(`拒绝访问内网地址：${hostname} → ${item.address}`);
  }
  return addresses.map((item) => ({ address: item.address, family: net.isIP(item.address) }));
}

function hostAllowedByLock(hostname, hosts) {
  const h = String(hostname).toLowerCase();
  return hosts.some((x) => {
    const w = String(x).toLowerCase().replace(/^\*\./, '');
    return h === w || h.endsWith(`.${w}`);
  });
}

/** 校验交给模型的媒体 URL；不发起 HTTP 请求。 */
export async function validateMediaUrl(value, { browseLocked = false, allowedHosts = [], allowPrivate = false, dnsLookup = dns.lookup, signal } = {}) {
  checkCanceled(signal);
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('媒体地址必须是不含认证信息的 http(s) URL');
  if (browseLocked && !hostAllowedByLock(url.hostname, allowedHosts)) throw new Error('媒体地址不在浏览锁定白名单');
  await checkedAddress(url, dnsLookup, allowPrivate, signal ?? new AbortController().signal);
  checkCanceled(signal);
  return url.href;
}

/**
 * 安全抓取。
 * @param url 目标 URL
 * @param opts { maxBytes, browseLocked, allowedHosts, timeoutMs, allowPrivate, fetchImpl }
 * @returns { status, headers, body(Buffer|string), truncated, finalUrl, hops }
 */
export async function safeFetch(url, opts = {}) {
  const {
    maxBytes = 5 * 1024 * 1024, browseLocked = false, allowedHosts = [],
    timeoutMs = 15000, allowPrivate = false, fetchImpl, expectBinary = false,
    maxRedirects = 5, followRedirects = true, method = 'GET', headers, body, dnsLookup = dns.lookup,
    signal, onChunk,
  } = opts;

  checkCanceled(signal);

  let current = String(url);
  let requestMethod = String(method).toUpperCase();
  let requestBody = body;
  const normalizedHeaders = new Headers(headers);
  if (!normalizedHeaders.has('user-agent')) normalizedHeaders.set('user-agent', 'qq-agent/0.5 (+https://kondius.cn)');
  let requestHeaders = Object.fromEntries(normalizedHeaders);
  const nativeRequest = !fetchImpl || fetchImpl === globalThis.fetch;
  const hops = [];
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u;
    try { u = new URL(current); } catch { throw new Error(`地址不合法：${current}`); }
    if (!/^https?:$/.test(u.protocol)) throw new Error(`只支持 http(s) 地址（收到 ${u.protocol}）`);
    if (u.username || u.password) throw new Error('地址不能包含用户名或密码');
    // 浏览锁定：逐跳白名单（含重定向后的每一跳）
    if (browseLocked && !hostAllowedByLock(u.hostname, allowedHosts)) {
      throw new Error(`抓取失败：目标不在浏览锁定白名单（${u.hostname}）`);
    }
    hops.push(current);

    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason ?? new Error('请求已中止'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    const releaseAbort = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeoutMs);
    let res;
    try {
      checkCanceled(controller.signal);
      // 注入 transport 是可信测试/宿主入口；生产请求总是使用固定地址的原生连接。
      const address = nativeRequest || !allowPrivate || opts.dnsLookup
        ? await checkedAddress(u, dnsLookup, allowPrivate, controller.signal) : null;
      const init = {
        redirect: 'manual', // 手动跟跳（每跳都要校验）
        signal: controller.signal,
        method: requestMethod, headers: requestHeaders,
        ...(requestBody === undefined ? {} : { body: requestBody }),
      };
      res = await whileActive(() => nativeRequest ? requestPinned(u, init, address) : fetchImpl(current, init), controller.signal, discardResponse);
    } catch (err) {
      clearTimeout(timer);
      releaseAbort();
      if (controller.signal.aborted) throw controller.signal.reason;
      throw err;
    }

    if ([301, 302, 303, 307, 308].includes(res.status) && followRedirects) {
      let releasingBody = false;
      try {
      try { await whileActive(() => { releasingBody = true; return res.body?.cancel?.(); }, controller.signal); } catch (err) { checkCanceled(controller.signal); /* 释放本跳连接，尽力 */ }
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`重定向缺少 Location（HTTP ${res.status}）`);
      const next = new URL(loc, current);
      if (next.origin !== u.origin) {
        requestHeaders = Object.fromEntries(Object.entries(requestHeaders).filter(([name]) =>
          !/^(authorization|proxy-authorization|cookie2?|host)$|(?:^|[-_])(api[-_]?key|auth|token|secret|credential)(?:$|[-_])/i.test(name)));
      }
      if ((res.status === 303 && requestMethod !== 'HEAD') || ([301, 302].includes(res.status) && requestMethod === 'POST')) {
        requestMethod = 'GET'; requestBody = undefined;
        for (const name of ['content-type', 'content-length', 'content-encoding', 'transfer-encoding']) delete requestHeaders[name];
      }
      current = next.toString();
      continue;
      } finally {
        if (!releasingBody) void discardResponse(res);
        clearTimeout(timer);releaseAbort();
      }
    }

    let reader, bodyDone = false, bodyCanceled = false;
    const cancelBody = () => {
      if (bodyCanceled || bodyDone) return;
      bodyCanceled = true;
      try { return Promise.resolve(reader ? reader.cancel?.(controller.signal.reason) : res.body?.cancel?.(controller.signal.reason)).catch(() => {}); }
      catch { /* cleanup must not replace a timeout/cancellation/business error */ }
    };
    try {
      checkCanceled(controller.signal);
      // 流式读取 + 上限截断（不 buffer 全量——96MB 堆上限事故）
      const chunks = [];
      const appendChunk = async (chunk) => {
        checkCanceled(controller.signal);
        if (typeof onChunk === 'function') await whileActive(() => onChunk(Buffer.from(chunk)), controller.signal);
        else chunks.push(chunk);
        checkCanceled(controller.signal);
      };
      let size = 0;
      let truncated = false;
      reader = res.body?.getReader?.();
      if (reader) {
        while (true) {
          const { done, value } = await whileActive(() => reader.read(), controller.signal);
          if (done) { bodyDone = true; break; }
          size += value.byteLength;
          if (size > maxBytes) {
            await appendChunk(value.slice(0, Math.max(0, maxBytes - (size - value.byteLength))));
            truncated = true;
            await whileActive(cancelBody, controller.signal);
            break;
          }
          await appendChunk(value);
        }
      } else {
        const buf = Buffer.from(await whileActive(() => res.arrayBuffer(), controller.signal));
        bodyDone = true;
        size = buf.length;
        truncated = buf.length > maxBytes;
        await appendChunk(truncated ? buf.slice(0, maxBytes) : buf);
      }
      const responseBody = Buffer.concat(chunks);
      checkCanceled(controller.signal);
      return {
        status: res.status, headers: res.headers, finalUrl: current,
        body: typeof onChunk === 'function' ? null : expectBinary ? responseBody : responseBody.toString('utf8'),
        bytes: Math.min(size, maxBytes), truncated, hops,
      };
    } catch (err) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw err;
    } finally {
      void cancelBody();
      try { reader?.releaseLock?.(); } catch { /* pending non-cooperative readers may keep their own lock */ }
      clearTimeout(timer);
      releaseAbort();
    }
  }
  throw new Error(`重定向次数过多（>${maxRedirects} 跳）`);
}

/** 下载图片为 dataUrl（含 MIME 嗅探与私网防护）。 */
export async function downloadImageAsDataUrl(url, { maxBytes = 5 * 1024 * 1024, browseLocked = false, allowedHosts = [], allowPrivate = false, fetchImpl, dnsLookup, signal } = {}) {
  const res = await safeFetch(url, { maxBytes, browseLocked, allowedHosts, allowPrivate, expectBinary: true, fetchImpl, dnsLookup, signal });
  if (res.status !== 200) throw new Error(`下载失败（HTTP ${res.status}）`);
  if (res.truncated) throw new Error(`图片超过下载上限（${Math.round(maxBytes / 1024)} KB）`);
  if (!res.bytes) throw new Error('图片内容为空');
  const mime = detectMime(res.body);
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(mime)) {
    const contentType = String(res.headers.get('content-type') ?? '').split(';')[0];
    if (/^\s*(?:<!doctype\s+html|<html)/i.test(res.body.toString('utf8', 0, 200))) throw new Error('这个地址返回的是网页（HTML），不是图片直链。先用 web_fetch 抓那页，再从它返回的 images 里挑一条直链。');
    throw new Error(`这个地址返回的不是图片（Content-Type: ${contentType || '未知'}）。只支持 png/jpg/gif/webp 直链。`);
  }
  return { dataUrl: `data:${mime};base64,${res.body.toString('base64')}`, buffer: res.body, mime, bytes: res.bytes };
}

// 魔数嗅探（tools.js:87-94 detectMime 口径）
export function detectMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function detectImageExt(buf) {
  const mime = detectMime(buf);
  return mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : mime === 'image/gif' ? '.gif' : mime === 'image/webp' ? '.webp' : '.bin';
}
