// core-tools：机器人本职工具（send_message / send_to / send_poke / finish / report_feedback）。
// 契约：SPEC §8 T-01/T-02/T-04/T-21/T-08；0.4 行为等价。
// 仅消费公共配置与发送能力。
export default {
  setup(ctx) {
    const K = {
      cfg: () => ctx.capability('host.config').get(),
      get send() { return ctx.capability('core.send'); },
    };

    // T-01 send_message：想发一条传字符串；想分多条传数组。
    ctx.registerTool({
      id: 'send_message', name: '发送消息', category: 'messaging',
      description: '在当前会话发言，传 messages 参数。想发一条传字符串；想分多条传数组（每个元素是一条完整消息，不要把同一句话拆到两条里，不要用空格假装分条）。texts 仅兼容旧调用。',
      params: {
        type: 'object',
        properties: {
          messages: { type: ['string', 'array'], description: '要发送的文字（数组 = 分多条发出）' },
          texts: { type: ['string', 'array'], description: '旧调用兼容参数；新调用请传 messages' },
          atUserId: { type: 'string', description: '要在第一条里 @ 的 QQ 号（可省）' },
          replyToMessageId: { type: 'string', description: '要引用的消息 id（可省）' },
        },
        required: [], // messages/texts 二选一，在执行时校验（兼容旧调用）
      },
      scopes: ['qq.send'],
      execute: async (args, c) => {
        const texts = args.messages ?? args.texts ?? args.text ?? args.message;
        if (texts === undefined || texts === null) return { ok: false, error: '发送失败：缺少 messages 参数' };
        const sender = c.send ?? K.send;
        const res = await sender.sendTextBatch(c.chatKey, texts, {
          atUserId: args.atUserId, replyToMessageId: args.replyToMessageId, signal: c.signal,
        });
        c.session.sent = c.session.sent ?? [];
        c.session.sent.push(...(res.sent ?? []));
        if (res.deduped) return { ok: true, result: { sent: [], failed: [], deduped: true, note: res.note ?? '内容重复，已跳过' } };
        return { ok: res.ok !== false, error: res.failed?.[0]?.error, result: { sent: res.sent ?? [], failed: res.failed ?? [], deduped: false, note: res.note ?? null } };
      },
    });

    // T-02 send_to：跨会话发送（受白名单三重校验；tools.crossChatSend 关闭时工具不可见）。
    ctx.registerTool({
      id: 'send_to', name: '跨会话发送', category: 'messaging', defaultEnabled: true,
      description: '传 targetChatKey 和 messages，把消息发到另一个会话（群或私聊）。目标必须在白名单里；跨会话是社交敏感操作，默认关闭。texts 仅兼容旧调用。',
      params: {
        type: 'object',
        properties: {
          targetChatKey: { type: 'string', description: '目标会话键（group:<群号> 或 private:<QQ号>）' },
          messages: { type: ['string', 'array'], description: '要发送的文字' },
          texts: { type: ['string', 'array'], description: '旧调用兼容参数；新调用请传 messages' },
        },
        required: ['targetChatKey'],
      },
      scopes: ['qq.send'],
      execute: async (args, c) => {
        const cfg = K.cfg();
        const target = String(args.targetChatKey ?? '');
        const m = target.match(/^(group|private):(\d+)$/);
        if (!m) return { ok: false, error: `目标会话格式不对：${target}（应为 group:<群号> 或 private:<QQ号>）` };
        const [kind, id] = [m[1], m[2]];
        // 白名单三重校验：跨会话目标必须不同于当前会话，且必须显式列入 allow。
        if (target === c.chatKey) return { ok: false, error: '目标会话必须不同于当前会话，当前会话请用 send_message' };
        const allowList = cfg.allow?.[kind === 'group' ? 'groups' : 'private'] ?? [];
        if (!Array.isArray(allowList) || !allowList.map(String).includes(id)) {
          return { ok: false, error: `目标 ${target} 不在白名单内，已拒绝发送` };
        }
        const denyList = cfg.deny?.[kind === 'group' ? 'groups' : 'private'] ?? [];
        if (denyList.map(String).includes(id)) {
          return { ok: false, error: `目标 ${target} 在黑名单内，已拒绝发送` };
        }
        const texts = args.messages ?? args.texts ?? args.text;
        if (texts === undefined || texts === null) return { ok: false, error: '发送失败：缺少 messages 参数' };
        const sender = c.send ?? K.send;
        const res = await sender.sendTextBatch(target, texts, { signal: c.signal });
        c.session.sent = c.session.sent ?? [];
        c.session.sent.push(...(res.sent ?? []));
        return { ok: res.ok !== false, error: res.failed?.[0]?.error, result: { targetChatKey: target, sent: res.sent ?? [], failed: res.failed ?? [], note: res.note ?? null } };
      },
    });

    // T-04 send_poke：拍一拍。群聊传 targetUserId（运行时校验），私聊可省。
    // SUSPECT 复刻（C-05）：schema 未把 targetUserId 标 required（0.4 行为）——模型可能不传参白吃一次错误往返。
    ctx.registerTool({
      id: 'send_poke', name: '拍一拍', category: 'messaging',
      description: '拍一拍群友。群聊必须传 targetUserId；私聊可省。',
      params: {
        type: 'object',
        properties: {
          targetUserId: { type: ['integer', 'string'], description: '要拍的 QQ 号（群聊必填，须为正整数）' },
        },
        required: [], // SUSPECT 复刻：0.4 schema 未标 required
      },
      scopes: ['qq.send'],
      execute: async (args, c) => {
        const isGroup = c.chatKey.startsWith('group:');
        const uid = args.targetUserId ?? args.userId;
        if (isGroup && uid == null) return { ok: false, error: '群聊里拍人需要传 targetUserId（QQ 号）' };
        const groupId = isGroup ? c.chatKey.split(':').pop() : null;
        const userId = uid ?? (isGroup ? '' : c.chatKey.split(':').pop());
        // OneBot 将 QQ 号编码为 Number，不能把非法值或有精度损失的目标下传。
        const numericId = typeof userId === 'string' || typeof userId === 'number' ? Number(userId) : NaN;
        if (!Number.isSafeInteger(numericId) || numericId <= 0) return { ok: false, error: `targetUserId 必须是正整数的 QQ 号（收到：${JSON.stringify(userId)}）` };
        await K.send.poke(c.chatKey, { groupId, userId: String(numericId) });
        return { ok: true, result: '已拍一拍' };
      },
    });

    // T-21 finish：明确结束本次处理（可带话题总结供活跃期判定）。
    ctx.registerTool({
      id: 'finish', name: '结束本轮', category: 'system',
      description: '结束这次回复。想结束但还有话没说时，先调 send_message；想延续话题可带 activeTopic（≤60 字）。',
      params: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '本轮小结（≤300 字，可省）' },
          reason: { type: 'string', description: '结束原因（如"说完了""话题结束"）' },
          activeTopic: { type: 'string', description: '想继续深聊的话题（≤60 字）' },
        },
        required: [],
      },
      scopes: [],
      execute: async (args, c) => {
        if (args.summary) c.session.finishReason = String(args.summary).slice(0, 300);
        if (args.reason) c.session.finishReason = String(args.reason);
        if (args.activeTopic) c.session.activeTopic = String(args.activeTopic).slice(0, 60);
        return { ok: true, result: { finished: true } };
      },
    });

    // T-08 report_feedback：向管理员/控制台反馈（不用于聊天）。
    ctx.registerTool({
      id: 'report_feedback', name: '反馈问题', category: 'system',
      description: '向管理员反馈问题或建议（不用于聊天）。',
      params: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['info', 'warning', 'error'], description: '级别' },
          message: { type: 'string', description: '反馈内容（≤500 字）' },
        },
        required: ['message'],
      },
      scopes: [],
      execute: async (args, c) => {
        const level = ['info', 'warning', 'error'].includes(args.level) ? args.level : 'info';
        const message = String(args.message ?? '').slice(0, 500);
        c.session.feedbacks = c.session.feedbacks ?? [];
        c.session.feedbacks.push({ level, message, at: Date.now() });
        ctx.capability('host.feedback')?.report({ level, message, chatKey: c.chatKey });
        return { ok: true, result: { reported: true } };
      },
    });
  },
};
