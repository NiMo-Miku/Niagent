import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mktmp, eq, ok, section, summary } from './helpers.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ui/panels/manifest.json'), 'utf8'));
section('八个 panel 静态资源');
// 面板数量随功能增长，写死会在新增面板时误报；改为校验 id 唯一 + 下限。
eq(new Set(manifest.panels.map((p) => p.id)).size, manifest.panels.length, '面板 id 无重复');
ok(manifest.panels.length >= 8, `manifest 至少含 8 个核心面板（实际 ${manifest.panels.length}）`);
for (const p of manifest.panels) for (const f of ['index.html','panel.js','style.css']) ok(fs.existsSync(path.join(root, 'ui/panels', p.id, f)), `${p.id}/${f}`);
section('PanelRegistry path allowlist');
const registryCode = fs.readFileSync(path.join(root, 'ui/shell/panel-registry.js'), 'utf8'); ok(registryCode.includes('encodeURIComponent(definition.id)') && registryCode.includes('definition.entry'), 'registry uses registered id path');
const rpcCode = fs.readFileSync(path.join(root, 'ui/shell/rpc-bridge.js'), 'utf8');
ok(rpcCode.includes('event.source===this.frame.contentWindow'), 'source binding'); ok(rpcCode.includes('message.meta?.nonce===this.nonce'), 'nonce binding'); ok(rpcCode.includes('this.allowed(method,path)'), 'path allowlist'); ok(rpcCode.includes('window.removeEventListener'), 'unmount listener cleanup');
const clientCode = fs.readFileSync(path.join(root, 'ui/panels/panel-client.js'), 'utf8'); ok(!clientCode.includes('localStorage') && !clientCode.includes('token'), 'panel does not receive token');
summary('30-m3-panels-contract');
