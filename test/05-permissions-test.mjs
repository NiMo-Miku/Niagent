// 05 · 权限模型：11 scope / 三层策略 / deny 类不可放行 / headless ask=deny / 触达即审计
import { ok, eq, section, summary } from './helpers.mjs';
import { createPermissions } from '../src/kernel/permissions.js';

section('scope 清单（DSH §7.1：11 个）');
const pm = createPermissions({ log: {} });
const scopes = pm.scopes();
eq(Object.keys(scopes).length, 11, '11 个 scope');
ok(scopes['qq.send'] && scopes['net.raw'] && scopes['mcp.connect'], '关键 scope 在列');

section('捆绑默认 allow / 用户默认 ask');
eq(pm.check('reminders', 'qq.send', { kind: 'bundled' }).decision, 'allow', '捆绑 qq.send=allow');
eq(pm.check('my-plugin', 'qq.send', { kind: 'user' }).decision, 'ask', '用户 qq.send=ask');
eq(pm.check('my-plugin', 'fs.namespace', { kind: 'user' }).decision, 'allow', '用户 fs.namespace=allow');

section('deny 类不可运行时放行（net.raw 无 ask）');
eq(pm.check('any', 'net.raw', { kind: 'user' }).decision, 'deny', 'net.raw 用户 deny');
eq(pm.check('any', 'net.raw', { kind: 'bundled' }).decision, 'deny', 'net.raw 捆绑也 deny');
pm.setOverride('any', 'net.raw', 'allow');
eq(pm.check('any', 'net.raw', { kind: 'user' }).decision, 'deny', '管理员覆盖也放不开 net.raw（askable=false）');

section('捆绑特权白名单（外部 OneBot 传输无需执行进程）');
eq(pm.check('transport-onebot', 'proc.exec', { kind: 'bundled' }).decision, 'deny', 'transport-onebot 不可 proc.exec');
eq(pm.check('market', 'proc.exec', { kind: 'bundled' }).decision, 'deny', 'market 不可 proc.exec');
eq(pm.check('mcp-bridge', 'mcp.connect', { kind: 'bundled' }).decision, 'allow', 'mcp-bridge 可 mcp.connect');

section('管理员覆盖三层');
const pm2 = createPermissions({ log: {} });
pm2.setOverride('my-plugin', 'qq.send', 'deny');
eq(pm2.check('my-plugin', 'qq.send', { kind: 'user' }).decision, 'deny', '管理员 deny 压过默认 ask');
pm2.setOverride('my-plugin', 'qq.send', 'allow');
eq(pm2.check('my-plugin', 'qq.send', { kind: 'user' }).decision, 'allow', '管理员 allow 生效');

section('headless：ask=deny 且日志高亮（DSH §7.3：无人在场不放行）');
const warned = [];
const pmH = createPermissions({ log: { warn: (m) => warned.push(m) }, headless: true });
const v = pmH.check('my-plugin', 'qq.send', { kind: 'user' });
eq(v.decision, 'deny', 'headless 下 ask 按 deny');
ok(warned.some((w) => w.includes('headless')), '日志高亮 headless 拒绝');

section('触达即审计（每次 check 都留痕）');
const pm4 = createPermissions({ log: {} });
pm4.check('p1', 'qq.send', { kind: 'user' });    // ask
pm4.check('p1', 'fs.namespace', { kind: 'user' }); // allow
pm4.check('p1', 'net.raw', { kind: 'user' });    // deny
const audit = pm4.audit();
eq(audit.length, 3, '三次触达三条审计');
eq(audit[0].decision, 'ask', '第一条 ask');
eq(audit[1].decision, 'allow', '第二条 allow');
eq(audit[2].decision, 'deny', '第三条 deny');
ok(audit.every((a) => a.at && a.pluginId && a.scope), '审计记录含时间/插件/scope');

summary('05-permissions');
