// 03 · 配置系统：默认值 / BOM / 损坏备份 / deepMerge / 废弃键 / 迁移 / 滑条派生 / 原子写 / 脱敏
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefaultConfig, createConfig, deepMerge, sliderToTier, clampSliderPos,
  sanitizeConfigForApi, stripDerivedFlags,
} from '../src/kernel/config.js';

section('默认配置全量键抽查（SPEC §5.1）');
const defaults = buildDefaultConfig({ portOffset: 0, personaText: 'PERSONA' });
eq(defaults.api.maxRounds, 12, 'api.maxRounds=12');
eq(defaults.api.timeoutMs, 180000, 'api.timeoutMs=180s');
eq(defaults.api.video, false, 'api.video 默认关');
eq(defaults.server.port, 3210, 'server.port=3210');
eq(defaults.store.contextTier, 4, 'store.contextTier=4');
ok(!('contextSliderPos' in defaults.store), 'DEFAULT 不含 contextSliderPos（U-01：缺省 clamp 回 100）');
eq(defaults.store.peakSchedule.valley.sliderPos, 100, 'valley.sliderPos=100');
ok(!('start' in defaults.store.peakSchedule.valley), 'valley.start 已废弃剔除（R-21）');
eq(defaults.send.maxPerMinute, 80, 'send.maxPerMinute=80');
eq(defaults.send.maxPerHour, 500, 'send.maxPerHour=500');
eq(defaults.commandMute.command, '/安静', "commandMute.command='/安静'");
eq(defaults.persona.roleText, 'PERSONA', 'persona.roleText=人设资产');
const p2 = buildDefaultConfig({ portOffset: 100, personaText: '' });
eq(p2.server.port, 3310, 'profile=2 端口 3210+100');
eq(p2.onebot.wsUrl, 'ws://127.0.0.1:3101', 'onebot.wsUrl=3001+100');

section('deepMerge 语义（SPEC §5.0：对象递归 / 数组整体替换 / __replace__）');
eq(deepMerge({ a: { b: 1, c: 2 } }, { a: { b: 9 } }), { a: { b: 9, c: 2 } }, '对象递归合并');
eq(deepMerge({ a: [1, 2, 3] }, { a: [7] }), { a: [7] }, '数组整体替换');
eq(deepMerge({ a: { x: 1 } }, { a: { __replace__: { y: 2 } } }), { a: { y: 2 } }, '__replace__ 不递归');

section('滑条派生（notes/05 C-store-01：0-10=1档 / 10-20=2档 / 20-90=3档线性 / 90-100=4档）');
eq(clampSliderPos(undefined), 100, '缺省=100（U-01 终论）');
eq(clampSliderPos(150), 100, '超界钳到 100');
eq(sliderToTier(0), { contextTier: 1, randomPercent: 10 }, 'pos=0 → 1 档');
eq(sliderToTier(10), { contextTier: 1, randomPercent: 10 }, 'pos=10 → 1 档');
eq(sliderToTier(15), { contextTier: 2, randomPercent: 10 }, 'pos=15 → 2 档');
eq(sliderToTier(20), { contextTier: 2, randomPercent: 10 }, 'pos=20 → 2 档');
eq(sliderToTier(55), { contextTier: 3, randomPercent: 50 }, 'pos=55 → 3 档 50%（线性中点）');
eq(sliderToTier(90), { contextTier: 4, randomPercent: 100 }, 'pos=90 → 4 档');
eq(sliderToTier(100), { contextTier: 4, randomPercent: 100 }, 'pos=100 → 4 档');

section('读取链：BOM 剥离 / 损坏备份回默认 / 废弃键剔除 / 迁移幂等');
const dir = mktmp('qqa-cfg-');
fs.writeFileSync(path.join(dir, 'config.json'),
  JSON.stringify({ api: { model: 'm1', stream: true }, budget: 5, store: { atCount: 3, randomCount: 1 } }));
let cfg = createConfig({ dataDir: dir, defaults: structuredClone(defaults) });
cfg.load();
eq(cfg.get().api.model, 'm1', '用户键读入');
ok(!('stream' in cfg.get().api), '废弃键 api.stream 剔除');
ok(!('budget' in cfg.get()), '废弃键 budget 剔除');
ok(!('atCount' in cfg.get().store), '废弃键 store.atCount 剔除');

