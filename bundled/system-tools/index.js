// system-tools：提醒三件套 + 节假日（SPEC §8 T-22~T-25）。
// 提醒通过公共能力消费；节假日计算使用纯函数。
import { checkHoliday } from '../../src/kernel/holidays.js';

function parseAtTime(atTime, now = new Date()) {
  const s = String(atTime ?? '').trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hour = Number(m[1]), minute = Number(m[2]);
    if (hour > 23 || minute > 59) throw new Error('时间格式不对：用 "HH:MM"（如 18:30）或 "YYYY-MM-DD HH:MM"');
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); // 今天已过 → 明天
    return d.getTime();
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]), hour=Number(m[4]), minute=Number(m[5]);
    const d = new Date(year, month - 1, day, hour, minute, 0);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day || hour > 23 || minute > 59) {
      throw new Error('时间格式不对：用 "HH:MM"（如 18:30）或 "YYYY-MM-DD HH:MM"');
    }
    return d.getTime();
  }
  throw new Error('时间格式不对：用 "HH:MM"（如 18:30）或 "YYYY-MM-DD HH:MM"');
}

export default {
  setup(ctx) {
    const K = { get reminders() { return ctx.capability('data.reminders'); } };

    ctx.registerTool({
      id: 'set_reminder', name: '设提醒', category: 'system', icon: '⏰',
      description: '设定时提醒（闹钟），到点机器人在当前群主动发一条消息。',
      params: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '到点要说的话' },
          delayMinutes: { type: 'number', description: '多少分钟后' },
          atTime: { type: 'string', description: '"HH:MM" 或 "YYYY-MM-DD HH:MM"' },
        },
        required: ['text'],
      },
      scopes: [],
      execute: async (args, c) => {
        if (!K.reminders) return { ok: false, error: '提醒服务未启用' };
        const text = String(args.text ?? '').trim();
        if (!text) return { ok: false, error: '提醒内容为空' };
        let dueAt;
        if (args.delayMinutes != null) {
          const n = Number(args.delayMinutes);
          if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'delayMinutes 必须是正数' };
          dueAt = Date.now() + n * 60000;
        } else if (args.atTime != null) {
          try { dueAt = parseAtTime(args.atTime); }
          catch (err) { return { ok: false, error: err.message }; }
          if (dueAt <= Date.now()) return { ok: false, error: '这个时间已经过了，请给个未来的时间' };
        } else {
          return { ok: false, error: '请提供 delayMinutes（多少分钟后）或 atTime（具体时间）之一' };
        }
        const r = K.reminders.add({ chatKey: c.chatKey, text, dueAt, createdBy: String(c.senderId ?? '') });
        return { ok: true, result: { set: true, id: r.id, dueAt, note: text } };
      },
    });

    ctx.registerTool({
      id: 'list_reminders', name: '查提醒', category: 'system', icon: '📋',
      description: '列当前会话未触发的提醒（id + 时间 + 内容）。',
      params: { type: 'object', properties: {}, required: [] },
      scopes: [],
      execute: async (_args, c) => {
        if (!K.reminders) return { ok: false, error: '提醒服务未启用' };
        const list = K.reminders.pending(c.chatKey);
        if (list.length === 0) return { ok: true, result: { reminders: [], note: '当前没有待触发的提醒。' } };
        return { ok: true, result: { reminders: list.map((r) => `- [${r.id}] ${new Date(r.dueAt).getMonth()+1}/${new Date(r.dueAt).getDate()} ${String(new Date(r.dueAt).getHours()).padStart(2,'0')}:${String(new Date(r.dueAt).getMinutes()).padStart(2,'0')}：${r.text}`) } };
      },
    });

    ctx.registerTool({
      id: 'cancel_reminder', name: '取消提醒', category: 'system', icon: '🗑️',
      description: '取消一个未触发的提醒。',
      params: { type: 'object', properties: { id: { type: 'string', description: '提醒 id' } }, required: ['id'] },
      scopes: [],
      execute: async (args) => {
        if (!K.reminders) return { ok: false, error: '提醒服务未启用' };
        if (!args.id) return { ok: false, error: '请提供提醒 id' };
        const cancelled = K.reminders.cancel(String(args.id));
        return cancelled ? { ok: true, result: { cancelled: true, id: String(args.id) } } : { ok: false, error: `没找到提醒 ${args.id}（可能已触发或 id 不对，用 list_reminders 查一下）` };
      },
    });

    ctx.registerTool({
      id: 'check_holiday', name: '查节日', category: 'system', icon: '🎉',
      description: '查今天/最近的中国法定与常见节日（含参考祝福语），用于节日主动问候。',
      params: { type: 'object', properties: { days: { type: 'number', description: '查最近几天（默认 7）' } }, required: [] },
      scopes: [],
      execute: async (args) => {
        const days = args.days != null ? Math.max(0, Number(args.days) || 0) : 7;
        return { ok: true, result: checkHoliday(days) };
      },
    });
  },
};
