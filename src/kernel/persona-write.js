// 插件侧人格写入事务与只读摘要（本体开发移交引索.md 任务一，2026-10-31）。
// 与控制台 persona-by-chat 同一套磁盘语义：会话级映射只能经 personaByChat __replace__
// 读改写（deepMerge 传缺键对象删不掉键）；白名单外字段一律 403，超长 400，空串=清除。
// 生效性不在此处裁决：会话级覆盖仍由 personaForChat 的 personaUnified 门决定，
// 这里如实落盘并在 read()/write() 结果里暴露 unified，不代替用户翻转该全局开关。
import { personaForChat } from './persona.js';

const FIELDS = ['roleText', 'customRules', 'systemPromptOverride'];
const LIMITS = { roleText: 20000, customRules: 4000, systemPromptOverride: 20000 };
const IDENTITY_FIELDS = new Set(['botName', 'selfNickname', 'participation']);
const CHAT_KEY = /^(group|private):([1-9]\d{0,14})$/;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status, expose: true }); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createPersonaWriter({ config, log = console, bus = null, templates = () => [] } = {}) {
  function mapOf(source) {
    const value = source.personaByChat;
    if (value != null && !object(value)) fail('personaByChat 配置格式无效，需先修复原始配置');
    return object(value) ? value : {};
  }

  // 校验并归一化一次写入：null/''/纯空白 → 清除；正文 trim 后落盘（长度上限按原文计）。
  function plan(chatKey, fields) {
    if (chatKey != null && (typeof chatKey !== 'string' || !CHAT_KEY.test(chatKey)))
      fail('chatKey 须为 null（全局人设）或 group:数字 / private:数字');
    if (!object(fields) || Object.keys(fields).length === 0) fail('fields 须为非空对象');
    const values = {};
    for (const key of Object.keys(fields)) {
      if (!FIELDS.includes(key)) {
        fail(IDENTITY_FIELDS.has(key) ? `字段 ${key} 与账号身份或参与度相关，不对插件开放` : `字段 ${key} 不在可写白名单（${FIELDS.join('/')}）`, 403);
      }
      const value = fields[key];
      if (value !== null && typeof value !== 'string') fail(`${key} 须为字符串或 null`);
      if (typeof value === 'string' && value.length > LIMITS[key]) fail(`${key} 超过 ${LIMITS[key]} 字上限`);
      const trimmed = typeof value === 'string' ? value.trim() : null;
      values[key] = trimmed ? trimmed : null;
    }
    return { target: chatKey ?? null, values };
  }

  function write(input = {}, actor = null) {
    const { target, values } = plan(input?.chatKey ?? null, input?.fields);
    const keys = Object.keys(values);
    if (target === null) {
      const patch = {};
      for (const key of keys) patch[key] = values[key] ?? ''; // 全局人设无“删键”概念：空串即清除
      config.update({ persona: patch });
    } else {
      const map = mapOf(config.get()), previous = object(map[target]) ? map[target] : null;
      const entry = previous ? { ...previous } : {};
      for (const key of keys) {
        if (values[key] === null) delete entry[key];
        else entry[key] = values[key];
      }
      // 与控制台一致：字段被实际改写后，模板指针不再代表该条目来源。
      if (keys.some((key) => (Object.hasOwn(previous ?? {}, key) ? previous[key] : null) !== values[key])) {
        delete entry.templateId; delete entry.templateName;
      }
      const next = { ...map };
      if (Object.keys(entry).length) next[target] = entry; else delete next[target];
      config.update({ personaByChat: { __replace__: next } });
    }
    // 审计：调用方、目标与字段名，不含正文；控制台面板经 status 事件同步。
    log.info?.(`[persona.write] ${actor?.pluginId ?? '未知调用方'} → ${target ?? '全局'}：${keys.join('、')}`);
    bus?.emit?.('status', { configUpdated: true, ...(target !== null ? { personaByChatUpdated: true } : {}) });
    const unified = config.get().personaUnified !== false;
    return {
      ok: true, scope: target === null ? 'global' : 'chat', chatKey: target,
      applied: keys.filter((key) => values[key] !== null), cleared: keys.filter((key) => values[key] === null),
      unified, effective: target === null ? true : !unified, // 会话级覆盖仅在分会话人设模式（unified=false）生效
    };
  }

  // 摘要不含任何人格正文：只有“哪些会话覆盖了哪些字段”与全局字段的在位/字数。
  const fieldInfoOf = (persona) => Object.fromEntries(FIELDS.map((key) => {
    const value = persona?.[key];
    return [key, { set: typeof value === 'string' && Boolean(value.trim()), chars: typeof value === 'string' ? value.length : 0 }];
  }));

  const templateIdOf = (entry) => typeof entry?.templateId === 'string' && entry.templateId ? entry.templateId : null;

  function read() {
    const c = config.get(), map = mapOf(c);
    const chats = Object.keys(map).sort()
      .filter((key) => object(map[key]))
      .map((key) => ({
        chatKey: key, legacy: !CHAT_KEY.test(key), templateId: templateIdOf(map[key]),
        fields: FIELDS.filter((field) => typeof map[key][field] === 'string' && map[key][field].trim()),
      }))
      .filter((item) => item.fields.length > 0 || item.legacy);
    return {
      unified: c.personaUnified !== false,
      global: { ...fieldInfoOf(c.persona), templateId: templateIdOf(c.persona) },
      chats,
    };
  }

  // 人设切换：采用控制台同一套「选择」语义——库内容由人设库（控制台）校验，这里不再复检长度；
  // 全局切换会一并清空 systemPromptOverride 并记录 templateId/templateName（与设置面板一致）。
  function select(input = {}, actor = null) {
    const { chatKey = null, personaId } = input ?? {};
    if (chatKey != null && (typeof chatKey !== 'string' || !CHAT_KEY.test(chatKey)))
      fail('chatKey 须为 null（全局人设）或 group:数字 / private:数字');
    if (personaId !== null && typeof personaId !== 'string') fail('personaId 须为字符串或 null');
    if (personaId === null && chatKey === null) fail('全局人设没有清空语义；清除字段请用 write，或选择具体人设');
    const target = chatKey ?? null, who = actor?.pluginId ?? '未知调用方';
    const report = (extra = {}) => {
      const unified = config.get().personaUnified !== false;
      log.info?.(`[persona.write] ${who} → ${target ?? '全局'}：select=${personaId ?? '(清除)'}`);
      bus?.emit?.('status', { configUpdated: true, ...(target !== null ? { personaByChatUpdated: true } : {}) });
      return { ok: true, scope: target === null ? 'global' : 'chat', chatKey: target, personaId, unified, effective: target === null ? true : !unified, ...extra };
    };
    if (personaId === null) {
      // 会话级清除 = 整条覆盖移除（跟随全局），与控制台「跟随全局」一致。
      const map = mapOf(config.get());
      if (Object.hasOwn(map, target)) {
        const next = { ...map }; delete next[target];
        config.update({ personaByChat: { __replace__: next } });
      }
      return report({ cleared: true });
    }
    const template = templates().find((item) => item?.id === personaId);
    if (!template) fail('人设不存在或已删除，请先从人设库或控制台获取有效 personaId', 404);
    if (target === null) {
      config.update({ persona: { roleText: template.text, customRules: template.customRules ?? '', systemPromptOverride: '', templateId: template.id, templateName: template.name } });
    } else {
      const map = mapOf(config.get()), entry = object(map[target]) ? { ...map[target] } : {};
      entry.roleText = template.text; entry.customRules = template.customRules ?? '';
      delete entry.systemPromptOverride; delete entry.participation; // 与控制台选择一致：整体采用模板并回归继承
      entry.templateId = template.id; entry.templateName = template.name;
      const next = { ...map }; next[target] = entry;
      config.update({ personaByChat: { __replace__: next } });
    }
    return report({ name: template.name });
  }

  // 会话生效视角（全局+会话合成，personaForChat 同一实现）；仅字段在位标记，无正文。
  function resolve(chatKey) {
    if (typeof chatKey !== 'string') fail('resolve 须传入 chatKey 字符串');
    return fieldInfoOf(personaForChat(config.get(), chatKey));
  }

  return Object.freeze({ write, select, read, resolve });
}
