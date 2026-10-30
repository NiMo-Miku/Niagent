// Disk-only policy. Memory and bus entries keep the original diagnostic text.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DISK_MARKER = '…（磁盘记录过长，已截断）';
const bytes = value => Buffer.byteLength(value, 'utf8');
const line = entry => JSON.stringify(entry) + '\n';
const regular = stat => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
const same = (a, b) => regular(b) && a.dev === b.dev && a.ino === b.ino
  && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

function prefix(text, length) {
  // Do not split a UTF-16 surrogate pair before JSON/UTF-8 encoding.
  if (length > 0 && length < text.length && /[\uD800-\uDBFF]/.test(text[length - 1])
    && /[\uDC00-\uDFFF]/.test(text[length])) length--;
  return text.slice(0, length);
}

function fit(text, render, budget) {
  let low = 0, high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (bytes(render(prefix(text, mid))) <= budget) low = mid;
    else high = mid - 1;
  }
  return prefix(text, low);
}

export function createLogPolicy({
  maxDiskEntryBytes = 64 * 1024,
  maxStartupFileBytes = 256 * 1024 * 1024,
  startupTailBytes = 16 * 1024 * 1024,
  retentionDays = 7,
} = {}) {
  for (const [key, value, min] of [
    ['maxDiskEntryBytes', maxDiskEntryBytes, 512],
    ['maxStartupFileBytes', maxStartupFileBytes, 1],
    ['startupTailBytes', startupTailBytes, 1],
    ['retentionDays', retentionDays, 1],
  ]) {
    if (!Number.isSafeInteger(value) || value < min) throw new TypeError(`${key} 必须为不小于 ${min} 的安全整数`);
  }
  if (startupTailBytes > maxStartupFileBytes) throw new TypeError('startupTailBytes 不能大于 maxStartupFileBytes');

  function diskLine(entry) {
    const full = line(entry), originalBytes = bytes(full);
    if (originalBytes <= maxDiskEntryBytes) return full;
    const row = {
      at: entry.at, level: entry.level, src: String(entry.src), msg: DISK_MARKER,
      truncated: { reason: 'disk-entry-budget', originalBytes, limitBytes: maxDiskEntryBytes },
    };
    if (bytes(line(row)) > maxDiskEntryBytes) {
      row.truncated.sourceTruncated = true;
      row.src = fit(row.src, src => line({ ...row, src }), maxDiskEntryBytes);
    }
    row.msg = fit(String(entry.msg), msg => line({ ...row, msg: msg + DISK_MARKER }), maxDiskEntryBytes) + DISK_MARKER;
    const result = line(row);
    if (bytes(result) > maxDiskEntryBytes) throw new Error('日志元数据超过磁盘记录预算');
    return result;
  }

  function compact(file, stat, now) {
    let input, output, temp;
    try {
      input = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
      if (!same(stat, fs.fstatSync(input))) throw new Error('日志文件在整理前已改变');
      const length = Math.min(stat.size, startupTailBytes), start = stat.size - length;
      const tail = Buffer.alloc(length);
      let startsAtBoundary = start === 0;
      if (start) {
        const previous = Buffer.alloc(1);
        if (fs.readSync(input, previous, 0, 1, start - 1) !== 1) throw new Error('日志边界读取不完整');
        startsAtBoundary = previous[0] === 10;
      }
      let read = 0;
      while (read < length) {
        const count = fs.readSync(input, tail, read, length - read, start + read);
        if (!count) throw new Error('日志尾部读取不完整');
        read += count;
      }
      if (!same(stat, fs.fstatSync(input))) throw new Error('日志文件在读取时已改变');
      fs.closeSync(input); input = undefined;

      // A byte window may begin inside a code point or a JSON record. Discard
      // that leading fragment and any unterminated final record. Decode each
      // complete line strictly; never manufacture replacement characters.
      // Keep an initial BOM in the validation string: JSON.parse must reject
      // it if we would retain those same raw bytes in the middle of JSONL.
      const kept = [], decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      let cursor = startsAtBoundary ? 0 : tail.indexOf(10) + 1, invalidLines = 0;
      if (!startsAtBoundary && cursor === 0) cursor = tail.length;
      while (cursor < tail.length) {
        const end = tail.indexOf(10, cursor);
        if (end < 0) break;
        const record = tail.subarray(cursor, end + 1);
        try { JSON.parse(decoder.decode(record)); kept.push(record); }
        catch { invalidLines++; }
        cursor = end + 1;
      }
      const retainedBytes = kept.reduce((sum, record) => sum + record.length, 0);
      const marker = {
        at: new Date(now).toISOString(), level: 'warn', src: 'logger',
        msg: '启动整理：日志异常膨胀，已截断；仅保留尾部窗口内完整且有效的 UTF-8 JSONL 记录。',
        truncated: { reason: 'startup-file-budget', originalBytes: stat.size, retainedBytes,
          discardedBytes: stat.size - retainedBytes, limitBytes: startupTailBytes, invalidLines },
      };
      const payload = Buffer.concat([Buffer.from(line(marker)), ...kept]);
      temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
      output = fs.openSync(temp, 'wx', stat.mode & 0o777);
      fs.writeFileSync(output, payload);
      fs.fsyncSync(output);
      fs.closeSync(output); output = undefined;
      if (!regular(fs.lstatSync(temp)) || !fs.readFileSync(temp).equals(payload)) throw new Error('日志临时文件校验失败');
      if (!same(stat, fs.lstatSync(file))) throw new Error('日志文件在替换前已改变');
      fs.renameSync(temp, file); temp = undefined;
      return { file: path.basename(file), originalBytes: stat.size, retainedBytes, discardedBytes: stat.size - retainedBytes, invalidLines };
    } finally {
      if (input !== undefined) fs.closeSync(input);
      if (output !== undefined) fs.closeSync(output);
      if (temp) { try { fs.unlinkSync(temp); } catch { /* keep the original on every pre-rename failure */ } }
    }
  }

  function prepare({ logsDir, now = Date.now() } = {}) {
    const summary = { removed: [], compacted: [], skipped: [], failed: [] };
    if (!logsDir) return summary;
    let directory;
    try { directory = fs.lstatSync(logsDir); }
    catch (error) { summary.failed.push({ file: '.', error: String(error.message) }); return summary; }
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      summary.skipped.push({ file: '.', reason: 'non-regular-directory' }); return summary;
    }
    let names;
    try { names = fs.readdirSync(logsDir); }
    catch (error) { summary.failed.push({ file: '.', error: String(error.message) }); return summary; }
    const cutoff = now - retentionDays * 86400_000;
    for (const name of names) {
      if (!name.endsWith('.log')) continue;
      const file = path.join(logsDir, name);
      try {
        const stat = fs.lstatSync(file);
        if (!regular(stat)) { summary.skipped.push({ file: name, reason: 'non-regular-or-linked-file' }); continue; }
        if (stat.mtimeMs < cutoff) {
          if (!same(stat, fs.lstatSync(file))) throw new Error('日志文件在清理前已改变');
          fs.unlinkSync(file); summary.removed.push(name);
        } else if (stat.size > maxStartupFileBytes) summary.compacted.push(compact(file, stat, now));
      } catch (error) { summary.failed.push({ file: name, error: String(error.message) }); }
    }
    return summary;
  }
  return Object.freeze({ diskLine, prepare });
}
