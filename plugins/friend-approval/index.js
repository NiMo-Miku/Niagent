// 好友申请审批（0.5 版，自 0.4 skills/friend-approval 迁移）
//
// 把"要不要加这个人为好友"的决定权交回给主人/管理员。
//
// 三条入口，共用同一张"待审批"表（ctx.storage 的 pending 键）：
//   ① 有人申请加机器人为好友
//      → 宿主把 OneBot 好友申请事件经 friend.request 能力确定性转发进来（不经模型）
//   ② 群友要求机器人主动加他
//      → 模型调用 request_friend_add 工具（LLM 型，用不用由模型判断）
//   ③ 管理员主动下令加某人为好友
//      → 模型调用 admin_add_friend 工具（仅审批人本人私聊可用）：管理员开口就是批准，
//        直接记进预批准名单并尽量通知对方发一条申请，不用再请示一遍
// ①②都会私聊请示审批人；审批人回复同意/拒绝时，模型调用 decide_friend_request 执行。
//
// ⚠️ 协议端（OneBot v11）只有"接受/拒绝别人发来的好友申请"
//    （transport.actions.setFriendAddRequest），**没有**"机器人主动发好友申请"的接口。
//    所以②审批人同意后走的是「预批准 + 请对方自己发一条申请」：
//    对方一发申请就自动通过，不必再问审批人一次。
//
// 0.4 → 0.5 迁移差异：
//   - onebot.call(...) → ctx.capability('transport.actions') 门面（按方法走宿主权限闸）；
//   - 直接读写 data/ 文件 → ctx.storage KV（pending / preapproved 两个键）；
//   - 审批人只来自插件设置（0.5 插件读不到宿主 allow.private，不再回落）；
//   - 动态 promptSections(ctx) → 清单静态 prompt 段（0.5 无按会话动态注入点）；
//   - 工具里不再校验"对方是机器人自己"（0.5 工具执行上下文不含 selfId，影响可忽略）。

const MAX_PENDING = 50;        // 待审批条数上限（超了丢最旧的）
const MAX_PREAPPROVED = 100;   // 预批准名单上限

let ctx = null;               // 0.5 SDK 上下文
let approversCache = null;    // 启动时算好的审批人名单（配置变更经 config.onChange 失效）

function cfg() {
  try { return { approvers: '', maxPendingHours: 12, ...(ctx?.config?.all() ?? {}) }; } catch { return { approvers: '', maxPendingHours: 12 }; }
}

/** 审批人 QQ 号（仅插件设置；0.5 读不到宿主白名单）。 */
function approvers() {
  if (approversCache) return approversCache;
  return (approversCache = parseApprovers(cfg().approvers));
}
function parseApprovers(value) {
  return [...new Set(String(value ?? '').split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean))];
}

// ── 待审批表（ctx.storage KV）────────────────────────────────────────────

function readState() {
  let pending = [], preapproved = [];
  try { pending = ctx.storage.get('pending') ?? []; } catch { /* 新库 */ }
  try { preapproved = ctx.storage.get('preapproved') ?? []; } catch { /* 新库 */ }
  return {
    pending: Array.isArray(pending) ? pending.filter((p) => p && p.userId && p.kind) : [],
    preapproved: Array.isArray(preapproved) ? preapproved.filter((p) => p && p.userId) : [],
  };
}

function writeState(state) {
  ctx.storage.set('pending', state.pending);
  ctx.storage.set('preapproved', state.preapproved);
}

/** 丢掉过期和超量的待审批项（原地改 state）。 */
function prune(state) {
  const hours = Math.max(1, Number(cfg().maxPendingHours) || 12);
  const deadline = Date.now() - hours * 3600000;
  state.pending = state.pending.filter((p) => Number(p.askedAt) >= deadline);
  if (state.pending.length > MAX_PENDING) state.pending = state.pending.slice(-MAX_PENDING);
  if (state.preapproved.length > MAX_PREAPPROVED) state.preapproved = state.preapproved.slice(-MAX_PREAPPROVED);
}

function removePending(state, id) {
  state.pending = state.pending.filter((p) => p.id !== id);
}

