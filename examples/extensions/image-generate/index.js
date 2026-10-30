class ImageError extends Error {}
const MAX_PNG_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function endpointFrom(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new ImageError('请先配置完整的 HTTPS 图片生成地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new ImageError('图片地址须使用 HTTPS，且不能含用户名、密码或片段');
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

function pngDataUrl(value) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ImageError('图片服务未返回有效的 PNG base64，或图片超过 5 MiB');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_PNG_BYTES || bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('base64') !== value) {
    throw new ImageError('图片服务返回的内容不是约定的 PNG base64');
  }
  return `data:image/png;base64,${value}`;
}

export default {
  setup(ctx) {
    ctx.registerTool({
      name: 'draw', category: 'media', scopes: ['net.outbound', 'qq.send'],
      description: '根据 prompt 生成一张 PNG 并直接发送到当前聊天。完成后不要重复发送说明。',
      params: {
        type: 'object', additionalProperties: false,
        properties: { prompt: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['prompt'],
      },
      async handler({ prompt }, execution) {
        if (!execution.chatKey) throw new ImageError('此工具需要当前聊天，请从聊天中调用');
        const endpoint = endpointFrom(ctx.config.get('endpoint'));
        const apiKey = ctx.config.get('apiKey');
        const model = ctx.config.get('model');
        const timeoutMs = ctx.config.get('timeoutMs') ?? 20000;
        if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new ImageError('请先配置有效的图片服务密钥');
        if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new ImageError('请先配置有效的模型 ID');
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 20000) throw new ImageError('请求超时须为 1000 到 20000 的整数毫秒');
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new ImageError('图片描述须为 1 到 2000 字的非空文本');
        const operation = deadline([execution.signal, ctx.lifecycle.signal], timeoutMs);
        let phase = 'generation';
        try {
          const response = await ctx.http.fetch(endpoint, {
            method: 'POST', redirect: 'manual',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: model.trim(), prompt: prompt.trim(), response_format: 'b64_json' }),
            signal: operation.signal, timeoutMs, maxBytes: 8 * 1024 * 1024,
          });
          if (operation.signal.aborted) throw new ImageError('操作已取消');
          if (!response.ok) throw new ImageError(`图片服务返回 HTTP ${response.status}；请检查地址、密钥、模型和服务状态`);
          if (response.truncated) throw new ImageError('图片响应超过 8 MiB 上限');
          let body;
          try { body = await response.json(); } catch { throw new ImageError('图片服务未返回有效 JSON'); }
          const dataUrl = pngDataUrl(body?.data?.[0]?.b64_json);
          if (operation.signal.aborted) throw new ImageError('操作已取消');

          phase = 'delivery';
          // execution.send 是受控 core.send facade；发送受 qq.send 和当前实例取消约束。
          const receipt = await execution.send.sendImage(execution.chatKey, { dataUrl }, { signal: operation.signal });
          if (operation.signal.aborted) throw new ImageError('操作已取消');
          if (receipt?.ok !== true) throw new ImageError('未获得图片发送成功回执，请检查连接后手动确认；不要自动重发');
          if (receipt.deduped === true && Array.isArray(receipt.sent) && receipt.sent.length === 0) {
            return { sent: false, deduped: true, text: '相同图片刚刚发送过，宿主已去重，本次没有新增发送。' };
          }
          if (!Array.isArray(receipt.sent) || receipt.sent.length === 0) throw new ImageError('图片发送回执不完整，请手动确认聊天中是否收到；不要自动重发');
          return { sent: true, messageIds: receipt.sent.map(item => item.msgId).filter(id => id != null), text: '图片已通过宿主发送队列确认发送，请勿重复发送说明。' };
        } catch (error) {
          if (execution.signal?.aborted || ctx.lifecycle.signal.aborted) throw new ImageError('操作已取消；发送阶段若已开始，请先检查聊天记录');
          if (operation.timedOut) throw new ImageError(phase === 'delivery' ? '图片发送等待超时，请先检查聊天记录，不要自动重发' : '图片生成请求超时，请稍后手动重试');
          if (error instanceof ImageError) throw error;
          throw new ImageError(phase === 'delivery' ? '图片发送未完成，请检查授权和连接，并先确认聊天记录；不要自动重发' : '图片生成请求失败，请检查网络和服务配置');
        } finally { operation.dispose(); }
      },
    });
    ctx.log.info('文生图范例已注册');
  },
};
