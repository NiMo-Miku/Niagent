// media-tools：send_image（SPEC §8 T-26，notes/08 §6.26 全约束）。
// 图片读取与发送仅消费公共能力。

export default {
  setup(ctx) {
    const K = {
      cfg: () => ctx.capability('host.config').get(),
      get send() { return ctx.capability('core.send'); },
      get mediaReader() { return ctx.capability('media.reader'); },
    };

    ctx.registerTool({
      id: 'send_image', name: '发图片', category: 'media', icon: '🖼️', requiresVision: false,
      description: '把网上找到的图片发到当前聊天；默认要先预览确认再发。',
      params: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '图片直链（http/https）' },
          preview: { type: 'boolean', description: 'true = 只给自己看，不发' },
          note: { type: 'string', description: '配一句话一起发' },
          replyToMessageId: { type: ['integer', 'string'], description: '引用' },
          atUserId: { type: ['integer', 'string'], description: '@ 某人' },
        },
        required: ['url'],
      },
      scopes: ['qq.send', 'net.outbound'],
      execute: async (args, c) => {
        const url = String(args.url ?? '').trim();
        if (!url) return { ok: false, error: 'url 不能为空' };
        if (!/^https?:\/\//.test(url)) return { ok: false, error: '只支持 http(s) 图片直链。本地文件路径不能发（那会暴露宿主文件系统）。' };

        const cfgSec = K.cfg().security ?? {};
        const imgSec = cfgSec.imageSend ?? {};
        const st = c.session.sendImageState = c.session.sendImageState ?? { previewed: [], previews: 0, sent: 0 };
        const requirePreview = imgSec.requirePreview !== false;
        const maxPerRun = Math.max(1, Number(imgSec.maxPerRun) || 3);
        const maxPreviews = Math.max(1, Number(imgSec.maxPreviewsPerRun) || 5);
        const maxBytes = Math.max(1, Number(imgSec.maxBytesMB) || 5) * 1024 * 1024;
        const lock = cfgSec.browseLock ?? {};
        const locked = lock.enabled === true;
        const lockedHosts = lock.hosts ?? [];
        let requestedHost = '';
        try { requestedHost = new URL(url).hostname.toLowerCase(); } catch { return { ok: false, error: '图片 URL 不合法' }; }
        const hitLocked = locked && lockedHosts.some((h) => {
          const host = String(h ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
          return host && (requestedHost === host || requestedHost.endsWith(`.${host}`));
        });
        const skipPreview = hitLocked && imgSec.skipPreviewForLockedHosts !== false;
        if (args.preview !== true && requirePreview && !skipPreview && !st.previewed.includes(url)) {
          return { ok: false, error: '这张图还没有预览。请先调用 send_image({url, preview:true}) 确认内容，再发送。' };
        }
        const download = async () => {
          const reader = typeof K.mediaReader === 'function' ? K.mediaReader() : K.mediaReader;
          if (!reader) throw new Error('图片读取服务未装配');
          return reader.image({ url }, { maxBytes, signal: c.signal });
        };

        // 预览分支
        if (args.preview === true) {
          if (st.previews >= maxPreviews) {
            return { ok: false, error: `本次运行预览次数已达上限（${st.previews} 次）。挑最有把握的一张直接发。` };
          }
          st.previews += 1;
          try {
            const { dataUrl, mime, bytes } = await download();
            if (!st.previewed.includes(url)) st.previewed.push(url);
            const kb = Math.round(bytes / 1024);
            // 问能力 image.mime-support
            let supports = true;
            try { supports = (await ctx.capability('image.mime-support', mime)) !== false; } catch { supports = true; }
            if (!supports) {
              return { ok: true, result: `这张图是 ${mime}（约 ${kb} KB）。当前视觉接口不支持 ${mime}，看不到画面内容，但字节已校验过是真图。确认要发就再调 send_image(url)。`, mediaParts: [] };
            }
            return { ok: true, result: `预览 OK：${mime}，约 ${kb} KB。确认合适就调 send_image(url) 发送。`, mediaParts: [{ type: 'image_url', image_url: { url: dataUrl } }] };
          } catch (err) {
            const msg = String(err?.message ?? err);
            if (/404/.test(msg)) return { ok: false, error: `图片下载失败：${msg}（地址可能抄错了：请从 web_fetch / search_images 返回的 images 里原样复制，不要改动路径字符；也可能是图已删除）` };
            return { ok: false, error: `图片下载失败：${msg}` };
          }
        }

        // 发送分支
        if (st.sent + (st.sending ?? 0) >= maxPerRun) {
          return { ok: false, error: `本次运行已经发了 ${st.sent} 张图，达到上限（设置里可调）。` };
        }
        st.sending = (st.sending ?? 0) + 1;
        try {
          const { dataUrl, mime } = await download();
          if (!mime || !/^image\//.test(mime)) {
            return { ok: false, error: `这个地址返回的不是图片（Content-Type: ${mime ?? '未知'}）。只支持 png/jpg/gif/webp 直链。` };
          }
          const res = args.note
            ? await K.send.sendImage(c.chatKey, { url, dataUrl }, { note: args.note, replyToMessageId: args.replyToMessageId, atUserId: args.atUserId, signal: c.signal })
            : await K.send.sendImage(c.chatKey, { url, dataUrl }, { replyToMessageId: args.replyToMessageId, atUserId: args.atUserId, signal: c.signal });
          c.session.sent = c.session.sent ?? [];
          c.session.sent.push(...(res.sent ?? []));
          if (res.sent?.length) st.sent += 1;
          return { ok: Boolean(res.ok !== false), result: { sent: res.sent ?? [], failed: res.failed ?? [], note: args.note ? '备注已随图片发送' : null } };
        } catch (err) {
          return { ok: false, error: `错误：${err?.message ?? err}` };
        } finally { st.sending -= 1; }
      },
    });
  },
};