function whoText({ userId, name } = {}) {
  return name ? `${name}(QQ:${userId})` : `QQ:${userId}`;
}

/** 私聊问所有审批人。返回成功送达的人数。 */
async function askApprovers(lines) {
  let sent = 0;
  for (const id of approvers()) {
    try {
      await ctx.send(`private:${id}`, lines.map((text) => ({ type: 'text', text })), {});
      sent += 1;
    } catch (error) {
      ctx.log.warn(`给审批人 ${id} 发消息失败：${error?.message ?? error}`);
    }
  }
  return sent;
}

/** 尽力量取昵称；失败就只留 QQ 号（绝不因此中断流程）。 */
async function resolveName(actions, userId) {
  try {
    const info = await actions.getChatInfo(`private:${userId}`);
    return String(info?.card || info?.nickname || '').trim();
  } catch { return ''; }
}

const chatIdOf = (chatKey) => String(chatKey ?? '').split(':').pop() ?? '';
const kindOf = (chatKey) => String(chatKey ?? '').split(':')[0] ?? '';

// ── ① 好友申请事件（宿主 friend.request 确定性分发，不经模型）───────────────

async function handleFriendRequest(payload = {}) {
  const userId = String(payload?.userId ?? '').trim();
  const flag = String(payload?.flag ?? '').trim();
  if (!/^\d{5,12}$/.test(userId) || !flag) {
    ctx.log.warn('收到好友申请，但 userId/flag 缺失，已跳过');
    return null; // 不认领：形状不对的事件不属于本插件
  }

  const actions = ctx.capability('transport.actions');
  const state = readState();
  prune(state);

  // ① 审批人此前已同意过这个人 → 直接通过，不再打扰审批人
  if (state.preapproved.some((p) => p.userId === userId)) {
    state.preapproved = state.preapproved.filter((p) => p.userId !== userId);
    writeState(state);
    try {
      await actions.setFriendAddRequest({ flag, approve: true });
      ctx.log.info(`已自动通过 ${userId} 的好友申请（审批人此前已同意）`);
      await askApprovers([`已自动通过 ${userId} 的好友申请（你之前同意过他）。`]);
    } catch (error) {
      ctx.log.warn(`自动通过 ${userId} 的好友申请失败：${error?.message ?? error}`);
      await askApprovers([`${userId} 发来了好友申请，你之前同意过，但自动通过失败了：${error?.message ?? error}`]);
    }
    return { handled: true };
  }

  // ② 常规路径：记进待审批表，私聊问审批人
  const comment = String(payload?.comment ?? '').trim();
  const name = await resolveName(actions, userId);
  const dup = state.pending.find((p) => p.kind === 'incoming' && p.userId === userId);
  if (dup) {
    // 同一个人重复申请：刷新 flag（旧 flag 可能已经失效），并挪到队尾 ——
    // 队列顺序就是"最近申请"的判据，不挪的话它会一直躺在原来的位置。
    state.pending = state.pending.filter((p) => p !== dup);
    state.pending.push({ ...dup, flag, comment: comment || dup.comment, askedAt: Date.now() });
  } else {
    state.pending.push({ id: `${Date.now()}-${userId}`, kind: 'incoming', userId, name, comment, flag, askedAt: Date.now() });
  }
  writeState(state);

  const sent = await askApprovers([
    `📩 有人申请加我为好友：${whoText({ userId, name })}`,
    ...(comment ? [`验证消息：${comment}`] : []),
    '同意请回复「同意」，不同意请回复「拒绝」。'
  ]);
  ctx.log.info(`好友申请已转呈 ${sent} 位审批人：${userId}`);
  return { handled: true };
}

// ── 工具（③②审批决定都由模型调用；权限闸由宿主按 scope 把守）─────────────

