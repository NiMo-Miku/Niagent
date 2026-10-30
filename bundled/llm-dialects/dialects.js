// Thinking dialect hints: match HTTP(S) hostnames, then model names.
const DIALECT_RULES = [
  { host: /(?:^|\.)deepseek\.com$/i, model: /deepseek/i, dialect: 'deepseek' },
  { host: /(?:^|\.)bigmodel\.cn$/i, model: /glm/i, dialect: 'glm' },
  { host: /(?:^|\.)(?:dashscope|aliyuncs)\.com$/i, model: /qwen|qwq/i, dialect: 'qwen' },
  { host: /(?:^|\.)openai\.com$/i, model: /^(?:o\d|gpt-5(?:[.-]|$))/i, dialect: 'openai-o' },
  { host: /(?:^|\.)(?:anthropic|claude)\.[a-z.]+$/i, model: /claude/i, dialect: 'anthropic' },
  { host: /(?:^|\.)googleapis\.com$/i, model: /gemini/i, dialect: 'gemini' },
  { host: /(?:^|\.)openrouter\.ai$/i, model: null, dialect: 'openrouter' },
  { host: /(?:^|\.)x\.ai$/i, model: /grok/i, dialect: 'xai' },
];

export function detectDialect(baseUrl, model) {
  let host;
  try {
    const url = new URL(String(baseUrl ?? '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'generic';
    host = url.hostname.toLowerCase();
  } catch { return 'generic'; }
  // Retain 0.5's conservative compatible-endpoint policy: no forced think:true.
  if (/^(?:localhost|\[::1\]|(?:127|10)\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(host)) return 'local-openai';
  for (const rule of DIALECT_RULES) if (rule.host?.test(host)) return rule.dialect;
  for (const rule of DIALECT_RULES) if (rule.model?.test(String(model ?? ''))) return rule.dialect;
  return 'generic';
}

// mode:'default' follows the model without parameters. An omitted mode keeps
// the public legacy on:false contract, including explicit disable parameters.
export function buildThinkingParams({ mode, effort = '', on = false, budget = 0, dialect = 'generic' } = {}) {
  if (mode === 'default') return { params: {}, omitTemperature: false };
  const value = String(effort ?? '').trim().toLowerCase();
  const eff = ['low', 'medium', 'high', 'xhigh', 'max'].includes(value) ? value : '';
  switch (dialect) {
    case 'deepseek':
    case 'glm':
      return { params: { thinking: { type: on ? 'enabled' : 'disabled' } }, omitTemperature: on };
    case 'qwen': {
      const p = { enable_thinking: !!on };
      if (on && budget > 0) p.thinking_budget = budget;
      return { params: p, omitTemperature: false };
    }
    case 'openai-o': {
      const e = ['xhigh', 'max'].includes(eff) ? 'high' : eff || 'medium'; // xhigh/max 向下就近映射 high
      return { params: { reasoning_effort: on ? e : 'minimal' }, omitTemperature: true };
    }
    case 'xai':
      return { params: { reasoning_effort: on ? (eff || 'medium') : 'minimal' }, omitTemperature: false };
    case 'anthropic': {
      const p = { thinking: { type: on ? 'enabled' : 'disabled' } };
      if (on && budget > 0) p.thinking.budget_tokens = budget;
      return { params: p, omitTemperature: false };
    }
    case 'gemini':
      return { params: { extra_body: { google: { thinking_config: { thinking_budget: on ? (budget > 0 ? budget : -1) : 0 } } } }, omitTemperature: false };
    case 'openrouter':
      return { params: on ? { reasoning: budget > 0 ? { max_tokens: budget } : { effort: eff || 'medium' } } : { reasoning: { effort: 'minimal' } }, omitTemperature: false };
    case 'ollama':
      return { params: on ? { think: true } : {}, omitTemperature: false };
    default:
      return { params: {}, omitTemperature: false }; // generic/local-openai 不写任何思考参数
  }
}

export function looksLikeThinkingRejection(text) {
  const value = String(text ?? '');
  // Both boundaries matter: model names such as deepseek-thinking are not fields.
  const field = '(?<![-\\w])(?:thinking(?:[\\s_-]*budget)?|reasoning[\\s_-]*(?:effort|content)|enable[\\s_-]*thinking|budget[\\s_-]*tokens|include[\\s_-]*thoughts|extra[\\s_-]*body|think|思考)(?![-\\w])';
  const refusal = '(?:invalid|unknown|unrecognized|unsupported|not\\s+support(?:ed)?|unexpected|unused|未知|不支持|无效|无法识别|多余)';
  return new RegExp(`${field}[^。.\\n]{0,24}${refusal}|${refusal}[^。.\\n]{0,24}${field}`, 'i').test(value);
}


export function stripThinkingParams(body) {
  const stripped = { ...body };
  for (const key of ['thinking', 'enable_thinking', 'thinking_budget', 'reasoning_effort', 'extra_body', 'reasoning', 'think']) delete stripped[key];
  return stripped;
}

export const dialectProvider = Object.freeze({ detect: detectDialect, build: buildThinkingParams, looksLikeRejection: looksLikeThinkingRejection, strip: stripThinkingParams });
