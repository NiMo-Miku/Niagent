// Presentation cleanup and physical text planning. No transport or storage effects.
function proseToPlain(text) {
  return text
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}\p{M}_])__([^_\r\n]+)__(?![\p{L}\p{N}\p{M}_])/gu, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}\p{M}_])_([^_\r\n]+)_(?![\p{L}\p{N}\p{M}_])/gu, '$1')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '');
}

export function mdToPlain(text) {
  const value = String(text ?? '');
  // Keep literals in their own ranges: no placeholder can collide with input.
  // CQ stays literal text; the transport remains responsible for CQ escaping.
  const literal = /(^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)^ {0,3}\2[ \t]*(?=\r?$))|(?<!`)(`+)([^\r\n]*?)\4(?!`)|(\[CQ:[^\]\r\n]*\])|((?:(?:https?|file):\/\/|\bwww\.)[^\s<>]+)|(\\[\\`*_{}\[\]()#+.!>\-])/gim;
  let end = 0, result = '';
  for (const match of value.matchAll(literal)) {
    result += proseToPlain(value.slice(end, match.index));
    result += match[1] ? match[3].replace(/\r?\n$/, '') : match[4] ? match[5] : match[0];
    end = match.index + match[0].length;
  }
  return result + proseToPlain(value.slice(end));
}

export function normalizeSplitLimit(value = 4000) {
  const number = Number(value);
  if (number === 0) return 0;
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : 4000;
}

function validText(text) {
  if (/\[object Object\]/.test(text)) throw new Error('消息内容为空：发送内容被误序列化成 [object Object]（请检查参数）');
  if (!text.isWellFormed()) throw new Error('发送失败：文字包含不完整的 Unicode 字符');
  return text;
}

export function splitText(text, max = 4000) {
  const value = validText(String(text ?? '')), limit = normalizeSplitLimit(max);
  if (!limit || value.length <= limit) return value ? [value] : [];
  const parts = [];
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + limit, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff
      && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) end--;
    // At limit1, one non-BMP code point necessarily needs two UTF16 units.
    if (end === start) end = Math.min(start + 2, value.length);
    parts.push(value.slice(start, end)); start = end;
  }
  return parts;
}

export function prepareTextBatch(texts, { plainText = mdToPlain, split = splitText, limit = 4000, prepared = false } = {}) {
  const parts = [];
  for (const raw of Array.isArray(texts) ? texts : [texts]) {
    if (raw == null) continue;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`发送失败：消息内容必须是字符串（收到 ${typeof raw}）`);
    let text = validText(String(raw));
    if (!prepared) {
      text = plainText(text);
      if (typeof text !== 'string') {
        if (text && typeof text.then === 'function') Promise.resolve(text).catch(() => {});
        throw new Error('发送失败：文本转换器必须同步返回字符串');
      }
      text = validText(text).trim();
    }
    if (!text.length) throw new Error('消息内容为空');
    const chunks = prepared ? [text] : split(text, limit);
    if (chunks && typeof chunks.then === 'function') Promise.resolve(chunks).catch(() => {});
    if (!Array.isArray(chunks) || !chunks.length || chunks.some(chunk => typeof chunk !== 'string' || !chunk.length)
      || chunks.join('') !== text) throw new Error('发送失败：文本切分器必须保留完整原文');
    for (const chunk of chunks) parts.push(validText(chunk));
  }
  if (!parts.length || !parts.join('').trim()) throw new Error('消息内容为空');
  return parts;
}
