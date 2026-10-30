// web-tools：3 个联网工具（SPEC §8 T-19/T-20/T-27；全部经 safe-fetch 逐跳校验）。
// 默认搜索服务随插件注册和撤销，网络只走公共 HTTP 门。
import { createWebSearch, createImageSearch, normalizeImageResults } from './service.js';

export default {
  setup(ctx) {
    const cfg = () => ctx.capability('host.config').get();
    ctx.registerCapability('web.search', createWebSearch({ cfg, http: ctx.http, log: ctx.log }), { default: true });
    ctx.registerCapability('web.images', createImageSearch({ cfg, http: ctx.http }), { default: true });
    const K = { cfg, get webSearch() { return ctx.capability('web.search'); } };

    // T-19 web_search
    ctx.registerTool({
      id: 'web_search', name: '联网搜索', category: 'web', icon: '🔍', requiresSearch: true,
      description: '联网搜索（默认 Bing），返回标题/URL/摘要；查实时信息、梗含义等。',
      params: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] },
      scopes: ['net.outbound'],
      execute: async (args, context) => {
        const q = String(args.query ?? '').trim();
        if (!q) return { ok: false, error: '搜索关键词不能为空' };
        try {
          const res = await K.webSearch.search(q, { signal: context?.signal });
          return { ok: true, result: res };
        } catch (err) {
          return { ok: false, error: `搜索失败：${err?.message ?? err}` };
        }
      },
    });

    // T-20 web_fetch（≤2 万字符）
    ctx.registerTool({
      id: 'web_fetch', name: '读网页', category: 'web', icon: '📄', requiresSearch: true,
      description: '只读抓取网页正文（≤2 万字符）。',
      params: { type: 'object', properties: { url: { type: 'string', description: '网页地址' } }, required: ['url'] },
      scopes: ['net.outbound'],
      execute: async (args, context) => {
        const url = String(args.url ?? '').trim();
        if (!url) return { ok: false, error: 'url 不能为空' };
        try {
          const res = await K.webSearch.fetchPage(url, { signal: context?.signal });
          return { ok: true, result: res };
        } catch (err) {
          return { ok: false, error: `抓取失败：${err?.message ?? err}` };
        }
      },
    });

    // T-27 search_images（配 send_image）
    ctx.registerTool({
      id: 'search_images', name: '搜图片', category: 'web', icon: '🔎', requiresSearch: true, requiresVision: false,
      description: '搜网图并给出能直接发的图片直链（配合 send_image）。',
      params: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '条数（默认 8，最多 12）' },
        },
        required: ['query'],
      },
      scopes: ['net.outbound'],
      execute: async (args, context) => {
        const q = String(args.query ?? '').trim();
        if (!q) return { ok: false, error: 'query 不能为空' };
        const limit = Math.min(12, Math.max(1, Number(args.limit) || 8));
        try {
          const provider = ctx.capability('web.images');
          if (typeof provider?.search !== 'function') throw new Error('图搜能力未就绪');
          // The public SDK exposes this provider object, not a registry epoch.
          // Reject a completion if the selected object or search method changed.
          const search = provider.search;
          const result = await search.call(provider, q, { limit, signal: context?.signal });
          if (context?.signal?.aborted) throw context.signal.reason ?? new Error('图搜已中止');
          const current = ctx.capability('web.images');
          if (current !== provider || current?.search !== search) throw new Error('图搜提供者已切换，旧结果已丢弃');
          if (!result || !Array.isArray(result.results)) throw new Error('图搜提供者返回格式不正确');
          return { ok: true, result: { ...result, query: q, results: normalizeImageResults(result.results, limit), note: result.note ?? '用 send_image 发送；先 preview=true 预览更稳妥' } };
        } catch (error) {
          return { ok: false, error: '错误：' + (error?.message ?? error) };
        }
      },
    });
  },
};