export async function setup(context) {
  ctx = context;

  ctx.registerCapability('friend.request', (payload) => handleFriendRequest(payload), {});

  ctx.registerTool({
    id: 'request_friend_add',
    name: '请示加好友',
    description: '当群里有人明确要求机器人加他好友（例如「加我」「你加我一下」「加个好友」）时使用：把这件事报给审批人请示，由审批人决定。调用后在群里回一句"我去问下管理员"即可，不要直接答应也不要一口回绝。注意：机器人自己不能主动发好友申请，所以审批人同意后要请对方自己发一条申请，那条申请会被自动通过。没有这个需求时不要调用。',
    category: 'messaging',
    params: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '提出要求的群友 QQ 号，从发言人标签里取，例如「神(nm)(QQ:2661342965)」里的 2661342965' },
        note: { type: 'string', description: '对方的原话或补充说明，会一并转给审批人（可选）' }
      },
      required: ['userId']
    },
    async execute(args, execCtx) {
      const userId = String(args?.userId ?? '').trim();
      if (!/^\d{5,12}$/.test(userId)) {
        return { content: `没拿到有效的 QQ 号（收到的是「${userId}」）。请把对方 QQ 号填进 userId —— 从发言人标签形如 (QQ:123456) 里取。`, isError: true };
      }
      if (!approvers().length) {
        return { content: '还没配置审批人，我没法请示。请让管理员在「插件 → 好友申请审批」里填上审批人 QQ 号。', isError: true };
      }

      const state = readState();
      prune(state);
      if (state.pending.some((p) => p.kind === 'invite' && p.userId === userId)) {
        return { content: `${userId} 的事已经问过审批人了，还没回话。别重复请示，也别答应对方。` };
      }

      const note = String(args?.note ?? '').trim().slice(0, 120);
      const actions = execCtx.transport?.actions ?? ctx.capability('transport.actions');
      const name = await resolveName(actions, userId);
      state.pending.push({ id: `${Date.now()}-${userId}`, kind: 'invite', userId, name, note, chatKey: execCtx.chatKey, askedAt: Date.now() });
      writeState(state);

      const sent = await askApprovers([
        `📩 ${whoText({ userId, name })} 想让我加他好友${kindOf(execCtx.chatKey) === 'group' ? `（群 ${chatIdOf(execCtx.chatKey)}）` : ''}。`,
        ...(note ? [`对方说：${note}`] : []),
        '同意请回复「同意」，不同意请回复「拒绝」。'
      ]);
      if (!sent) return { content: '请示失败：没能把消息发给任何一个审批人，检查一下审批人 QQ 号。', isError: true };

      ctx.log.info(`已把加好友请示转给 ${sent} 位审批人：${userId}`);
      return { content: '已经把这件事转给审批人了。你现在在群里说一句"我去问下管理员"就行 —— 别答应、也别一口回绝；审批人同意后对方自己发一条好友申请就会自动通过。' };
    }
  });

  ctx.registerTool({
    id: 'decide_friend_request',
    name: '审批好友申请',
    description: '审批人（主人/管理员）在私聊里明确回复「同意 / 通过 / 行」或「拒绝 / 不同意」这类对好友申请的表态时使用，会真的通过或拒绝这条申请，别的说法不要调用。只在审批人本人的私聊里、并且确实有待审批的好友申请时使用；对方只是闲聊或意思含糊时先问清楚，不要擅自通过。',
    category: 'messaging',
    params: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['approve', 'reject'], description: 'approve=同意通过，reject=拒绝' },
        userId: { type: 'string', description: '要处理的申请人 QQ 号；不填则处理最近一条待审批的申请' },
        reason: { type: 'string', description: '拒绝理由，只做记录，不会发给对方（可选）' }
      },
      required: ['decision']
    },
    async execute(args, execCtx) {
      const decision = args?.decision === 'approve' ? 'approve' : (args?.decision === 'reject' ? 'reject' : '');
      if (!decision) return { content: 'decision 只能是 approve（同意）或 reject（拒绝）。', isError: true };

      const list = approvers();
      if (!list.length) return { content: '还没配置审批人，这次没法批。', isError: true };
      if (kindOf(execCtx.chatKey) !== 'private' || !list.includes(chatIdOf(execCtx.chatKey))) {
        return { content: `只有审批人本人私聊我时才算数（当前审批人：${list.join('、')}），这一条我不执行。`, isError: true };
      }

      const state = readState();
      prune(state);
      const wanted = String(args?.userId ?? '').trim();
      const waiting = state.pending.filter((p) => !wanted || p.userId === wanted);
      if (!waiting.length) {
        return { content: wanted ? `没有 ${wanted} 的待审批申请（可能已经处理过或过期了）。` : '现在没有待审批的好友申请。', isError: true };
      }
      // 表按申请先后排列，最后一条就是最近的那条。
      // （刻意不按 askedAt 比大小：同一毫秒内产生的两条会打平，取谁就成了运气。）
      const target = waiting[waiting.length - 1];
      const actions = execCtx.transport?.actions ?? ctx.capability('transport.actions');

      try {
        // ① 对方发来的好友申请：直接调协议端接口通过 / 拒绝
        if (target.kind === 'incoming') {
          await actions.setFriendAddRequest({ flag: target.flag, approve: decision === 'approve' });
          removePending(state, target.id);
          writeState(state);
          ctx.log.info(`${decision === 'approve' ? '通过' : '拒绝'}了好友申请：${target.userId}`);
          return {
            content: `已${decision === 'approve' ? '通过' : '拒绝'} ${whoText(target)} 的好友申请。`
              + (decision === 'reject' ? '对方不会收到任何通知。' : '')
          };
        }

        // ② 群友要求机器人加他：协议端不能主动发申请 → 同意 = 预批准，对方一发申请就自动过
        if (decision === 'approve') {
          state.preapproved = [
            ...state.preapproved.filter((p) => p.userId !== target.userId),
            { userId: target.userId, at: Date.now() }
          ].slice(-MAX_PREAPPROVED);
          removePending(state, target.id);
          writeState(state);
          let told = '';
          try {
            await execCtx.send.sendTextBatch(target.chatKey, ['管理员同意啦，你发一条好友申请就行，我这边会自动通过。'], { atUserId: target.userId });
            told = '并在原会话里告诉他了';
          } catch (error) {
            told = `但通知他没成功（${error?.message ?? error}），你可能得自己去说一声`;
          }
          ctx.log.info(`已预批准 ${target.userId}`);
          return { content: `已同意 ${whoText(target)} 的请求，${told}。等他发来好友申请会自动通过，不用再问你。` };
        }

        removePending(state, target.id);
        writeState(state);
        ctx.log.info(`已拒绝 ${target.userId} 的加好友请求`);
        return { content: `已拒绝 ${whoText(target)} 的请求。机器人本来就不能主动加人，所以我也不会给他发任何消息。` };
      } catch (error) {
        return { content: `执行失败：${error?.message ?? error}`, isError: true };
      }
    }
  });

  ctx.registerTool({
    id: 'admin_add_friend',
    name: '受命加好友',
    description: '审批人（主人/管理员）在私聊里明确要求机器人去加某人为好友（例如「去加 123456 为好友」「把 123456 加上」「帮我加一下这个号：123456」）时使用：管理员开口就等于批准，直接把对方记进自动通过名单，并尽量通知他发一条好友申请。注意：机器人不能主动发好友申请（协议限制），实际效果是预批准——对方发来申请时会自动通过。只在审批人本人的私聊里、且对方 QQ 号说得出时使用；群友自己求加好友用 request_friend_add，对已经躺在待审批表里的申请表态用 decide_friend_request，别用这个。',
    category: 'messaging',
    params: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '要加的人的 QQ 号（管理员在消息里给出的纯数字号码）' },
        note: { type: 'string', description: '管理员补充的说明（对方是谁、为什么加），只做记录（可选）' }
      },
      required: ['userId']
    },
    async execute(args, execCtx) {
      // 权限：只有审批人本人在私聊里能下令 —— 和 decide_friend_request 同一条纪律，
      // 群里别人冒充管理员说话不算数。
      const list = approvers();
      if (!list.length) {
        return { content: '还没配置审批人，这个功能用不了。请管理员在「插件 → 好友申请审批」里填上审批人 QQ 号。', isError: true };
      }
      if (kindOf(execCtx.chatKey) !== 'private' || !list.includes(chatIdOf(execCtx.chatKey))) {
        return { content: `这个操作只能由审批人本人在私聊里发起（当前审批人：${list.join('、')}），这一条我不执行。`, isError: true };
      }

      const userId = String(args?.userId ?? '').trim();
      if (!/^\d{5,12}$/.test(userId)) {
        return { content: `没拿到有效的 QQ 号（收到的是「${userId}」）。请把对方 QQ 号填进 userId，纯数字。`, isError: true };
      }

      const state = readState();
      prune(state);
      const actions = execCtx.transport?.actions ?? ctx.capability('transport.actions');

      // ① 对方之前正好发过申请、还躺在待审批表里 → 管理员的命令就是批准，直接过掉
      const waiting = state.pending.filter((p) => p.kind === 'incoming' && p.userId === userId);
      if (waiting.length) {
        const target = waiting[waiting.length - 1];
        try {
          await actions.setFriendAddRequest({ flag: target.flag, approve: true });
          removePending(state, target.id);
          state.preapproved = state.preapproved.filter((p) => p.userId !== userId);
          writeState(state);
          ctx.log.info(`管理员受命加好友：直接通过 ${userId} 的既有申请`);
          return { content: `已通过 ${whoText(target)} 的好友申请（他之前正好发过一条，不用再等了）。` };
        } catch (error) {
          // flag 多半已失效（申请过期/被撤回）→ 落回预批准路径，让对方重发一条
          ctx.log.warn(`直接通过 ${userId} 的既有申请失败（${error?.message ?? error}），改走预批准`);
        }
      }

      // ② 已经在自动通过名单里就不重复记
      if (state.preapproved.some((p) => p.userId === userId)) {
        return { content: `${whoText({ userId })} 已经在自动通过名单里了，等他发一条好友申请就会自动通过，不用再记一次。` };
      }

      // ③ 已经是好友就不折腾了（协议端不支持 get_friend_list 时跳过这项检查）
      try {
        const friends = await actions.listFriends({});
        const known = (Array.isArray(friends) ? friends : []).find((f) => String(f?.id) === userId);
        if (known) return { content: `${whoText({ userId, name: known.name })} 已经是好友了，不用加。` };
      } catch { /* 没有这个接口就算了，继续预批准 */ }

      const name = await resolveName(actions, userId);
      state.pending = state.pending.filter((p) => p.userId !== userId);   // 残留的旧请示一并清掉
      state.preapproved = [
        ...state.preapproved.filter((p) => p.userId !== userId),
        { userId, at: Date.now() }
      ].slice(-MAX_PREAPPROVED);
      writeState(state);

      // ④ 尽量通知对方发一条申请。陌生人私聊很多协议端发不出去，失败不影响预批准本身。
      let told;
      try {
        await execCtx.send.sendTextBatch(`private:${userId}`, ['你好，我是机器人。管理员让我来加你，麻烦你给我发一条好友申请（验证消息随便填），我这边会自动通过。'], {});
        told = '已经私聊通知他发一条申请了';
      } catch (error) {
        told = `但通知没发出去（${error?.message ?? error}）`;
      }
      ctx.log.info(`管理员受命加好友：已预批准 ${userId}`);
      return {
        content: `已把 ${whoText({ userId, name })} 记进自动通过名单，${told}。`
          + '机器人没法主动发好友申请（协议限制），所以他发来申请时会自动通过，不用再问你。'
          + (told.startsWith('但通知') ? '麻烦你转告他发一条好友申请。' : '')
          + (String(args?.note ?? '').trim() ? `（备注：${String(args.note).trim().slice(0, 120)}）` : '')
      };
    }
  });

  ctx.config.onChange?.(() => { approversCache = null; });
  ctx.log.info(`好友申请审批已就绪：${approvers().length} 位审批人`);
  ctx.lifecycle.onStop(() => { approversCache = null; });
}

/** 可用性自检（必须同步）：没配审批人就没法请示，直接在技能页显示原因。 */
export function available() {
  if (!approvers().length) {
    return { ok: false, reason: '还没设置审批人：在插件设置里填「审批人 QQ 号」' };
  }
  return { ok: true };
}

export function dispose() {
  ctx = null; approversCache = null;
}