const dir2 = mktmp('qqa-cfg-');
fs.writeFileSync(path.join(dir2, 'config.json'), '\uFEFF' + JSON.stringify({ api: { model: 'bom' } }));
const cfg2 = createConfig({ dataDir: dir2, defaults: structuredClone(defaults) });
cfg2.load();
eq(cfg2.get().api.model, 'bom', 'BOM 剥离后正常解析');

const dir3 = mktmp('qqa-cfg-');
fs.writeFileSync(path.join(dir3, 'config.json'), '{broken json!!!');
const cfg3 = createConfig({ dataDir: dir3, defaults: structuredClone(defaults) });
cfg3.load();
eq(cfg3.get().api.model, '', '损坏文件回落默认');
const backups = fs.readdirSync(dir3).filter((f) => f.startsWith('config.json.corrupt-'));
eq(backups.length, 1, '损坏文件已备份为 config.json.corrupt-<ts>（事故兜底：不被后续整体写回抹掉）');

section('写回链：滑条唯一真相 / hasXxx 剥离 / 原子写');
const dir4 = mktmp('qqa-cfg-');
const cfg4 = createConfig({ dataDir: dir4, defaults: structuredClone(defaults) });
cfg4.load();
cfg4.update({ store: { contextSliderPos: 15 } });
eq(cfg4.get().store.contextTier, 2, 'sliderPos=15 派生 tier=2');
eq(cfg4.get().store.randomPercent, 10, 'sliderPos=15 派生 randomPercent=10');
cfg4.update({ store: { contextTier: 4 } }); // 接口直改 tier 不生效（C-store-01）
eq(cfg4.get().store.contextTier, 2, '直改 contextTier 被拒绝（只认 sliderPos）');
cfg4.update({ hasApiKey: true, api: { hasSomething: true } });
ok(!('hasApiKey' in JSON.parse(fs.readFileSync(path.join(dir4, 'config.json'), 'utf8'))), 'hasXxx 派生标记不落盘');
ok(!fs.existsSync(path.join(dir4, 'config.json.tmp')), '原子写不留 .tmp');
let notified = 0;
cfg4.onChange(() => notified++);
cfg4.update({ api: { temperature: 0.5 } });
eq(notified, 1, 'onChange 触发一次');
eq(cfg4.get().api.temperature, 0.5, '温度写入');

section('密钥回填（preserveSanitizedSecrets：脱敏回传不抹真 Key）');
const dir5 = mktmp('qqa-cfg-');
const cfg5 = createConfig({ dataDir: dir5, defaults: structuredClone(defaults) });
cfg5.load();
cfg5.update({ providers: [{ id: 'p1', name: 'P1', apiKey: 'sk-real' }] });
// 模拟前端：GET 脱敏后（apiKey 被删）改了 name 再回传
cfg5.update({ providers: [{ id: 'p1', name: 'P1 改名' }] });
eq(cfg5.get().providers[0].apiKey, 'sk-real', '回传缺 apiKey 时按 id 回填现值');
// 显式空串 = 真清除
cfg5.update({ providers: [{ id: 'p1', name: 'P1', apiKey: '' }] });
eq(cfg5.get().providers[0].apiKey, '', '显式空串真清除');

section('GET /api/config 脱敏（SPEC §5.2：删字段补 hasXxx，不置空串）');
const san = sanitizeConfigForApi({ api: { apiKey: 'sk-x', model: 'm' }, server: { token: 'T' }, dshProviderKeys: { a: 'k1' } });
ok(!('apiKey' in san.api), 'apiKey 被删除（非置空）');
eq(san.api.hasApiKey, true, '补 hasApiKey=true');
ok(!('token' in san.server), 'server.token 被删除（^token$ 裸键）');
eq(san.server.hasToken, true, '补 hasToken');
eq(san.dshProviderKeys, {}, 'dshProviderKeys 整体替换 {}');
eq(san.dshProviderKeyPresence, { a: true }, '补 dshProviderKeyPresence 布尔映射');
const noHas = sanitizeConfigForApi({ api: { apiKeyFrom: 'env' } });
eq(noHas.api.apiKeyFrom, 'env', 'apiKeyFrom 是来源标识不脱敏（/from$/ 排除）');
const stripped = stripDerivedFlags({ hasX: 1, api: { hasY: 2, model: 'm' } });
ok(!('hasX' in stripped) && !('hasY' in stripped.api) && stripped.api.model === 'm', 'stripDerivedFlags 删 hasXxx 保真值');

summary('03-config');
