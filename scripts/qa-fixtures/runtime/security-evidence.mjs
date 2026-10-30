import assert from 'node:assert/strict';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { safeFetch } from '../../../src/kernel/safe-fetch.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, description, timeoutMs = 1500) {
  const started = performance.now();
  while (!predicate()) {
    assert.ok(performance.now() - started < timeoutMs, `未观察到 ${description}`);
    await pause(5);
  }
}

async function rejected(run, pattern) {
  let caught;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, '安全拒绝路径必须抛错');
  assert.match(String(caught.message ?? caught), pattern);
  return { name: caught.name, message: String(caught.message ?? caught) };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function loopbackBase(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:', '补充安全验收只接受本地 HTTP 服务');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), '补充安全验收不能访问外网');
  assert.ok(!url.username && !url.password, '验收服务 URL 不能包含认证信息');
  return url;
}

/**
 * Exercise the production safeFetch against real local sockets. Only the last
 * public-to-private redirect case injects DNS and transport, explicitly marked
 * in its evidence, so no public network connection is required.
 */
export async function runSecurityEvidence({ localUrl } = {}) {
  const suppliedBase = localUrl ? loopbackBase(localUrl) : null;
  const evidence = [];
  const primaryRequests = [];
  const sinkRequests = [];
  const timers = new Set();
  const article = Buffer.from(`<!doctype html><html><body>${'qa-local-evidence '.repeat(2048)}</body></html>`);
  let primaryBase;
  let sinkBase;
  const add = (id, title, detail) => evidence.push({ id, title, passed: true, detail });
  const count = (pathname) => primaryRequests.filter((entry) => entry.pathname === pathname).length;
  const allRequestCount = () => primaryRequests.length + sinkRequests.length;
  const schedule = (callback, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms);
    timers.add(timer);
    return timer;
  };
  const cancelTimer = (timer) => { clearTimeout(timer); timers.delete(timer); };

  const sink = http.createServer((request, response) => {
    sinkRequests.push({ pathname: new URL(request.url, 'http://127.0.0.1').pathname, headers: { ...request.headers } });
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('QA_LOCAL_SINK');
  });
  const primary = http.createServer((request, response) => {
    const url = new URL(request.url, primaryBase);
    const entry = { pathname: url.pathname, headers: { ...request.headers }, bytesWritten: 0, completed: false, disconnected: false };
    primaryRequests.push(entry);
    response.on('finish', () => { entry.completed = true; });
    response.on('close', () => { entry.disconnected = !response.writableFinished; });
    if (url.pathname === '/article') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': article.length });
      entry.bytesWritten = article.length;
      response.end(article);
    } else if (url.pathname === '/redirect-lock') {
      response.writeHead(302, { location: `${primaryBase.replace('127.0.0.1', 'localhost')}/article` });
      response.end();
    } else if (url.pathname === '/redirect-cross') {
      response.writeHead(302, { location: `${sinkBase}/sink` });
      response.end();
    } else if (url.pathname === '/slow' || url.pathname === '/slow-body') {
      if (url.pathname === '/slow-body') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.write('QA_BODY_STARTED');
        entry.bytesWritten = Buffer.byteLength('QA_BODY_STARTED');
      }
      const timer = schedule(() => {
        if (!response.destroyed) { entry.bytesWritten += 19; response.end('QA_DELAYED_RESPONSE'); }
      }, 500);
      response.once('close', () => cancelTimer(timer));
    } else if (url.pathname === '/stream') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      const writeChunk = () => {
        if (response.destroyed) return;
        const chunk = Buffer.alloc(2048, 0x61);
        entry.bytesWritten += chunk.length;
        response.write(chunk);
        if (entry.bytesWritten >= 65536) response.end();
        else {
          const timer = schedule(writeChunk, 10);
          response.once('close', () => cancelTimer(timer));
        }
      };
      writeChunk();
    } else {
      response.writeHead(404); response.end('QA_NOT_FOUND');
    }
  });

  try {
    primaryBase = await listen(primary);
    sinkBase = await listen(sink);
    const articleUrl = `${primaryBase}/article`;

    let before = allRequestCount();
    const loopbackError = await rejected(() => safeFetch(articleUrl), /拒绝访问内网地址/);
    await pause(20);
    assert.equal(allRequestCount(), before);
    add('security-loopback-denied', '默认回环地址拒绝且未发出 HTTP 请求', {
      transport: 'production native HTTP', httpRequests: allRequestCount() - before, error: loopbackError,
    });

    before = count('/article');
    const allowed = await safeFetch(articleUrl, { allowPrivate: true, maxBytes: 1024 * 1024 });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.bytes, article.length);
    assert.equal(Buffer.byteLength(allowed.body), article.length);
    assert.equal(allowed.truncated, false);
    assert.equal(count('/article') - before, 1);
    add('security-loopback-allowed', '显式允许私网时真实本地抓取成功', {
      transport: 'production native HTTP', httpRequests: count('/article') - before,
      status: allowed.status, bytes: allowed.bytes, truncated: allowed.truncated,
    });

    if (suppliedBase) {
      const supplied = await safeFetch(new URL('/article', suppliedBase).href, { allowPrivate: true, maxBytes: 1024 * 1024, timeoutMs: 2000 });
      assert.equal(supplied.status, 200);
      assert.ok(supplied.body.length > 20000, '父验收服务 /article 必须提供超过 20000 字符的 HTML');
      assert.equal(supplied.truncated, false);
      add('security-caller-local-service', '父验收服务 HTML 通过真实安全抓取', {
        transport: 'production native HTTP', status: supplied.status, bytes: supplied.bytes, characters: supplied.body.length,
      });
    }

    before = allRequestCount();
    const credentialUrl = new URL(articleUrl);
    credentialUrl.username = 'qa-only'; credentialUrl.password = 'synthetic';
    const credentialError = await rejected(() => safeFetch(credentialUrl.href, { allowPrivate: true }), /地址不能包含用户名或密码/);
    const fileError = await rejected(() => safeFetch('file:///qa-security-evidence', { allowPrivate: true }), /只支持 http\(s\)/);
    assert.equal(allRequestCount(), before);
    add('security-url-scheme-auth-denied', 'URL 认证与 file 协议均在连接前拒绝', {
      httpRequests: allRequestCount() - before, credentialError, fileError,
    });

    const articleBeforeLock = count('/article');
    const redirectsBeforeLock = count('/redirect-lock');
    const lockError = await rejected(() => safeFetch(`${primaryBase}/redirect-lock`, {
      allowPrivate: true, browseLocked: true, allowedHosts: ['127.0.0.1'],
    }), /浏览锁定白名单.*localhost/);
    assert.equal(count('/redirect-lock') - redirectsBeforeLock, 1);
    assert.equal(count('/article'), articleBeforeLock);
    add('security-redirect-lock', '真实重定向逐跳复核浏览锁白名单', {
      transport: 'production native HTTP', initialRequests: count('/redirect-lock') - redirectsBeforeLock,
      disallowedTargetRequests: count('/article') - articleBeforeLock, error: lockError,
    });

    const streamBefore = count('/stream');
    const stream = await safeFetch(`${primaryBase}/stream`, { allowPrivate: true, maxBytes: 8192, expectBinary: true });
    const streamEntry = primaryRequests.filter((entry) => entry.pathname === '/stream').at(-1);
    assert.equal(stream.status, 200);
    assert.equal(stream.bytes, 8192);
    assert.equal(stream.body.length, 8192);
    assert.equal(stream.truncated, true);
    assert.ok(stream.body.every((byte) => byte === 0x61));
    await waitFor(() => streamEntry.disconnected, '流上限截断后服务端观察到连接关闭');
    assert.ok(streamEntry.bytesWritten > stream.bytes && streamEntry.bytesWritten < 65536);
    add('security-native-stream-limit', '真实分块流按 maxBytes 截断并关闭连接', {
      transport: 'production native HTTP', httpRequests: count('/stream') - streamBefore,
      retainedBytes: stream.bytes, serverWrittenBytes: streamEntry.bytesWritten,
      fullStreamBytes: 65536, truncated: stream.truncated, serverObservedDisconnect: streamEntry.disconnected,
    });

    const chunkSizes = [];
    const streamed = await safeFetch(`${primaryBase}/stream`, {
      allowPrivate: true, maxBytes: 5000, onChunk: (chunk) => { chunkSizes.push(chunk.length); },
    });
    assert.equal(streamed.body, null);
    assert.equal(streamed.bytes, 5000);
    assert.equal(streamed.truncated, true);
    assert.equal(chunkSizes.reduce((total, size) => total + size, 0), 5000);
    assert.ok(chunkSizes.length > 1);
    add('security-native-stream-callback-limit', '真实流回调累计字节同样受上限约束', {
      retainedBytes: streamed.bytes, callbackBytes: chunkSizes.reduce((total, size) => total + size, 0),
      callbackChunks: chunkSizes.length, finalChunkBytes: chunkSizes.at(-1), bodyBuffered: streamed.body !== null,
    });

    const slowBefore = count('/slow');
    let started = performance.now();
    const timeoutError = await rejected(() => safeFetch(`${primaryBase}/slow`, { allowPrivate: true, timeoutMs: 80 }), /请求超时/);
    const timeoutElapsedMs = Math.round(performance.now() - started);
    const timeoutEntry = primaryRequests.filter((entry) => entry.pathname === '/slow').at(-1);
    assert.equal(count('/slow') - slowBefore, 1);
    await waitFor(() => timeoutEntry.disconnected, '超时关闭真实服务端连接');
    assert.equal(timeoutEntry.completed, false);
    add('security-native-timeout', '真实等待响应超时会取消 HTTP 请求', {
      timeoutMs: 80, responseDelayMs: 500, elapsedMs: timeoutElapsedMs,
      httpRequests: count('/slow') - slowBefore, serverObservedDisconnect: timeoutEntry.disconnected, error: timeoutError,
    });

    const bodyBefore = count('/slow-body');
    const controller = new AbortController();
    started = performance.now();
    const abortResult = rejected(() => safeFetch(`${primaryBase}/slow-body`, {
      allowPrivate: true, timeoutMs: 1500, signal: controller.signal,
    }), /QA caller cancelled/);
    await waitFor(() => count('/slow-body') > bodyBefore, '真实响应流开始');
    await pause(20);
    controller.abort(new Error('QA caller cancelled'));
    const abortError = await abortResult;
    const abortElapsedMs = Math.round(performance.now() - started);
    const abortedEntry = primaryRequests.filter((entry) => entry.pathname === '/slow-body').at(-1);
    assert.equal(count('/slow-body') - bodyBefore, 1);
    assert.ok(abortedEntry.bytesWritten > 0);
    await waitFor(() => abortedEntry.disconnected, '调用者取消后关闭真实响应流');
    assert.equal(abortedEntry.completed, false);
    add('security-native-abort-signal', '调用者 AbortSignal 可中止已经开始的真实响应流', {
      elapsedMs: abortElapsedMs, responseDelayMs: 500, serverWrittenBytes: abortedEntry.bytesWritten,
      serverObservedDisconnect: abortedEntry.disconnected, error: abortError,
    });

    before = allRequestCount();
    const preAborted = new AbortController();
    preAborted.abort(new Error('QA pre-aborted'));
    const preAbortError = await rejected(() => safeFetch(articleUrl, {
      allowPrivate: true, signal: preAborted.signal,
    }), /QA pre-aborted/);
    await pause(20);
    assert.equal(allRequestCount(), before);
    add('security-native-pre-aborted', '已取消信号在连接前拒绝', {
      httpRequests: allRequestCount() - before, error: preAbortError,
    });

    const sensitiveHeaders = ['authorization', 'proxy-authorization', 'cookie', 'cookie2', 'x-api-key', 'x-custom-api-key', 'x-qa-token', 'x-credential'];
    const requestHeaders = Object.fromEntries(sensitiveHeaders.map((name) => [name, `qa-synthetic-${name}`]));
    requestHeaders['x-qa-benign'] = 'keep-local';
    const sinkBefore = sinkRequests.length;
    const redirectBefore = count('/redirect-cross');
    const cross = await safeFetch(`${primaryBase}/redirect-cross`, { allowPrivate: true, headers: requestHeaders });
    const initialHeaders = primaryRequests.filter((entry) => entry.pathname === '/redirect-cross').at(-1).headers;
    const received = sinkRequests.at(-1);
    assert.equal(cross.status, 200);
    assert.equal(cross.body, 'QA_LOCAL_SINK');
    assert.equal(cross.hops.length, 2);
    assert.equal(count('/redirect-cross') - redirectBefore, 1);
    assert.equal(sinkRequests.length - sinkBefore, 1);
    assert.equal(received.pathname, '/sink');
    for (const name of sensitiveHeaders) {
      assert.equal(initialHeaders[name], requestHeaders[name], `第一跳必须实际携带 ${name}`);
      assert.equal(received.headers[name], undefined, `跨端口目标不得收到 ${name}`);
    }
    assert.equal(received.headers['x-qa-benign'], 'keep-local');
    assert.notEqual(new URL(primaryBase).port, new URL(sinkBase).port);
    add('security-native-cross-origin-header-strip', '真实跨端口重定向剥离认证 Cookie 与自定义 API 密钥', {
      transport: 'production native HTTP', initialRequests: count('/redirect-cross') - redirectBefore,
      sinkRequests: sinkRequests.length - sinkBefore, hops: cross.hops.length,
      strippedHeaderNames: sensitiveHeaders, strippedHeaderCount: sensitiveHeaders.length,
      benignHeaderPreserved: received.headers['x-qa-benign'] === requestHeaders['x-qa-benign'],
    });

    const dnsHosts = [];
    const transportUrls = [];
    before = allRequestCount();
    const publicPrivateError = await rejected(() => safeFetch('https://public.qa.invalid/start', {
      dnsLookup: async (hostname) => {
        dnsHosts.push(hostname);
        return [{ address: hostname === 'public.qa.invalid' ? '203.0.113.10' : '127.0.0.1', family: 4 }];
      },
      fetchImpl: async (url) => {
        transportUrls.push(String(url));
        return new Response(null, { status: 302, headers: { location: 'http://private.qa.invalid/sink' } });
      },
    }), /拒绝访问内网地址.*127\.0\.0\.1/);
    assert.deepEqual(dnsHosts, ['public.qa.invalid', 'private.qa.invalid']);
    assert.deepEqual(transportUrls, ['https://public.qa.invalid/start']);
    assert.equal(allRequestCount(), before);
    add('security-injected-public-private-redirect', '公域名跳转私网在第二跳连接前拒绝（注入 DNS 与 transport）', {
      transport: 'injected DNS and fetch; no external I/O', dnsLookups: dnsHosts.length,
      transportCalls: transportUrls.length, privateTargetTransportCalls: 0,
      realHttpRequests: allRequestCount() - before, error: publicPrivateError,
    });

    return evidence;
  } finally {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    await Promise.all([close(primary), close(sink)]);
  }
}
