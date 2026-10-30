import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { buildDefaultConfig, createConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { assertResettableDataDir, backupDataDir, openDataDir } from '../src/console/route-adapters.js';
import { completePendingDataReset } from '../src/kernel/data-reset.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const log = { error() {}, warn() {}, info() {}, recent: () => [], setLevel: () => 'info' };

section('R02 打开数据目录 DTO 与 spawn 失败');
const launched = openDataDir('C:/data', { spawn(_command, args, options) { return { unref() { ok(args[0] === 'C:/data' && options.detached, 'Explorer 使用目标目录和 detached'); } }; } });
eq(launched.ok, true, '打开数据目录成功 DTO');
try { await openDataDir('C:/data', { spawn() { throw new Error('Explorer 不可用'); } }); throw new Error('spawn 失败未抛出'); } catch (err) { eq(err.status, 500, 'spawn 失败返回 500'); }

section('R03 安全闸拒绝盘根与无标识目录');
const root = path.parse(process.cwd()).root;
try { assertResettableDataDir(root); throw new Error('盘根未被拒绝'); } catch (err) { eq(err.status, 400, '盘根返回 400'); }
const unrelated = mktmp('qqa-reset-unrelated-');
fs.writeFileSync(path.join(unrelated, 'keep.txt'), 'keep');
try { assertResettableDataDir(unrelated); throw new Error('无标识目录未被拒绝'); } catch (err) { eq(err.status, 400, '无标识目录返回 400'); }
eq(fs.readFileSync(path.join(unrelated, 'keep.txt'), 'utf8'), 'keep', '拒绝不触碰原目录');

section('R03 路由拒绝危险路径并返回 ok:false DTO');
const dangerousStatic = mktmp('qqa-reset-danger-static-');
fs.writeFileSync(path.join(dangerousStatic, 'index.html'), 'ok');
const dangerousConfigDir = mktmp('data-danger-config-');
const dangerousConfig = createConfig({ dataDir: dangerousConfigDir, defaults: buildDefaultConfig(), log });
dangerousConfig.load(); dangerousConfig.update({ server: { port: 0, token: 'danger-secret' } });
const dangerousNoops = { listEntries: () => [], promptSections: () => [], names: () => [], explain: () => ({}), todayUsage: () => ({}), listChats: () => [], listSummaries: () => [] };
const dangerousHttp = createHttpServer({ config: dangerousConfig, log, staticDir: dangerousStatic });
registerConsoleRoutes(dangerousHttp, { config: dangerousConfig, dataDir: unrelated, log, sessions: dangerousNoops, store: dangerousNoops, loader: dangerousNoops, orchestrator: { status: () => ({}) }, capability: dangerousNoops, registry: dangerousNoops });
const dangerousPort = await dangerousHttp.listen();
const dangerousResponse = await fetch(`http://127.0.0.1:${dangerousPort}/api/reset-data`, { method: 'POST', headers: { 'x-console-token': 'danger-secret' } });
const dangerousResult = await dangerousResponse.json();
eq(dangerousResponse.status, 400, '危险路径返回 400');
eq(dangerousResult.ok, false, '危险路径失败 DTO');
eq(fs.readFileSync(path.join(unrelated, 'keep.txt'), 'utf8'), 'keep', '路由拒绝不触碰原目录');
await dangerousHttp.close();

section('R03 备份失败具有原子性');
const atomicDir = mktmp('data-atomic-');
fs.writeFileSync(path.join(atomicDir, 'config.json'), '{}');
fs.writeFileSync(path.join(atomicDir, 'important.txt'), 'important');
try {
  backupDataDir(atomicDir, { cpSync() { throw new Error('磁盘写满'); } });
  throw new Error('备份失败未抛出');
} catch (err) { eq(err.message, '磁盘写满', '保留备份错误'); }
eq(fs.readFileSync(path.join(atomicDir, 'important.txt'), 'utf8'), 'important', '备份失败不删除源数据');

section('R02/R03 路由收束、备份、保留锁并提交待重启清理');
const dataDir = mktmp('data-route-reset-');
const staticDir = mktmp('qqa-reset-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'reset-secret' }, api: { apiKey: 'must-be-cleared', model: 'custom' } });
fs.writeFileSync(path.join(dataDir, 'payload.txt'), 'delete-me');
fs.writeFileSync(path.join(dataDir, 'qq-agent.lock'), String(process.pid));
let aborts = 0;
let closes = 0;
const orchestrator = { abortAll() { aborts++; }, status: () => ({}) };
const onebot = { async stop() { closes++; } };
const noops = { listEntries: () => [], promptSections: () => [], names: () => [], explain: () => ({}), todayUsage: () => ({}), listChats: () => [], listSummaries: () => [] };
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, dataDir, orchestrator, onebot, log, sessions: noops, store: noops, loader: noops, capability: noops, registry: noops });
const port = await http.listen();
const response = await fetch(`http://127.0.0.1:${port}/api/reset-data`, { method: 'POST', headers: { 'x-console-token': 'reset-secret' } });
const result = await response.json();
eq(response.status, 200, '重置请求已接受');
ok(result.ok && result.resetAccepted && !result.resetCompleted && result.restartRequired && result.message.includes('彻底退出并重新打开'), '200明确为已备份待重启，刷新不等于完成');
eq(aborts, 1, '先中止全部会话');
eq(closes, 1, '断开 OneBot');
ok(fs.existsSync(result.backupDir), '备份存在');
eq(fs.readFileSync(path.join(result.backupDir, 'payload.txt'), 'utf8'), 'delete-me', '备份包含原数据');
ok(fs.existsSync(path.join(dataDir, 'payload.txt')), '旧进程不删除仍被占用的数据');
eq(fs.readFileSync(path.join(dataDir, 'qq-agent.lock'), 'utf8'), String(process.pid), '保留实例锁直到正常退出');
eq(config.get().api.apiKey, 'must-be-cleared', '尚未重启不伪称内存已重置');
eq(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).api.model, 'custom', '尚未重启原配置完整保留');
await http.close();
try { completePendingDataReset({ dataDir, defaults: buildDefaultConfig() }); throw new Error('存活旧PID未被拒绝'); } catch (err) { ok(err.message.includes('旧进程仍在运行'), '真实PID仍存活时拒绝清理'); }
// Standalone adapter fixture has no child lifecycle. Only this completion unit
// injects a dead-PID verdict; 135 verifies real old-process exit and new boot.
completePendingDataReset({ dataDir, defaults: buildDefaultConfig(), isProcessAlive: () => false });
ok(!fs.existsSync(path.join(dataDir, 'payload.txt')), '新启动的完结阶段完整清理数据');
eq(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).api.model, '', '完结阶段原子写入默认配置');
ok(!fs.existsSync(dataDir + '.reset-pending.json'), '成功完结才移除待处理标记');
summary('32-m3-data-reset');
