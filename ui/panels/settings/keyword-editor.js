// Natural-language keywords are lines, not comma/whitespace-separated IDs.
export const formatKeywords = value => Array.isArray(value) ? value.map(item => String(item ?? '')).join('\n') : '';
export const parseKeywords = value => String(value ?? '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);

export function mountKeywordEditor({ parent, value, onInput }) {
  const doc = parent.ownerDocument;
  const wrap = doc.createElement('label'); wrap.className = 'setting-field full'; wrap.dataset.path = 'store.keywords';
  const title = doc.createElement('span'); title.className = 'field-title'; title.textContent = '触发关键词（每行一个）';
  const input = doc.createElement('textarea'); input.id = 'field-store-keywords'; input.dataset.configPath = 'store.keywords'; input.rows = 4; input.value = formatKeywords(value);
  const hint = doc.createElement('small'); hint.className = 'field-hint'; hint.textContent = '每行是一条完整关键词；内部空格和逗号会保留。留空可清除。';
  const changed = () => onInput(parseKeywords(input.value)); input.addEventListener('input', changed);
  wrap.append(title, input, hint); parent.append(wrap);
  return { input, dispose() { input.removeEventListener('input', changed); } };
}
