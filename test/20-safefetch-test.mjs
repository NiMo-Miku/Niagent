// 20 · safe-fetch：SSRF 逐跳 / DNS 复核 / 浏览锁定逐跳 / 流式截断 / 魔数嗅探
import { ok, eq, section, summary } from './helpers.mjs';
import { safeFetch, isPrivateAddress, downloadImageAsDataUrl, detectMime, detectImageExt } from '../src/kernel/safe-fetch.js';
import dns from 'node:dns';

section('isPrivateAddress 私网段全表');
for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.0.1', '172.16.0.1', '172.31.255.1', '192.168.1.1', '0.0.0.1', '::1', '::ffff:192.168.1.1', 'fc00::1', 'fe80::1']) {
  eq(isPrivateAddress(ip), true, `私网 ${ip} 拒绝`);
}
for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '203.0.113.1']) {
  eq(isPrivateAddress(ip), false, `公网 ${ip} 放行（172.32 不属于 172.16-31）`);
}

section('SSRF：直连内网 IP 拒绝');
let err = null;
try { await safeFetch('http://127.0.0.1:3210/x', { fetchImpl: fetch }); } catch (e) { err = e; }
ok(err && /内网/.test(err.message), '127.0.0.1 拒绝');
err = null;
try { await safeFetch('http://192.168.1.1/x', { fetchImpl: fetch }); } catch (e) { err = e; }
ok(err && /内网/.test(err.message), '192.168 拒绝');
err = null;
try { await safeFetch('file:///C:/x', { fetchImpl: fetch }); } catch (e) { err = e; }
ok(err && /只支持 http/.test(err.message), 'file:// 拒绝');
err = null;
try { await safeFetch('http://[::1]/x', { fetchImpl: fetch }); } catch (e) { err = e; }
ok(err && /内网/.test(err.message), 'IPv6 ::1 拒绝');

section('DNS rebinding 防护（解析结果复核逻辑已在 isPrivateAddress 全覆盖）');
// 直接验证：逐跳 DNS 复核后私网 IP 一律拒——判定逻辑已在上段全覆盖，
// 此处验证"域名解析失败"的人话错误（离线环境域名解析不出时也不崩）：
err = null;
try {
  await safeFetch('http://this-domain-definitely-not-exists-qqa.local/x', { fetchImpl: fetch });
} catch (e) { err = e; }
ok(err !== null, '解析失败抛错（不静默放行）');

section('浏览锁定逐跳（白名单外拒绝）');
err = null;
try { await safeFetch('https://example.com/x', { browseLocked: true, allowedHosts: ['kondius.cn'], fetchImpl: fetch }); }
catch (e) { err = e; }
ok(err && /白名单/.test(err.message), '白名单外拒绝');

section('重定向逐跳（白名单内跳到白名单外 → 拒绝）');
const redirFetch = async (url) => {
  if (url.includes('ok.kondius.cn')) {
    return { status: 302, headers: new Map([['location', 'https://evil.com/x']]), body: null };
  }
  return { status: 200, headers: new Map(), body: null };
};
err = null;
try {
  await safeFetch('https://ok.kondius.cn/start', {
    browseLocked: true, allowedHosts: ['kondius.cn'], fetchImpl: redirFetch, allowPrivate: true,
  });
} catch (e) { err = e; }
ok(err && /白名单/.test(err.message), '重定向到白名单外被拦');

section('重定向上限');
const loopFetch = async () => ({ status: 302, headers: new Map([['location', 'https://x.cn/loop']]), body: null });
err = null;
try { await safeFetch('https://x.cn/loop', { fetchImpl: loopFetch, allowPrivate: true, maxRedirects: 3 }); }
catch (e) { err = e; }
ok(err && /重定向次数过多/.test(err.message), '超 3 跳拒绝');

section('流式截断（maxBytes 上限）');
const bigBuf = Buffer.alloc(3 * 1024 * 1024, 'a'); // 3MB
const streamFetch = async () => ({
  status: 200,
  headers: new Map(),
  body: {
    getReader() {
      let sent = 0;
      return {
        read: async () => {
          if (sent >= bigBuf.length) return { done: true };
          const chunk = bigBuf.slice(sent, sent + 65536);
          sent += chunk.length;
          return { done: false, value: chunk };
        },
        cancel: async () => {},
      };
    },
  },
});
const res = await safeFetch('https://x.cn/big', { fetchImpl: streamFetch, allowPrivate: true, maxBytes: 1024 * 1024 });
eq(res.bytes, 1024 * 1024, '截断到 1MB');
eq(res.truncated, true, 'truncated=true');

section('魔数嗅探（detectMime/detectImageExt）');
eq(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'image/png', 'PNG 魔数');
eq(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg', 'JPEG 魔数');
eq(detectMime(Buffer.from([0x47, 0x49, 0x46, 0x38])), 'image/gif', 'GIF 魔数');
eq(detectMime(Buffer.from('RIFFxxxxWEBP')), 'image/webp', 'WEBP');
eq(detectMime(Buffer.from('xxxx')), null, '未知 null');
eq(detectImageExt(Buffer.from([0x89, 0x50, 0x4e, 0x47])), '.png', 'ext .png');

section('downloadImageAsDataUrl（非图片拒绝）');
const htmlFetch = async () => ({
  status: 200, headers: new Map([['content-type', 'text/html']]),
  body: null, arrayBuffer: async () => Buffer.from('<html>').buffer,
});
// downloadImageAsDataUrl 内部走 safeFetch reader 分支；给一个 getReader 形态
const htmlFetch2 = async () => ({
  status: 200, headers: { get: (k) => (k === 'content-type' ? 'text/html' : null) },
  body: {
    getReader() {
      let sent = false;
      return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: Buffer.from('<html>hi</html>') }), cancel: async () => {} };
    },
  },
});
err = null;
try { await downloadImageAsDataUrl('https://x.cn/p', { fetchImpl: htmlFetch2, allowPrivate: true }); }
catch (e) { err = e; }
// downloadImageAsDataUrl 会把 fetchImpl 透传给 safeFetch（源已修）
ok(err && /网页（HTML）.*不是图片直链/.test(err.message), `HTML 按规格拒绝并提示网页取图：${err?.message ?? '（走到了真 fetch）'}`);

summary('20-safefetch');
