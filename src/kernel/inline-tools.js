// Default inline parser. Selection still happens through core.tools.parseInline;
// parsing never executes a tool or turns ordinary prose into a sent reply.
const toolName = /^[a-z_][\w.-]*$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function jsonCall(value) {
  if (!object(value)) return null;
  const nested = object(value.function) ? value.function : value;
  const name = nested.name ?? (typeof value.function === 'string' ? value.function : value.tool);
  if (typeof name !== 'string' || !toolName.test(name)) return null;
  let args = nested.arguments ?? nested.parameters ?? nested.args ?? nested.input ?? {};
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return null; } }
  return object(args) ? { name, arguments: JSON.stringify(args) } : null;
}
function readJson(text) { try { return JSON.parse(text); } catch { return null; } }
function blockCall(block) {
  const fn = block.match(/<function\s*=\s*["']?([\w.-]+)["']?\s*>/i);
  if (fn && toolName.test(fn[1])) {
    const args = Object.create(null);
    for (const match of block.matchAll(/<parameter\s*=\s*["']?([^>"'\s]+)["']?\s*>([\s\S]*?)<\/parameter>/gi)) {
      const value = match[2].trim();
      // Invalid JSON remains a literal, including identifiers and leading zeros.
      try { args[match[1]] = JSON.parse(value); } catch { args[match[1]] = value; }
    }
    return { name: fn[1], arguments: JSON.stringify(args) };
  }
  const source = block.trim().replace(/^```(?:json)?\s*([\s\S]*?)```$/i, '$1').trim();
  const parsed = jsonCall(readJson(source));
  if (parsed) return parsed;
  const lines = source.split(/\r?\n/), name = lines.shift()?.trim();
  const args = readJson(lines.join('\n').trim());
  return toolName.test(name ?? '') && object(args) ? jsonCall({ name, arguments: args }) : null;
}

export function parseInlineToolCalls(text) {
  const source = String(text ?? ''), calls = [];
  for (const match of source.matchAll(/<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/gi)) {
    const call = blockCall(match[1]); if (call) calls.push(call);
  }
  if (calls.length) return calls;
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const call = jsonCall(readJson(match[1].trim())); if (call) calls.push(call);
  }
  if (calls.length) return calls;
  const lines = source.trim().split(/\r?\n/), name = lines.shift()?.trim();
  if (lines.length && toolName.test(name ?? '')) {
    const args = readJson(lines.join('\n').trim());
    if (object(args)) calls.push({ name, arguments: JSON.stringify(args) });
  }
  return calls;
}
