// 存储：内核仓目录约定 + 插件命名空间 KV。
// 目录布局以 SPEC §12.1 为准（messages/ 而非 archives/——用户已批 A-3：存量兼容优先）。
// M0 只落骨架：目录创建 + 插件命名空间；memory/sessions/messages/stickers/reminders 仓在 M1/M2 实现。
import fs from 'node:fs';
import path from 'node:path';

// SPEC §12.1 data/ 目录树（0.5 必须接住的存量布局）
export const DATA_DIRS = ['logs', 'messages', 'memory', 'sessions', 'stickers', 'plugins'];

export function createStorage({ dataDir, log = console }) {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const d of DATA_DIRS) fs.mkdirSync(path.join(dataDir, d), { recursive: true });

  // 插件命名空间：data/plugins/<id>/（DSH §10.2）。互访必须走能力；卸载默认保留数据。
  function namespace(pluginId) {
    const dir = path.join(dataDir, 'plugins', pluginId);
    const kvFile = path.join(dir, 'kv.json');
    const readKv = () => {
      try {
        const raw = fs.readFileSync(kvFile, 'utf8');
        return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw); // 剥 BOM
      } catch { return {}; }
    };
    return {
      dir,
      ensure() { fs.mkdirSync(dir, { recursive: true }); },
      get(key) { return readKv()[key]; },
      set(key, value) {
        const kv = readKv();
        kv[key] = value;
        fs.mkdirSync(dir, { recursive: true });
        const tmp = kvFile + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(kv, null, 2), 'utf8');
        fs.renameSync(tmp, kvFile); // 原子写
        return value;
      },
      delete(key) {
        const kv = readKv();
        delete kv[key];
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(kvFile, JSON.stringify(kv, null, 2), 'utf8');
        return true;
      },
    };
  }

  return {
    dataDir,
    namespace,
    ensureDirs() { for (const d of DATA_DIRS) fs.mkdirSync(path.join(dataDir, d), { recursive: true }); },
  };
}
