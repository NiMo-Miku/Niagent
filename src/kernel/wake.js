// 唤醒判定：resolveContextTier 四档累积（§6.4）+ isAtMe / hitKeyword / stripMentions。
// 逐条判定、一次定生死；骰子结果由 reason 带回固定不重掷。
// SUSPECT 复刻：triggerLabels 的「@我」标签不允许 startsWith('@') 裸前缀命中（06b §6 易误判处）。

// isAtMe（06b §6 完整算法）：@昵称 / @机器人名 / CQ 码 qq=selfId 三写法
const CQ_AT_RE = /\[CQ:at(?:,[^\]]*?)?qq=(\d+)[^\]]*\]/g;
export function isAtMe(text, { selfNickname = '', botName = '', selfId = '' } = {}) {
  const t = String(text ?? '');
  if (!t) return false;
  const nick = String(selfNickname ?? '').trim();
  if (nick && t.includes('@' + nick)) return true;
  const name = String(botName ?? '').trim();
  if (name && t.includes('@' + name)) return true;
  if (selfId) {
    for (const m of t.matchAll(CQ_AT_RE)) {
      if (m[1] === String(selfId)) return true; // CQ 码按 QQ 号匹配，区分同名
    }
  }
  return false;
}

export function hitKeyword(text, keywords) {
  const t = String(text ?? '').toLowerCase();
  if (!t || !Array.isArray(keywords) || keywords.length === 0) return false;
  return keywords.some((k) => k && t.includes(String(k).toLowerCase()));
}

// stripReplyBlocks（06b §9）：整块剥 [引用 …]（含嵌套方括号；找不到配对 ] 保守不剥）
function stripReplyBlocks(text) {
  let out = String(text ?? '');
  let idx;
  while ((idx = out.indexOf('[引用')) >= 0) {
    let depth = 0;
    let end = -1;
    for (let i = idx; i < out.length; i++) {
      if (out[i] === '[') depth++;
      else if (out[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) break; // 保守不剥
    out = out.slice(0, idx) + ' ' + out.slice(end + 1);
  }
  return out;
}

// stripMentions（06b §9）：剥 @ 片段与 [引用…] 块——关键词判定专用。
// @ 片段原文优先（atNames 精确）；无标记时粗剥 @后1~24非空白字符。
export function stripMentions(text, atNames = []) {
  let out = String(text ?? '');
  if (Array.isArray(atNames) && atNames.length > 0) {
    for (const name of atNames) {
      if (name) out = out.split(name).join(' ');
    }
  } else {
    out = out.replace(/@[^\s]{1,24}/g, ' ');
  }
  out = out.replace(/\[CQ:at[^\]]*\]/g, ' ');
  return stripReplyBlocks(out).trim();
}

/**
 * 档位判定（§6.4）。四档各自独立短路，命中即止——不是逐档下探的累积循环。
 *
 * 用户钦定语义（2026-10-06，权威口径，逐条对账见 SPEC §6.4）：
 *   1 档：被 @ 才响应。
 *   2 档：被 @ 或命中关键词就响应。
 *   3 档：被 @ 或命中关键词就响应；否则**骰一次**，落在 randomPercent 内就响应。
 *         没命中 → 这条消息置已读，看后续群友发言（不重掷、不追问）。
 *   4 档：有消息就回。
 *   私聊在非统一模式下遵循全局档位；统一模式保留恒响应。
 *   明确设置安静的群聊/私聊强制降到 1 档。
 *
 * @param {Object} p
 * @param entry    消息条目（{text, atMe, atNames, isPoke, self}）
 * @param cfg      storeConfigForChat 结果（{contextTier, randomPercent, keywords, unifiedTier}）
 * @param isPrivate 私聊在非统一模式下跟随全局档位（明确安静时强制 1 档）
 * @param roll     外部传入的骰子值（0-100）；null = 本次当场掷一次并把值带回 reason。
 *                 单条判定全程最多掷一次：3 档分支内掷完即return，不存在二次抽签。
 * @returns {shouldRespond, tier, reason}
 */
export function resolveContextTier({ entry, cfg, isPrivate, roll }) {
  const text = String(entry?.text ?? '');
  // @ 判定：优先消息自带 atMe 布尔标记（来自 @ 段 QQ 号，能区分重名）；无标记（null 老存档）才回落文本匹配
  const atMe = typeof entry.atMe === 'boolean'
    ? entry.atMe
    : isAtMe(text, { selfNickname: cfg.selfNickname, botName: cfg.botName, selfId: cfg.selfId });
  // 拍一拍 = 轻量召唤，与 @ 同级（不分档位）：「拍了拍我」兜底老存档里没有 isPoke 标记的记录
  const pokeMe = Boolean(entry.isPoke) && /拍了拍\s*我/.test(text);
  const stripped = stripMentions(text, entry.atNames);
  const kw = hitKeyword(stripped, cfg.keywords); // @ 片段原文里的关键词剔除（§6.4 2 档事故项）

  // Split mode resolves private chats from the global target, never a numeric
  // group override. Preserve legacy unified behavior and explicit quiet rules.
  if (isPrivate && cfg.unifiedTier !== false && cfg.commandMuteTier !== 1) return { shouldRespond: true, tier: 4, reason: '私聊' };

  // 档位钳位：不能用 `Number(x) || 4` —— 0 是 falsy 会被吞成 4 档（0.4 真实注释里的坑）。
  // 先判是否为有限数（0/负数/NaN 都是有效输入，要走进钳位而不是被当"没设置"），
  // 再钳到 [1,4] 并四舍五入，与 0.4 prompt.js:465 行为等价。
  const rawTier = Number(cfg.contextTier);
  const configured = Number.isFinite(rawTier)
    ? Math.min(4, Math.max(1, Math.round(rawTier)))
    : 4;
  const tier = cfg.commandMuteTier === 1 ? 1 : configured; // 被指令禁言强制 1 档（§6.4）

  if (tier === 4) return { shouldRespond: true, tier: 4, reason: '4档 全响应' };

  // 1 / 2 / 3 档共用的确定性信号：@我（拍一拍同级）与关键词
  const called = atMe || pokeMe;
  if (called) {
    return { shouldRespond: true, tier, reason: pokeMe && !atMe ? '拍我' : '@我' };
  }
  if (tier >= 2 && kw) return { shouldRespond: true, tier, reason: '关键词' };

  if (tier >= 3) {
    // 3 档唯一的随机分支：骰一次，命中即响应，不命中就到此为止
    const dice = roll === null || roll === undefined ? Math.random() * 100 : Number(roll);
    const percent = Math.max(0, Math.min(100, Number(cfg.randomPercent) || 0));
    if (dice < percent) return { shouldRespond: true, tier: 3, reason: `随机(${dice.toFixed(1)}<${percent})` };
    return { shouldRespond: false, tier: 3, reason: `随机(${dice.toFixed(1)}≥${percent})未命中` };
  }

  return { shouldRespond: false, tier, reason: '未触发' };
}

// 触发标签（§2.3 / 06b §9 正则）：「提问」「引用」「拍我」——给【未读信息】条目加标签
export function triggerLabels(entry) {
  const text = String(entry?.text ?? '');
  const labels = [];
  if (/[?？]$/.test(text) || /[吗呢]/.test(text)) labels.push('提问');
  if (text.startsWith('[引用 ')) labels.push('引用');
  if (text.includes('[拍一拍]')) labels.push('拍一拍');
  // 「@我」标签：不允许 startsWith('@') 裸前缀命中（SUSPECT 复刻，06b §6）
  if (entry.atMe === true) labels.push('@我');
  return labels;
}
