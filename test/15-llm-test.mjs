// 15 · llm：isRetryableError 分类 / 候选降级 / 退避 / 思考方言 / 用量归一 / 降级重试
import { ok, eq, section, summary } from './helpers.mjs';
import { isRetryableError, addUsage, emptyUsage, cacheHitRate, detectDialect, buildThinkingParams, extractReasoning, extractReasoningTokens, specializedModelFor, chatCompletionWithRetry, resolveApiKey } from '../src/kernel/llm.js';

section('isRetryableError 分类（06c §3.4）');
ok(!isRetryableError(new Error('aborted')), 'abort 不重试');
ok(!isRetryableError(Object.assign(new Error('HTTP 401'), { status: 401 })), '401 不重试');
ok(!isRetryableError(Object.assign(new Error('HTTP 400'), { status: 400 })), '400 不重试');
ok(!isRetryableError(new Error('invalid api key')), 'invalid key 不重试');
ok(isRetryableError(Object.assign(new Error('HTTP 500'), { status: 500 })), '5xx 重试');
ok(isRetryableError(Object.assign(new Error('HTTP 429'), { status: 429 })), '429 重试');
ok(isRetryableError(new Error('请求超时')), '超时重试');
ok(isRetryableError(new Error('ECONNRESET')), '网络错误重试');
ok(!isRetryableError(new Error('随便什么错')), '未知错误不重试（兜底）');

section('addUsage（读 snake_case 写 camelCase；calls 不管——SUSPECT 复刻）');
const u = emptyUsage();
addUsage(u, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, prompt_tokens_details: { cached_tokens: 30 } });
eq(u.promptTokens, 100, 'promptTokens');
eq(u.completionTokens, 50, 'completionTokens');
eq(u.totalTokens, 150, 'totalTokens');
eq(u.cachedTokens, 30, 'cachedTokens');
eq(u.calls, 0, 'addUsage 不累加 calls（由 runner 手动 +1）');
addUsage(u, { prompt_tokens: 10 });
eq(u.promptTokens, 110, '累加');
const u2 = emptyUsage();
addUsage(u2, { prompt_tokens: 5, completion_tokens: 3 }); // 无 total_tokens
eq(u2.totalTokens, 8, 'total 缺失时 = prompt+completion');
eq(cacheHitRate(u), 30 / 110, 'cacheHitRate');
eq(cacheHitRate(emptyUsage()), 0, '除零保护');

section('detectDialect（host 优先，再 model）');
eq(detectDialect('https://api.deepseek.com', 'x'), 'deepseek', 'deepseek host');
eq(detectDialect('https://api.openai.com', 'o3-mini'), 'openai-o', 'openai o 系');
eq(detectDialect('https://x.com', 'grok-4'), 'xai', 'xai');
eq(detectDialect('https://generativelanguage.googleapis.com', 'gemini-2'), 'gemini', 'gemini');
eq(detectDialect('https://openrouter.ai/api', 'any'), 'openrouter', 'openrouter');
eq(detectDialect('http://127.0.0.1:8787', 'hy4'), 'local-openai', '本地端点');
eq(detectDialect('https://unknown.host', 'unknown-model'), 'generic', 'generic 兜底');

section('buildThinkingParams 方言表（06c §3.6 逐条）');
eq(buildThinkingParams({ on: true, dialect: 'deepseek' }).params, { thinking: { type: 'enabled' } }, 'deepseek 开启');
eq(buildThinkingParams({ on: false, dialect: 'deepseek' }).params, { thinking: { type: 'disabled' } }, 'deepseek 关闭');
eq(buildThinkingParams({ on: true, dialect: 'deepseek' }).omitTemperature, true, 'deepseek 与 temperature 互斥');
eq(buildThinkingParams({ on: true, dialect: 'qwen' }).params, { enable_thinking: true }, 'qwen');
eq(buildThinkingParams({ on: true, dialect: 'qwen', budget: 100 }).params.thinking_budget, 100, 'qwen budget');
eq(buildThinkingParams({ on: true, dialect: 'openai-o', effort: 'xhigh' }).params.reasoning_effort, 'high', 'xhigh → high 向下映射');
eq(buildThinkingParams({ on: true, dialect: 'anthropic', budget: 5 }).params.thinking.budget_tokens, 5, 'anthropic budget');
eq(buildThinkingParams({ on: true, dialect: 'gemini' }).params.extra_body.google.thinking_config.thinking_budget, -1, 'gemini 开启 -1');
eq(buildThinkingParams({ on: false, dialect: 'gemini' }).params.extra_body.google.thinking_config.thinking_budget, 0, 'gemini 关闭 0');
eq(buildThinkingParams({ on: true, dialect: 'openrouter', budget: 7 }).params.reasoning.max_tokens, 7, 'openrouter budget');
eq(buildThinkingParams({ on: true, dialect: 'ollama' }).params, { think: true }, 'ollama');
eq(buildThinkingParams({ on: true, dialect: 'generic' }).params, {}, 'generic 不写参数');

