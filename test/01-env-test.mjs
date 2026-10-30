// 01 · 环境解析：APP_ROOT / PROFILE / 数据目录
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT, resolveProfile, resolveDataDir } from '../src/kernel/env.js';

section('APP_ROOT 锚定（非 cwd）');
ok(APP_ROOT.endsWith(path.join('v0.5')), `APP_ROOT 应是仓库根，实际 ${APP_ROOT}`);
ok(fs.existsSync(path.join(APP_ROOT, 'package.json')), 'APP_ROOT 下应有 package.json');

section('PROFILE 解析（SPEC §2.1：非 1 → data-<n> + 端口 +100×n）');
eq(resolveProfile({}).n, 1, '缺省 profile=1');
eq(resolveProfile({}).suffix, '', 'profile=1 无后缀');
eq(resolveProfile({}).portOffset, 0, 'profile=1 无偏移');
eq(resolveProfile({ QQ_AGENT_PROFILE: '2' }).suffix, '-2', 'profile=2 → -2');
eq(resolveProfile({ QQ_AGENT_PROFILE: '2' }).portOffset, 100, 'profile=2 → +100');
eq(resolveProfile({ QQ_AGENT_PROFILE: '3' }).portOffset, 200, 'profile=3 → +200');
eq(resolveProfile({ QQ_AGENT_PROFILE: 'abc' }).n, 1, '非法值回 1');
eq(resolveProfile({ QQ_AGENT_PROFILE: '0' }).n, 1, '0 回 1');
eq(resolveProfile({ QQ_AGENT_PROFILE: '-5' }).n, 1, '负数回 1');

section('数据目录（SPEC §4.5：QQ_AGENT_DATA_DIR > 项目内 data<后缀>）');
const custom = mktmp();
eq(resolveDataDir({ QQ_AGENT_DATA_DIR: custom }), path.resolve(custom), '环境变量优先');
eq(resolveDataDir({}), path.join(APP_ROOT, 'data'), '默认项目内 data/');
eq(resolveDataDir({ QQ_AGENT_PROFILE: '2' }), path.join(APP_ROOT, 'data-2'), 'profile=2 → data-2/');

summary('01-env');
