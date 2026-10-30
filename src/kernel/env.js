// 环境解析：APP_ROOT 锚点、PROFILE 多实例、数据目录。
// 出处：SPEC §2.1（profile 词条）、§4.5（resolveDataDir 优先级）、F-017、§17.1（×100 端口偏移）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// APP_ROOT = 模块自身位置向上锚定，绝不用 process.cwd()——
// SPEC §7.1 装载流程 1：安装版快捷方式的起始位置是 <install>/，用 cwd 会静默加载 0 个且无日志。
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(HERE, '..', '..');

/**
 * PROFILE：环境变量 QQ_AGENT_PROFILE 指定实例编号。
 * SPEC §2.1：非 1 时数据目录变成 data-<n>/、所有端口整体 +100×n（用于同机多开多个 QQ 号）。
 * 偏移按 (n-1)*100 计算：n=1（缺省）→ 0 偏移、目录 data/；n=2 → +100、data-2/。
 */
export function resolveProfile(env = process.env) {
  const raw = parseInt(String(env.QQ_AGENT_PROFILE ?? ''), 10);
  const n = Number.isInteger(raw) && raw >= 1 ? raw : 1;
  return {
    n,
    suffix: n === 1 ? '' : `-${n}`,
    portOffset: (n - 1) * 100,
  };
}

/**
 * 数据目录优先级（SPEC §4.5）：QQ_AGENT_DATA_DIR 环境变量 > 项目内 data<后缀>。
 * （打包 exe 形态的"exe 旁目录 + %APPDATA% 旧数据搬回"在 electron/main.js 里做，M4。）
 */
export function resolveDataDir(env = process.env, appRoot = APP_ROOT) {
  const profile = resolveProfile(env);
  if (env.QQ_AGENT_DATA_DIR) return path.resolve(env.QQ_AGENT_DATA_DIR);
  return path.join(appRoot, `data${profile.suffix}`);
}
