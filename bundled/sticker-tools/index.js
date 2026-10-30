// sticker-tools：表情工具（SPEC §8 T-03/T-05/T-06/T-07 + send_sticker）。
// 仅消费表情、存档、发送与媒体公共能力。
//
// 默认读取本地表情库；远端账号收藏需要独立插件提供可选能力。
export default {
  setup(ctx) {
    const K = {
      get stickers() { return ctx.capability('data.stickers'); },
      get store() { return ctx.capability('data.messages'); },
      get send() { return ctx.capability('core.send'); },
      get mediaReader() { return ctx.capability('media.reader'); },
    };

    // list_stickers
    ctx.registerTool({
      id: 'list_stickers', name: '查表情库', category: 'sticker',
      description: '查看本地表情库；安装相应能力插件时也可同步账号收藏。',
      params: { type: 'object', properties: { query: { type: 'string', description: '匹配备注/本地笔记/标签' }, limit: { type: 'number', description: '条数（默认 24，最大 100）' } }, required: [] },
      scopes: [],
      execute: async (args, c) => {
        const sync = await K.stickers.syncFromQQ?.({ signal: c?.signal });
        const query = String(args.query ?? '').trim().toLowerCase();
        const all = K.stickers.all();
        const filtered = query ? all.filter((s) => `${s.desc} ${s.localNote} ${(s.tags ?? []).join(' ')}`.toLowerCase().includes(query)) : all;
        const list = filtered.slice(0, Math.max(1, Math.min(100, Number(args.limit) || 24)));
        return { ok: true, result: { items: list.map((s) => ({ id: s.id, desc: s.desc, localNote: s.localNote, tags: s.tags, useCount: s.useCount, inQQ: Boolean(s.emojiId) })),
          ...(sync?.degraded ? { sync: { fromCache: true, degraded: true, code: sync.code, error: sync.error } } : {}) } };
      },
    });

    // get_sticker_image
    ctx.registerTool({
      id: 'get_sticker_image', name: '看表情图', category: 'sticker', requiresVision: true,
      description: '查看某张表情图的内容。',
      params: { type: 'object', properties: { stickerId: { type: 'string', description: '表情 id' } }, required: ['stickerId'] },
      scopes: [],
      execute: async (args, c) => {
        const s = K.stickers.get(args.stickerId);
        if (!s) return { ok: false, error: `找不到表情 ${args.stickerId}，请先用 list_stickers 获取有效 id` };
        if (!s.url && !s.localFile) return { ok: false, error: `表情 ${s.id} 没有图片地址` };
        const reader = typeof K.mediaReader === 'function' ? K.mediaReader() : K.mediaReader;
        if (!reader) return { ok: false, error: '图片读取服务未装配' };
        try {
          const source = await K.stickers.ensureSendable(s, { signal: c?.signal });
          const data = await reader.imageParts({ localFile: source.localPath, file: source.fileId, url: source.url }, { signal: c?.signal, localRoots: [K.stickers.imagesDir] });
          return { ok: true, result: `表情 ${s.id}${data.converted === 'gif-video' ? '（GIF 动图已转为视频片段）' : data.converted === 'gif-first-frame' ? '（GIF 仅显示首帧）' : ''}`, mediaParts: data.parts };
        } catch (err) { return { ok: false, error: `表情读取失败：${err?.message ?? err}` }; }
      },
    });

    // collect_sticker（收藏到 QQ 账号表情包 + 同时写备注）
    ctx.registerTool({
      id: 'collect_sticker', name: '收藏表情', category: 'sticker',
      requires: ['qq.emoji-favorites'],
      description: '通过已安装的账号收藏能力插件保存消息图片并写备注。需要 qq.emoji-favorites 能力；远端收藏上限或写入错误会导致失败。',
      params: {
        type: 'object',
        properties: {
          messageId: { type: ['number', 'string'], description: '消息 id' },
          note: { type: 'string', description: '备注（如"好图偷了，兄弟"）' },
        },
        required: ['messageId'],
      },
      scopes: [],
      execute: async (args, c) => {
        const m = K.store.findByMid(c.chatKey, Number(args.messageId));
        if (!m) {
          const recent = K.store.recent(c.chatKey, 20).filter((x) => x.mid != null).slice(-8);
          const hint = recent.length ? `（最近可见的 #id：${recent.map((x) => `#${x.mid}`).join('、')}）` : '';
          return { ok: false, error: `在当前会话找不到消息 ${args.messageId}。${hint}` };
        }
        const images = (m.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'face');
        if (images.length === 0) return { ok: false, error: '这条消息里没有图片/表情' };
        const img = images[0];
        const note = String(args.note ?? '').slice(0, 300);

        // 写入 QQ 表情库：先拿 emoji_id，再写备注；任一步失败都不落本地索引
        const res = await K.stickers.collectIntoQQ({ file: img.url || img.file, media: img, desc: note, source: 'qq', signal: c.signal });
        if (!res.ok) {
          // 上限 / 协议端失败都算收藏失败——明确的失败比假成功好
          return { ok: false, error: res.error, code: res.code };
        }
        if (res.noted === false && note) {
          return { ok: false, code: 'QQ_EMOJI_NOTE_FAILED',
            error: `已收藏进 QQ 表情包（${res.entry.id}），但备注写入失败——QQ 侧表情可能没有备注。` };
        }
        return { ok: true, result: { id: res.entry.id, emojiId: res.entry.emojiId, noted: res.noted, ...(res.indexFailed ? { indexFailed: res.indexFailed } : {}) } };
      },
    });

    // send_sticker（T-03：一张表情单独发，不带文字）
    ctx.registerTool({
      id: 'send_sticker', name: '发表情', category: 'messaging',
      description: '发一张表情（一条消息只能是一张表情，不能附带文字；想说的话先用 send_message 单独发）。',
      params: {
        type: 'object',
        properties: {
          stickerId: { type: 'string', description: '表情 id（list_stickers 查询）' },
          atUserId: { type: 'string', description: '要 @ 的 QQ 号（可省）' },
          replyToMessageId: { type: 'string', description: '要引用的消息 id（可省）' },
        },
        required: ['stickerId'],
      },
      scopes: ['qq.send'],
      execute: async (args, c) => {
        const s = K.stickers.get(args.stickerId);
        if (!s) return { ok: false, error: `找不到表情 ${args.stickerId}，请先用 list_stickers 获取有效 id` };
        if (!s.url && !s.localFile) return { ok: false, error: `表情 ${s.id} 没有可发送的图片地址` };
        let res;
        try {
          const source = await K.stickers.ensureSendable(s, { signal: c.signal });
          res = await K.send.sendSticker(c.chatKey, source, { atUserId: args.atUserId, replyToMessageId: args.replyToMessageId, signal: c.signal });
        } catch (err) { return { ok: false, error: `表情发送失败：${err?.message ?? err}` }; }
        c.session.sent = c.session.sent ?? [];
        c.session.sent.push(...(res.sent ?? []));
        if (res.sent?.length) K.stickers.markUsed(s.id, `发给 ${c.chatKey}`);
        return { ok: res.ok !== false, result: res.deduped ? res.note : `已发送表情 ${s.id}`, ...(res.ok === false ? { error: res.failed?.[0]?.error ?? '表情发送失败' } : {}) };
      },
    });
  },
};
