import fs from 'node:fs';
import path from 'node:path';
import { createInflateRaw } from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => { let value = byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0; });

function safeName(raw) {
  const name = raw.replace(/^(?:\.\/)+/, '').replace(/\/$/, '');
  if (!name) return '';
  if (name.length > 500 || /[\\:\x00-\x1f]/.test(name) || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('安装归档包含非法或越界路径');
  return name;
}

// Inspect ZIP central AND local paths before invoking the platform extractor.
// No member is extracted before every path/type/size passes this check.
export function inspectRuntimeArchive(file, { maxExpandedBytes = 4 * 1024 ** 3, maxFiles = 60000 } = {}) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (offset, count) => { if (offset < 0 || offset + count > size) throw new Error('安装归档不完整'); const bytes = Buffer.alloc(count); if (fs.readSync(fd, bytes, 0, count, offset) !== count) throw new Error('安装归档不完整'); return bytes; };
  try {
    const tail = read(Math.max(0, size - 65557), Math.min(size, 65557));
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break; }
    if (end < 0) throw new Error('只支持经过检查的 ZIP 安装归档');
    const count = tail.readUInt16LE(end + 10), centerSize = tail.readUInt32LE(end + 12), center = tail.readUInt32LE(end + 16);
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || count !== tail.readUInt16LE(end + 8) || count === 65535 || count > maxFiles || center + centerSize > size - 22) throw new Error('不支持分卷/ZIP64 或过大的安装归档');
    const seen = new Set(), entries = []; let offset = center, total = 0;
    for (let i = 0; i < count; i++) {
      const header = read(offset, 46); if (header.readUInt32LE(0) !== 0x02014b50) throw new Error('安装归档目录损坏');
      const flags = header.readUInt16LE(8), method = header.readUInt16LE(10), expanded = header.readUInt32LE(24), compressed = header.readUInt32LE(20);
      const nameSize = header.readUInt16LE(28), extraSize = header.readUInt16LE(30), commentSize = header.readUInt16LE(32), localOffset = header.readUInt32LE(42);
      if (flags & 1 || ![0, 8].includes(method) || expanded === 0xffffffff || compressed === 0xffffffff) throw new Error('不支持加密/ZIP64 或未知压缩格式');
      const raw = read(offset + 46, nameSize); const name = safeName(raw.toString('utf8'));
      const unixType = (header.readUInt32LE(38) >>> 16) & 0xf000;
      if (unixType && ![0x8000, 0x4000].includes(unixType)) throw new Error('安装归档不能包含符号链接或特殊文件');
      if (name) { const key = name.toLowerCase(); if (seen.has(key)) throw new Error('安装归档包含重复路径'); seen.add(key); }
      total += expanded; if (total > maxExpandedBytes) throw new Error('安装归档解压大小超限');
      const local = read(localOffset, 30); if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(8) !== method || local.readUInt16LE(6) !== flags) throw new Error('安装归档本地目录损坏');
      const localNameSize = local.readUInt16LE(26), localExtraSize = local.readUInt16LE(28);
      if (!raw.equals(read(localOffset + 30, localNameSize)) || localOffset + 30 + localNameSize + localExtraSize + compressed > center) throw new Error('安装归档本地路径与目录不一致');
      if (name) entries.push({ name, directory: raw.toString('utf8').endsWith('/') || unixType === 0x4000, expanded, compressed, method, crc: header.readUInt32LE(16), start: localOffset + 30 + localNameSize + localExtraSize });
      offset += 46 + nameSize + extraSize + commentSize;
    }
    if (offset !== center + centerSize || !entries.length) throw new Error('安装归档目录不完整或为空');
    return { entries, expandedBytes: total };
  } finally { fs.closeSync(fd); }
}

export async function extractRuntimeArchive(file, destination, options = {}) {
  const info = inspectRuntimeArchive(file, options);
  options.validateEntries?.(info.entries);
  fs.mkdirSync(destination, { recursive: true });
  // Extract exactly the validated central entries, never execute an external
  // unpacker and never follow undeclared local headers or archive-created links.
  for (const entry of info.entries) {
    const target = path.join(destination, entry.name);
    if (entry.directory) { if (entry.expanded) throw new Error('归档目录不能携带文件数据'); fs.mkdirSync(target, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let count = 0, crc = 0xffffffff;
    const guard = new Transform({ transform(chunk, _encoding, done) {
      count += chunk.length; if (count > entry.expanded) { done(new Error('安装归档解压大小与声明不符')); return; }
      for (let index = 0; index < chunk.length; index++) crc = crcTable[(crc ^ chunk[index]) & 255] ^ (crc >>> 8);
      done(null, chunk);
    } });
    const input = entry.compressed ? fs.createReadStream(file, { start: entry.start, end: entry.start + entry.compressed - 1 }) : Readable.from([]);
    const stages = entry.method === 8 ? [input, createInflateRaw(), guard] : [input, guard];
    await pipeline(...stages, fs.createWriteStream(target, { flags: 'wx' }));
    if (count !== entry.expanded || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new Error('安装归档文件数据/CRC校验失败');
  }
  assertPlainTree(destination);
  return info;
}

export function assertPlainTree(root, { maxFiles = 60000, maxBytes = 4 * 1024 ** 3 } = {}) {
  let count = 0, bytes = 0;
  function walk(dir) {
    const stat = fs.lstatSync(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('安装目录不能是符号链接或特殊文件');
    for (const name of fs.readdirSync(dir)) {
      safeName(path.relative(root, path.join(dir, name)).split(path.sep).join('/'));
      const file = path.join(dir, name), st = fs.lstatSync(file);
      if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) throw new Error('安装目录不能包含符号链接或特殊文件');
      if (++count > maxFiles) throw new Error('安装文件数量超限');
      if (st.isDirectory()) walk(file); else { bytes += st.size; if (bytes > maxBytes) throw new Error('安装目录大小超限'); }
    }
  }
  walk(root); return { files: count, bytes };
}