section('extractReasoning / reasoning tokens');
eq(extractReasoning({ reasoning_content: 'R1' }), 'R1', 'reasoning_content 优先');
eq(extractReasoning({ reasoning: 'R2' }), 'R2', 'reasoning');
eq(extractReasoning({ content: [{ type: 'thinking', text: 'R3' }] }), 'R3', 'content 数组部件');
eq(extractReasoning({ content: 'plain' }), null, '无思考内容');
eq(extractReasoningTokens({ completion_tokens_details: { reasoning_tokens: 88 } }), 88, 'reasoning_tokens');
eq(extractReasoningTokens({}), 0, '缺省 0');

section('specializedModelFor（视频优先于图片）');
const api = { visionModel: 'vm', videoModel: 'vidm' };
eq(specializedModelFor([{ content: [{ type: 'image_url' }] }], api), 'vm', '图片 → visionModel');
eq(specializedModelFor([{ content: [{ type: 'video_url' }] }], api), 'vidm', '视频 → videoModel（优先）');
eq(specializedModelFor([{ content: [{ type: 'text', text: 'x' }] }], api), null, '纯文本不切');

section('resolveApiKey（配置驱动，dshProviderKeys 优先）');
eq(resolveApiKey({ api: { provider: 'p1', apiKey: 'direct' }, dshProviderKeys: { p1: 'fromdsh' }, providers: [] }), 'fromdsh', 'dsh keys 优先');
eq(resolveApiKey({ api: { provider: 'p1', apiKey: 'direct' }, dshProviderKeys: { p1: '******' }, providers: [{ id: 'p1', apiKey: 'pkey' }] }), 'pkey', '掩码跳过 → providers');
eq(resolveApiKey({ api: { apiKey: 'k' } }), 'k', '无 provider 用 apiKey');
eq(resolveApiKey({ api: { apiKey: '******' } }), '', '掩码 → 空串');

section('chatCompletionWithRetry：主模型失败 → 降级 fallback（mock fetch）');
let callCount = 0;
const fakeFetch = async (url, opts) => {
  callCount++;
  const body = JSON.parse(opts.body);
  if (body.model === 'main') {
    return { ok: false, status: 500, text: async () => 'boom', headers: new Map() };
  }
  return {
    ok: true, status: 200, headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({
      model: body.model, choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  };
};
const cfgMain = {
  api: { baseUrl: 'https://x', apiKey: 'k', model: 'main', timeoutMs: 5000, temperature: 0.8, thinkingMode: 'off', fallbackModels: [{ model: 'backup' }] },
};
const t0 = Date.now();
const res = await chatCompletionWithRetry({ messages: [{ role: 'user', content: 'x' }], cfg: cfgMain, fetchFn: fakeFetch }, 2);
ok(res.message.content === 'hi', '降级成功拿到响应');
eq(res._usedModel, 'backup', '_usedModel = 实际成功模型');
ok(Date.now() - t0 >= 3000, '主模型 2 次退避（1s+2s）后才降级');

section('abort 立即中断（不重试）');
const ctrl = new AbortController();
ctrl.abort(new Error('用户中止'));
let threw = false;
try { await chatCompletionWithRetry({ messages: [], cfg: cfgMain, fetchFn: fakeFetch, signal: ctrl.signal }, 2); }
catch { threw = true; }
ok(threw, 'abort 后抛错');

summary('15-llm');
