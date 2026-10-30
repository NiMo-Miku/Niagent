import { ok, eq, section, summary } from './helpers.mjs';
import { createCompatApi, adaptLegacySkill } from '../bundled/compat-04/index.js';

const calls = [];
const ctx = {
  id: 'legacy',
  config: { all: () => ({ answer: 42 }) },
  log: { info: (...a) => calls.push(['info', ...a]), warn: (...a) => calls.push(['warn', ...a]), error: (...a) => calls.push(['error', ...a]) },
  registerTool(def) { calls.push(['tool', def.id]); return `legacy__${def.id}`; },
  capability: (name) => ({ demo: 'yes', 'extensions.state': { isActive: (id) => id === 'other' }, 'compat04.http': { fetchFor: async () => new Response('ok', { status: 200 }) } })[name],
  hasCapability: (name) => name === 'demo',
};

section('0.4 API 映射');
const api = createCompatApi(ctx, { id: 'legacy', settings: { answer: 1 } });
eq(api.config().answer, 42, 'config 映射');
eq(api.isSkillActive('other'), true, 'isSkillActive 映射');
eq(api.capability('demo'), 'yes', 'capability 映射');
eq(api.hasCapability('missing'), false, 'hasCapability 映射');
api.log('值=%s', 7); ok(calls.some((x) => x.join(' ').includes('值=7')), '日志先 util.format');

section('register/setup/hooks/providers/activate');
const result = await adaptLegacySkill(ctx, {
  setup(old) { old.registerTool({ id: 'ping', name: 'Ping', handler: () => 'pong' }); },
}, { id: 'legacy' });
eq(result.toolIds, ['legacy__ping'], '旧 handler 注册并得到新工具 id');

section('web_fetch 仅 net.outbound');
const noNet = createCompatApi(ctx, { id: 'no-net', permissions: [] });
let rejected = false; try { await noNet.fetch('http://127.0.0.1/'); } catch { rejected = true; }
eq(rejected, true, '未声明网络权限时 fetch 拒绝');
const withNet = createCompatApi(ctx, { id: 'net', permissions: ['net.outbound'] });
eq(typeof withNet.fetch, 'function', '声明 net.outbound 提供 fetch 兼容面');
const legacyWebFetch = createCompatApi(ctx, { id: 'legacy-web', permissions: ['web_fetch'] });
eq(typeof legacyWebFetch.fetch, 'function', '旧 web_fetch 映射到受控 fetch');

section('工具辅助函数');
eq(api.utils.safeJsonParse('{"a":1}').a, 1, 'safeJsonParse 成功');
eq(api.utils.safeJsonParse('bad', 'fallback'), 'fallback', 'safeJsonParse 失败回退');

summary('43-compat-04');
