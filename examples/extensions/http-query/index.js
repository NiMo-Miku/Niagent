class QueryError extends Error {}

function endpointFrom(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new QueryError('请先配置完整的 HTTPS 查询地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new QueryError('查询地址须使用 HTTPS，且不能含用户名、密码或片段');
  return url.href;
}

function deadline(signals, timeoutMs) {
  const controller = new AbortController();
  const cleanup = [];
  for (const signal of signals.filter(Boolean)) {
    const cancel = () => controller.abort(new Error('操作已取消'));
    if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    cleanup.push(() => signal.removeEventListener('abort', cancel));
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error('请求超时')); }, timeoutMs);
  return { signal: controller.signal, get timedOut() { return timedOut; }, dispose() { clearTimeout(timer); cleanup.forEach(fn => fn()); } };
}

export default {
  setup(ctx) {
    ctx.registerTool({
      name: 'query', category: 'utility', scopes: ['net.outbound'],
      description: '向用户配置的服务提交查询，返回服务的 answer 文本，不直接发送消息。',
      params: {
        type: 'object', additionalProperties: false,
        properties: { query: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['query'],
      },
      async handler({ query }, execution) {
        const endpoint = endpointFrom(ctx.config.get('endpoint'));
        const token = ctx.config.get('token') || '';
        const timeoutMs = ctx.config.get('timeoutMs') ?? 15000;
        if (typeof token !== 'string' || /[\r\n]/.test(token)) throw new QueryError('服务令牌配置无效');
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 20000) throw new QueryError('请求超时须为 1000 到 20000 的整数毫秒');
        if (typeof query !== 'string' || !query.trim() || query.length > 1000) throw new QueryError('查询内容须为 1 到 1000 字的非空文本');
        const operation = deadline([execution.signal, ctx.lifecycle.signal], timeoutMs);
        try {
          const response = await ctx.http.fetch(endpoint, {
            method: 'POST', redirect: 'manual',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ query: query.trim() }), signal: operation.signal,
            timeoutMs, maxBytes: 64 * 1024,
          });
          if (operation.signal.aborted) throw new QueryError('操作已取消');
          if (!response.ok) throw new QueryError(`查询服务返回 HTTP ${response.status}；请检查地址、令牌和服务状态`);
          if (response.truncated) throw new QueryError('查询响应超过 64 KiB 上限');
          let body;
          try { body = await response.json(); } catch { throw new QueryError('查询服务未返回有效 JSON'); }
          if (operation.signal.aborted) throw new QueryError('操作已取消');
          if (typeof body?.answer !== 'string' || !body.answer.trim() || body.answer.length > 4000) throw new QueryError('查询响应须包含 1 到 4000 字的 answer 文本');
          return body.answer.trim();
        } catch (error) {
          if (execution.signal?.aborted || ctx.lifecycle.signal.aborted) throw new QueryError('操作已取消');
          if (operation.timedOut) throw new QueryError('查询请求超时，请稍后手动重试');
          if (error instanceof QueryError) throw error;
          // 不把上游响应正文、请求头、完整 URL 或底层错误中的令牌回显给模型。
          throw new QueryError('查询请求失败，请检查网络和服务配置');
        } finally { operation.dispose(); }
      },
    });
    ctx.log.info('HTTP 查询范例已注册');
  },
};
