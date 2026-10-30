import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { safeFetch } from '../../src/kernel/safe-fetch.js';

export function requireSha256(value) { const hash = String(value ?? '').trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('安装包没有可信 SHA256；拒绝下载或安装。'); return hash; }
export function fileSha256(file) {
  const fd = fs.openSync(file, 'r'), hash = createHash('sha256'), chunk = Buffer.alloc(1024 * 1024);
  try { for (;;) { const count = fs.readSync(fd, chunk); if (!count) break; hash.update(chunk.subarray(0, count)); } return hash.digest('hex'); } finally { fs.closeSync(fd); }
}
export function verifyArchive(file, expected) {
  const want = requireSha256(expected), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('安装包必须是普通文件');
  if (fileSha256(file) !== want) throw new Error('安装包 SHA256 校验失败；未修改现有安装。');
  return want;
}
export async function download(url, destination, { expectedSha256, maxBytes = 2 * 1024 ** 3, fetchImpl, dnsLookup, signal, onProgress } = {}) {
  const expected = requireSha256(expectedSha256), address = new URL(url);
  if (address.protocol !== 'https:' || address.username || address.password) throw new Error('安装下载源必须是不含凭据的 HTTPS 地址');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    const stat = fs.lstatSync(destination); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('缓存安装包必须是普通文件');
    if (fileSha256(destination) === expected) return { bytes: stat.size, sha256: expected, fromCache: true };
  }
  const part = `${destination}.${randomUUID()}.part`, handle = await fs.promises.open(part, 'wx');
  let hash = createHash('sha256'), bytes = 0;
  try {
    let result, current = address;
    for (let hop = 0; hop <= 5; hop++) {
      if (current.protocol !== 'https:' || current.username || current.password) throw new Error('安装下载重定向必须保持无凭据 HTTPS');
      result = await safeFetch(current.href, { maxBytes, followRedirects: false, timeoutMs: 900000, signal, ...(fetchImpl ? { fetchImpl } : {}), ...(dnsLookup ? { dnsLookup } : {}), onChunk: async chunk => { const position = bytes; bytes += chunk.length; hash.update(chunk); let written = 0; while (written < chunk.length) written += (await handle.write(chunk, written, chunk.length - written, position + written)).bytesWritten; onProgress?.({ bytes }); } });
      if (![301, 302, 303, 307, 308].includes(result.status)) break;
      const location = result.headers.get('location'); if (!location || hop === 5) throw new Error('安装下载重定向无效或过多');
      current = new URL(location, current); await handle.truncate(0); hash = createHash('sha256'); bytes = 0;
    }
    if (result.status !== 200 || result.truncated) throw new Error(`安装包下载失败：${result.truncated ? '超过大小上限' : `HTTP ${result.status}`}`);
    const declared = Number(result.headers.get('content-length'));
    if (declared && declared !== bytes && !result.headers.get('content-encoding')) throw new Error('安装包下载中断：字节数不完整');
    if (hash.digest('hex') !== expected) throw new Error('安装包 SHA256 校验失败；未修改现有安装。');
    await handle.sync(); await handle.close();
    // A verified replacement is published only after the complete stream passes.
    fs.renameSync(part, destination); return { bytes, sha256: expected, fromCache: false };
  } catch (error) { await handle.close().catch(() => {}); fs.rmSync(part, { force: true }); throw error; }
}
