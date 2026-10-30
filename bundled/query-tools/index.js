// query-tools：7 个查询类工具（SPEC §8 T-09~T-15/T-28 归一）。
// 存档、传输动作与媒体读取均通过公共能力消费。
export default {
  setup(ctx) {
    const K = {
      get store() { return ctx.capability('data.messages'); },
      get mediaReader() { return ctx.capability('media.reader'); },
    };
    const limitOf = (value, fallback, max) => Math.max(1, Math.min(max, Number.isFinite(Number(value)) && value != null ? Math.floor(Number(value)) : fallback));
    const offsetOf = (value) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0));

    const findByMid = (chatKey, mid, session) => {
      const m = K.store.findByMid(chatKey, mid, { forContext: true, contextSessionId: session?.id });
      return m ?? null;
    };
    const midHint = (chatKey) => {
      const recent = K.store.recent(chatKey, 20, { forContext: true }).filter((m) => m.mid != null).slice(-8);
      if (recent.length === 0) return '';
      return `（最近可见的 #id：${recent.map((m) => `#${m.mid}`).join('、')}）`;
    };

    // T-09 get_recent_messages
    ctx.registerTool({
      id: 'get_recent_messages', name: '查最近消息', category: 'query',
      description: '查看当前会话的最近消息（比【已读信息】更新的或更老的）。',
      params: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '条数（默认 30，范围 1~100）' },
          offset: { type: 'number', description: '从最近消息向前跳过的条数，另会跳过本轮已放入提示词的历史消息（默认 0）' },
          count: { type: 'number', description: '兼容旧调用的条数；优先使用 limit' },
          beforeId: { type: 'number', description: '只看这条本地 id 之前的' },
        },
        required: [],
      },
      scopes: ['data.sessions.read'],
      execute: async (args, c) => {
        const n = limitOf(args.limit ?? args.count, 30, 100);
        const offset = Math.min(Number.MAX_SAFE_INTEGER, offsetOf(args.offset) + offsetOf(c.session?.pastStateCount));
        const all = K.store.recent(c.chatKey, args.beforeId == null ? n + offset : Infinity, { forContext: true, contextSessionId: c.session?.id });
        let list = all;
        if (args.beforeId != null) list = list.filter((m) => m.id < Number(args.beforeId));
        const end = Math.max(0, list.length - offset);
        list = list.slice(Math.max(0, end - n), end);
        return { ok: true, result: { count: list.length, messages: list.map((m) => ({ messageId: m.mid ?? m.id, time: m.ts ?? m.time ?? null, sender: `${m.senderName ?? ''}(QQ:${m.senderId ?? ''})`, senderId: String(m.senderId ?? ''), text: String(m.text ?? '') })) } };
      },
    });

    // T-10 read_forward：展开合并转发（get_forward_msg 只认 message_id，res_id 会过期）
    ctx.registerTool({
      id: 'read_forward', name: '展开合并转发', category: 'query',
      description: '展开合并转发聊天记录的全文。',
      params: { type: 'object', properties: { messageId: { type: ['number', 'string'], description: '消息 id（#数字）' } }, required: ['messageId'] },
      scopes: [],
      execute: async (args, c) => {
        const mid = Number(args.messageId);
        const m = findByMid(c.chatKey, mid, c.session);
        if (!m) return { ok: false, error: `当前会话找不到消息 ${args.messageId}。${midHint(c.chatKey)}` };
        const archivedResult = (message, note) => ({ ok: true, result: {
          messageId: message.mid ?? mid,
          text: String(message.text ?? ''),
          images: (message.media ?? []).filter((item) => (item.kind ?? item.type) === 'image').length,
          count: Number(/^\[合并转发 共(\d+)条\]/.exec(message.text)?.[1]) || 0,
          ...(note ? { note } : {}),
        } });
        if (String(m.text).startsWith('[合并转发 共')) return archivedResult(m, '该转发已展开（读的是存档）');
        const getForward = ctx.capability('transport.actions')?.getForward;
        if (typeof getForward !== 'function') return { ok: false, error: '当前传输提供者不支持展开合并转发' };
        let res;
        try { res = await getForward(mid); }
        catch (err) { return { ok: false, error: `展开失败：${err?.message ?? err}` }; }
        const current = findByMid(c.chatKey, mid, c.session);
        if (!current) return { ok: false, error: '展开失败：原消息已从存档移除' };
        if (String(current.text).startsWith('[合并转发 共')) return archivedResult(current, '该转发已展开（读的是存档）');
        const nodes = res?.messages ?? res?.nodes ?? [];
        if (!Array.isArray(nodes) || nodes.length === 0) return { ok: false, error: '展开失败：转发内容为空或已被 QQ 服务端丢弃（发送时间太久）' };
        const texts = [];
        const images = [];
        const cap = 30, maxChars = 3000;
        let usedChars = 0;
        for (const node of nodes.slice(0, cap)) {
          const sender = node?.sender?.nickname ?? node?.sender?.card ?? String(node?.user_id ?? '');
          const raw = node?.message ?? node?.content;
          const nodeImages = [];
          const content = (Array.isArray(raw) ? raw : [raw]).map((segment) => {
            if (typeof segment === 'string') return segment;
            if (segment?.type === 'text') return String(segment.data?.text ?? segment.text ?? '');
            if (segment?.type === 'image') {
              nodeImages.push({ kind: 'image', url: segment.data?.url ?? segment.url, file: segment.data?.file ?? segment.file });
              return '[图片]';
            }
            return segment?.type ? `[${segment.type}]` : '';
          }).join('');
          if (!content.trim()) continue;
          const line = `${sender}：${content}`;
          const remaining = maxChars - usedChars;
          if (remaining <= 0) break;
          texts.push(line.slice(0, remaining));
          usedChars += Math.min(line.length, remaining);
          images.push(...nodeImages);
        }
        if (texts.length === 0) return { ok: false, error: '展开失败：转发内容为空或已被 QQ 服务端丢弃（发送时间太久）' };
        const tail = nodes.length > cap ? `\n…（还有 ${nodes.length - cap} 条未展开）` : '';
        const text = texts.join('\n') + tail;
        // 回写存档（幂等）
        const updated = K.store.updateByMid(c.chatKey, mid, { text: `[合并转发 共${nodes.length}条]\n${text}`, media: [...(current.media ?? []), ...images] });
        return archivedResult(updated);
      },
    });

    // T-11 get_active_members
    ctx.registerTool({
      id: 'get_active_members', name: '查活跃成员', category: 'query',
      description: '看最近谁在群里说话（发言数排行）。',
      params: { type: 'object', properties: { days: { type: 'number', description: '统计最近几天（默认 7）' }, limit: { type: 'number', description: '人数（默认 10，范围 1~20）' } }, required: [] },
      scopes: [],
      execute: async (args, c) => {
        const days = Math.max(1, Number(args.days) || 7);
        const cutoff = Date.now() - days * 86400_000;
        const msgs = K.store.recent(c.chatKey, 500, { forContext: true, contextSessionId: c.session?.id }).filter((m) => !m.self && m.ts >= cutoff);
        const members = new Map();
        for (const m of msgs) {
          const userId = String(m.senderId ?? '');
          const current = members.get(userId) ?? { userId, name: String(m.senderName ?? ''), lastSeen: 0, recentCount: 0 };
          current.name = String(m.senderName ?? current.name);
          current.lastSeen = Math.max(Number(current.lastSeen) || 0, Number(m.ts) || 0);
          current.recentCount += 1;
          members.set(userId, current);
        }
        const sorted = [...members.values()].sort((a, b) => b.recentCount - a.recentCount).slice(0, limitOf(args.limit, 10, 20));
        return { ok: true, result: { days, total: msgs.length, members: sorted } };
      },
    });

    // T-12 get_chats
    ctx.registerTool({
      id: 'get_chats', name: '查会话列表', category: 'query',
      description: '列出我参与的所有群/私聊会话（含未读数与最近一条），跨会话发送前用它查目标。',
      params: { type: 'object', properties: { limit: { type: 'number', description: '会话数（默认 20，范围 1~50）' } }, required: [] },
      scopes: [],
      execute: async (args, c) => {
        const chats = K.store.listChats({ forContext: true, contextSessionId: c.session?.id }).sort((a, b) => b.lastActive - a.lastActive)
          .slice(0, limitOf(args.limit, 20, 50)).map((chat) => ({ ...chat, recentText: String(chat.recentText ?? chat.lastText ?? '').slice(0, 30) }));
        return { ok: true, result: { count: chats.length, chats } };
      },
    });

    // T-13 get_message_detail
    ctx.registerTool({
      id: 'get_message_detail', name: '查消息详情', category: 'query',
      description: '按消息 id 查一条消息的完整内容（含媒体与引用）。',
      params: { type: 'object', properties: { messageId: { type: ['number', 'string'], description: '消息 id' } }, required: ['messageId'] },
      scopes: [],
      execute: async (args, c) => {
        const m = findByMid(c.chatKey, Number(args.messageId), c.session);
        if (!m) return { ok: false, error: `当前会话找不到消息 ${args.messageId}。${midHint(c.chatKey)}` };
        return { ok: true, result: m };
      },
    });

    // T-14 get_message_images（vision 能力门）
    ctx.registerTool({
      id: 'get_message_images', name: '看图', category: 'query', requiresVision: true,
      description: '查看消息里的图片内容（你能直接看懂）。',
      params: { type: 'object', properties: { messageId: { type: ['number', 'string'], description: '消息 id' } }, required: ['messageId'] },
      scopes: [],
      execute: async (args, c) => {
        const m = findByMid(c.chatKey, Number(args.messageId), c.session);
        if (!m) return { ok: false, error: `当前会话找不到消息 ${args.messageId}。${midHint(c.chatKey)}` };
        const images = (m.media ?? []).filter((x) => x.kind === 'image');
        if (images.length === 0) return { ok: true, result: '这条消息里没有图片', mediaParts: [] };
        const reader = typeof K.mediaReader === 'function' ? K.mediaReader() : K.mediaReader;
        if (!reader) return { ok: false, error: '图片读取服务未装配' };
        const parts = [];
        const failures = [];
        const routes = new Set();
        let success = 0;
        for (const img of images) {
          try {
            const result = await reader.imageParts(img, { signal: c.signal });
            if (!result.parts?.length) throw new Error('图片没有可用内容');
            parts.push(...result.parts); success++;
            if (result.converted === 'gif-video') routes.add('GIF 动图已转为视频片段');
            if (result.converted === 'gif-first-frame') routes.add('GIF 仅显示首帧');
          } catch (err) {
            if (c.signal?.aborted) throw err;
            failures.push(String(err?.message ?? err));
          }
        }
        if (parts.length === 0) return { ok: false, error: `图片获取失败：${failures.join('；')}` };
        return { ok: true, result: `共 ${success} 张图${failures.length ? `（另有 ${failures.length} 张获取失败）` : ''}${routes.size ? `（${[...routes].join('；')}）` : ''}`, mediaParts: parts };
      },
    });

    // T-15 read_video（视频读取：元信息 + 按 videoMode 给原生/抽帧）
    ctx.registerTool({
      id: 'read_video', name: '读视频', category: 'query', requiresVision: false,
      description: '读取消息里的视频（元信息 + 按视频模式给画面）。',
      params: {
        type: 'object',
        properties: {
          messageId: { type: ['number', 'string'], description: '消息 id' },
          frames: { type: ['number', 'string'], description: '抽帧张数 1~12（可省）' },
        },
        required: ['messageId'],
      },
      scopes: [],
      execute: async (args, c) => {
        const m = findByMid(c.chatKey, Number(args.messageId), c.session);
        if (!m) return { ok: false, error: `当前会话找不到消息 ${args.messageId}。${midHint(c.chatKey)}` };
        const videos = (m.media ?? []).filter((x) => x.kind === 'video');
        if (videos.length === 0) return { ok: false, error: '该消息没有视频（媒体里没有 video 段）' };
        const reader = typeof K.mediaReader === 'function' ? K.mediaReader() : K.mediaReader;
        if (!reader) return { ok: false, error: '视频服务未装配' };
        try {
          const { parts = [], ...metadata } = await reader.probe(videos[0], { count: args.frames, signal: c.signal });
          return { ok: true, result: metadata, mediaParts: parts };
        } catch (err) { return { ok: false, error: `视频读取失败：${err?.message ?? err}` }; }
      },
    });
  },
};
