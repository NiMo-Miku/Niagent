// memory-tools：3 个记忆工具（SPEC §8 T-16/T-17/T-18，notes/08 6.15~6.17）。
export default {
  setup(ctx) {
    const K = { get memory() { return ctx.capability('data.memory'); } };

    // memory_append：记对群友的长期印象（每条 ≤120 字描述约定；存储截 300）
    ctx.registerTool({
      id: 'memory_append', name: '记印象', category: 'memory', icon: '🧠',
      description: '记录对某位群友的长期印象（说话风格/爱玩的梗/雷点/身份关系等稳定信息）。只记以后打交道还用得上的。',
      params: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['memberImpression'], description: '固定 memberImpression' },
          userId: { type: ['integer', 'string'], description: 'QQ 号（数字）' },
          target: { type: 'string', description: '备注名/群名片/昵称' },
          content: { type: 'string', description: '印象内容（≤120 字）' },
        },
        required: ['category', 'userId', 'content'],
      },
      scopes: [],
      execute: async (args, c) => {
        const uid = args.userId;
        if (!/^\d{1,15}$/.test(String(uid ?? ''))) {
          return { ok: false, error: `userId 必须是数字 QQ 号（收到：${JSON.stringify(uid)}）。先用 get_active_members 查准确 QQ 号再记。` };
        }
        const content = String(args.content ?? '').slice(0, 300);
        const r = K.memory.append(c.chatKey, { userId: String(uid), name: args.target, content });
        return { ok: true, result: { saved: !r.deduped, deduped: Boolean(r.deduped), entry: r.entry ?? r } };
      },
    });

    // memory_query：查当前会话对群友的长期印象（可按 QQ 号过滤）
    ctx.registerTool({
      id: 'memory_query', name: '查印象', category: 'memory', icon: '🔍',
      description: '查当前会话对群友的长期印象；可按 QQ 号过滤。',
      params: {
        type: 'object',
        properties: { userId: { type: ['integer', 'string'], description: 'QQ 号（可省，省则列全部）' } },
        required: [],
      },
      scopes: [],
      execute: async (args, c) => {
        const list = K.memory.query(c.chatKey, { userId: args.userId != null ? String(args.userId) : undefined });
        const memberImpression = list.flatMap((member) => (member.impressions ?? []).map((item) => ({ userId: String(member.userId), target: member.name ?? '', content: String(item.content ?? item), createdAt: item.createdAt })));
        return { ok: true, result: { count: memberImpression.length, memberImpression } };
      },
    });

    // memory_remove：删一条过时印象（QQ 号优先，其次名字，都不传则删全部）
    ctx.registerTool({
      id: 'memory_remove', name: '删印象', category: 'memory', icon: '🗑️',
      description: '删一条过时或不再准确的印象。',
      params: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['memberImpression'], description: '固定 memberImpression' },
          userId: { type: ['integer', 'string'], description: 'QQ 号' },
          target: { type: 'string', description: '名字' },
          content: { type: 'string', description: '要删的印象原文（精确匹配；不传则删该成员全部）' },
        },
        required: [],
      },
      scopes: [],
      execute: async (args, c) => {
        const r = K.memory.remove(c.chatKey, { userId: args.userId != null ? String(args.userId) : undefined, name: args.target, content: args.content });
        return r.ok ? { ok: true, result: { removed: Number(r.removed) || 0 } } : { ok: false, error: r.error };
      },
    });
  },
};
