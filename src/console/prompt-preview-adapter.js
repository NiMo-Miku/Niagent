// 提示词组装调试预览（P- debug）：复用与真实运行完全相同的组装函数
// （core.prompt.* 组件可被组合层替换，这里走同一张 components 表），
// 供控制台「技能 / 插件 / 人设」界面实时查看完整组装结果。只读、不调 LLM。
import { buildSystemPrompt, buildUserPrompt, buildPastState } from '../kernel/prompt.js';
import { personaForChat } from '../kernel/persona.js';
import { effectiveGlobalBlocklist } from '../kernel/ingest.js';

export function createPromptPreviewAdapter({
  cfg, loader = null, memory = null, store = null, registry = null,
  components = {}, stickerListProvider = null,
} = {}) {
  const systemPromptFor = components?.['core.prompt.system'] ?? buildSystemPrompt;
  const userPromptFor = components?.['core.prompt.user'] ?? buildUserPrompt;
  const pastStateFor = components?.['core.prompt.pastState'] ?? buildPastState;
  const chatPersonaFor = components?.['core.prompt.persona'] ?? personaForChat;

  function renderSection(s) {
    try { return typeof s.render === 'function' ? String(s.render() ?? '') : String(s.content ?? ''); }
    catch (error) { return `（片段渲染失败：${error?.message ?? error}）`; }
  }

  /** 每个扩展实际注入的提示词片段（技能 prompt.sections / 插件 ctx.prompt.add / 动态 promptSections）。 */
  function sections() {
    return (loader?.promptSections?.() ?? []).map((s) => ({
      owner: s.owner ?? null, id: s.id ?? null, priority: s.priority ?? 50, text: renderSection(s),
    }));
  }

  /** 完整组装预览。chatKey 省略 = 通用骨架（无存档/记忆/表情上下文）。 */
  async function full({ chatKey = null } = {}) {
    const c = cfg();
    const key = typeof chatKey === 'string' && chatKey ? chatKey : null;
    const chatPersona = key ? chatPersonaFor(c, key) : (c.persona ?? {});
    const signal = AbortSignal.timeout(5000);
    let stickerListText = '';
    if (key && typeof stickerListProvider === 'function') {
      try { stickerListText = String(await stickerListProvider(key, c.sticker?.promptMaxStickers ?? 10, { signal }) ?? ''); }
      catch (error) { stickerListText = `（表情清单读取失败：${error?.message ?? error}）`; }
    }
    const skillSections = await loader?.promptSections?.({ chatKey: key, signal }) ?? [];
    const globalBlocklist = effectiveGlobalBlocklist(c);
    const blocklistForChat = c.blocklist?.[String(key ?? '').split(':').pop()] ?? [];
    const all = key ? (store?.recent?.(key, Infinity, { forContext: true }) ?? []) : [];
    const pastLimit = Math.max(0, Number(c.store?.historyCount) || 80);
    const pastState = key && all.length
      ? pastStateFor(all, { excludeIds: new Set(), limit: pastLimit, globalBlocklist, blocklistForChat, memberNotes: c.memberNotes ?? {}, speakerFormat: null })
      : { count: 0, messages: [], text: '' };
    const memText = key ? (memory?.formatForPrompt?.(key, {}) ?? '') : '';
    const userPrompt = userPromptFor({
      chatPersona, triggerEntries: [], pastState, memText, stickerListText, activeTopic: null,
      anchorState: null, memberNotes: c.memberNotes ?? {}, speakerFormat: null, now: new Date(), proactive: false,
    });
    const systemPrompt = systemPromptFor({ lifecycle: null, cfg: { ...c, persona: chatPersona }, skillSections, extraSections: [] });
    const tools = (registry?.list?.() ?? []).map((t) => ({ id: t.id, description: t.description ?? '', scopes: t.scopes ?? [] }));
    return {
      ok: true, chatKey: key, preview: true,
      system: systemPrompt, user: userPrompt, sections: sections(), tools,
      counts: { systemChars: systemPrompt.length, userChars: userPrompt.length, toolCount: tools.length, pastCount: pastState?.count ?? 0 },
    };
  }

  return { sections, full };
}
