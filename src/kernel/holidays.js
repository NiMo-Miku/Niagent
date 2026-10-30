// 节假日（纯本地计算，SPEC §8 T-28 check_holiday）。
// 只做公历固定日 + 常见节日的就近查询；法定调休不在本表（不联网、不调 LLM）。

const FIXED = [
  { m: 1, d: 1, name: '元旦', wish: '新年快乐' },
  { m: 2, d: 14, name: '情人节', wish: '情人节快乐' },
  { m: 3, d: 8, name: '妇女节', wish: '节日快乐' },
  { m: 3, d: 12, name: '植树节', wish: '' },
  { m: 4, d: 1, name: '愚人节', wish: '' },
  { m: 5, d: 1, name: '劳动节', wish: '劳动节快乐' },
  { m: 5, d: 4, name: '青年节', wish: '' },
  { m: 6, d: 1, name: '儿童节', wish: '儿童节快乐' },
  { m: 7, d: 1, name: '建党节', wish: '' },
  { m: 8, d: 1, name: '建军节', wish: '' },
  { m: 9, d: 10, name: '教师节', wish: '老师辛苦了' },
  { m: 10, d: 1, name: '国庆节', wish: '国庆快乐' },
  { m: 10, d: 31, name: '万圣节', wish: '' },
  { m: 11, d: 11, name: '双十一', wish: '' },
  { m: 12, d: 24, name: '平安夜', wish: '' },
  { m: 12, d: 25, name: '圣诞节', wish: '圣诞快乐' },
  { m: 12, d: 31, name: '跨年夜', wish: '' },
];

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function holidayOn(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hit = FIXED.find((x) => x.m === m && x.d === d);
  return hit ? { name: hit.name, greeting: hit.wish, type: 'common', date: dayKey(date) } : null;
}

export function upcomingHoliday(days = 7, from = new Date()) {
  const n = Math.max(0, Number(days) || 0);
  for (let i = 0; i <= n; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const hit = holidayOn(d);
    if (hit) return { ...hit, inDays: i };
  }
  return null;
}

export function checkHoliday(days = 7, now = new Date()) {
  const today = holidayOn(now);
  if (today) return { today, upcoming: null, note: `今天是${today.name}！${today.greeting ? today.greeting + '。' : ''}` };
  const upcoming = upcomingHoliday(days, now);
  if (upcoming && upcoming.inDays > 0) {
    return {
      today: null, upcoming,
      note: `今天不是节日。最近的是 ${upcoming.inDays} 天后的${upcoming.name}（${upcoming.date}）。`,
    };
  }
  return { today: null, upcoming: null, note: `今天不是节日，未来 ${days} 天内也没有常见节日。` };
}
