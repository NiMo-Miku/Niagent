// Development helpers reuse the production loader and market archive contracts.
// check never imports extension code. test deliberately executes trusted native JS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeManifest, pluginFingerprint, readManifest, resolveEntrySafe } from '../../src/kernel/plugin-loader.js';
import { collectPublishFiles, createStoredZip, MARKET_MAX_ZIP_BYTES } from '../../bundled/market/client.js';

const PUBLIC_FILE = /\.(?:[cm]?js|json|md|txt|html|css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp3|wav|ogg|mp4|webm)$/i;
const PRIVATE_PART = /^(?:\.git|\.env(?:\..*)?|node_modules|data(?:-.*)?|logs?|dist|coverage|\.qa-local|\.cache|credentials?|secrets?)$/i;
const PRIVATE_FILE = /^(?:account|setting|settings|config|plugin-authorizations|community)\.(?:json|key)$/i;
const SECRET_KEY = /(?:api.?key|access.?token|authorization|password|private.?key|secret|cookie|^token$)/i;
const SYNTHETIC = /^(?:Bearer\s+)?(?:test[-_:]|fixture[-_:]|example[-_:]|YOUR_|REPLACE_ME|<[^>]+>|\$\{[^}]+\})/i;
const codeOf = (error) => String(error?.message ?? error);
export const TEST_NOTICE = 'test executes trusted native JavaScript in a separate process and temporary data directory. Host HTTP and QQ sends are offline fixtures; this is not a Node security sandbox.';

function secretProblem(value, prefix = '', schema = {}) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    const label = prefix ? `${prefix}.${key}` : key;
    const rule = (Array.isArray(value) ? schema.items : schema.properties?.[key]) ?? {};
    const declaredSecret = rule.secret === true || rule.sensitive === true || rule.format === 'password';
    if ((declaredSecret || SECRET_KEY.test(key) && !/^(?:has[A-Z]|.*From$)/.test(key)) && item !== '' && item != null && item !== false
      && (typeof item !== 'string' || !SYNTHETIC.test(item))) return label;
    const nested = secretProblem(item, label, rule); if (nested) return nested;
  }
  return null;
}

function publicFiles(dir) {
  // Fail closed instead of silently filtering: this stays byte-for-byte consistent
  // with community publication, which collects the same directory again.
  const files = collectPublishFiles(dir);
  const ownConfigSchema = readManifest(dir).raw?.configSchema ?? {};
  for (const file of files) {
    const parts = file.name.split('/');
    if (parts.some(part => PRIVATE_PART.test(part)) || PRIVATE_FILE.test(parts.at(-1)) || !PUBLIC_FILE.test(file.name)) {
      throw new Error(`发布目录含运行数据、私有文件或未支持的公开资产：${file.name}；请移出该目录后重试`);
    }
    if (/\.(?:json|[cm]?js|md|txt|html)$/i.test(file.name)) {
      const source = file.data.toString('utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[a-zA-Z0-9]{24,}\b/.test(source)) throw new Error(`检测到疑似密钥：${file.name}；没有写出 ZIP`);
      if (/\.json$/i.test(file.name)) {
        let raw; try { raw = JSON.parse(source.replace(/^\uFEFF/, '')); } catch { continue; }
        // configSchema describes fields, it is not a credential value. Cases may
        // contain only explicitly synthetic test/fixture/example placeholders.
        const isManifest = ['skill.json', 'plugin.json'].includes(file.name);
        const scan = isManifest ? { settings: raw.settings } : raw;
        const schema = isManifest
          ? { properties: { settings: { properties: ownConfigSchema } } }
          : file.name === 'extension.check.json'
            ? { properties: { cases: { items: { properties: { config: { properties: ownConfigSchema } } } } } }
            : {};
        const field = secretProblem(scan, '', schema);
        if (field) throw new Error(`公开文件中含非空敏感值：${file.name} 的 ${field}；请改为空值或明确的 test-/fixture-/example- 占位`);
      }
    }
  }
  return files;
}

export function checkExtension(directory, { syntax = true } = {}) {
  const dir = path.resolve(directory), issues = [];
  const add = (level, code, message, file) => issues.push({ level, code, message, ...(file ? { file } : {}) });
  let manifest = null, manifestFile = null, files = [];
  try {
    if (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) throw new Error('扩展根目录必须是普通目录，不能是符号链接');
    const read = readManifest(dir); manifestFile = read.file;
    if (read.error || !read.raw) throw new Error(read.error ?? '找不到 skill.json / plugin.json');
    if (typeof read.raw !== 'object' || Array.isArray(read.raw)) throw new Error('清单必须是 JSON 对象');
    const normalized = normalizeManifest(structuredClone(read.raw), path.basename(dir)); manifest = normalized.manifest;
    for (const issue of normalized.problems) add(issue.level, 'MANIFEST', issue.msg, manifestFile);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(manifest.id)) add('error', 'MARKET_ID', '社区 id 必须是 1–64 位字母、数字、点、下划线或短横线', manifestFile);
    if (!read.raw.id) add('error', 'EXPLICIT_ID', '请在清单明确声明 id，保证移动或解压后的身份一致', manifestFile);
    if (fs.existsSync(path.join(dir, 'skill.json')) && fs.existsSync(path.join(dir, 'plugin.json'))) add('error', 'AMBIGUOUS_MANIFEST', '目录同时包含 skill.json 与 plugin.json；只保留与 kind 相符的一份清单');
    if (manifestFile !== `${manifest.kind}.json`) add('error', 'MANIFEST_KIND', '清单文件名必须与 kind 相符', manifestFile);
    const entry = resolveEntrySafe(dir, manifest.entry);
    if (entry.error) add('error', 'ENTRY', entry.error, manifest.entry);
    pluginFingerprint(dir); // Production symlink, depth, file count and byte limits.
    files = collectPublishFiles(dir);
    const permissions = new Set(manifest.permissions.map(item => item === 'web_fetch' ? 'net.outbound' : item));
    const schema = manifest.configSchema;
    for (const key of Object.keys(manifest.settings)) if (!Object.hasOwn(schema, key)) add('warning', 'UNDECLARED_SETTING', `settings.${key} 不在 configSchema 中，原生 ctx.config.get 无法读取`, manifestFile);
    if (manifest.legacy) add('warning', 'LEGACY', '此清单通过 compat-04 加载；新扩展应使用原生 0.5 合同', manifestFile);
    for (const file of files.filter(item => /\.[cm]?js$/i.test(item.name))) {
      const source = file.data.toString('utf8');
      if (!manifest.legacy) {
        if (/\b(?:ctx|api|sdk)\.log\s*\(/.test(source) || /\b(?:const|let|var)?\s*log\s*=\s*(?:ctx|api|sdk)\.log\b(?!\s*(?:\.|\[|\?\.))/.test(source) && /\blog\s*\(/.test(source)) add('error', 'LEGACY_LOG', '原生 ctx.log 是对象，请使用 ctx.log.info/warn/error；旧式技能需明确 compat:"04"', file.name);
        if (/\b(?:ctx|context|execution)\.sender\b/.test(source)) add('error', 'LEGACY_SENDER', '原生执行上下文使用 context.send，不能使用 0.4 context.sender', file.name);
        if (/\bparameters\s*:/.test(source) && /registerTool\s*\(/.test(source)) add('error', 'LEGACY_PARAMETERS', '原生工具参数 schema 字段是 params，parameters 不会参与生产参数校验', file.name);
        if (/\bexecute\s*\(\s*(?:ctx|context|execution)\s*,/.test(source)) add('error', 'LEGACY_ARGUMENT_ORDER', '原生工具 execute(args, context)，请核对参数顺序', file.name);
      }
      if (/\.http\.fetch\s*\(/.test(source) && !permissions.has('net.outbound')) add('warning', 'NETWORK_PERMISSION', '源码使用 ctx.http.fetch，但清单未声明 net.outbound', file.name);
      if (/\.(?:sendImage|sendTextBatch|sendSegments)\s*\(/.test(source) && !permissions.has('qq.send')) add('warning', 'SEND_PERMISSION', '源码调用发送服务，但清单未声明 qq.send', file.name);
      if (/\b(?:globalThis\.)?fetch\s*\(/.test(source) && !/\.http\.fetch\s*\(/.test(source)) add('warning', 'RAW_FETCH', '原生 fetch 绕过宿主权限与离线夹具，请使用 ctx.http.fetch', file.name);
      if (syntax) {
        // Explicit input type matches the loader's module contract, independent
        // of the caller directory/package.json and Node syntax auto-detection.
        const result = spawnSync(process.execPath, ['--input-type=' + (/\.cjs$/i.test(file.name) ? 'commonjs' : 'module'), '--check'], { input: source, encoding: 'utf8', timeout: 5000, windowsHide: true, env: childEnv() });
        if (result.error) add('error', 'CHECK_UNAVAILABLE', `语法检查进程不可用（${result.error.code ?? '无法启动'}），尚未验证此文件语法；请在允许 Node 子进程的环境重试`, file.name);
        else if (result.status !== 0) add('error', 'SYNTAX', 'JavaScript 语法检查失败；请检查括号、导出与 await 位置', file.name);
      }
    }
    try { publicFiles(dir); } catch (error) { add('error', 'PUBLISH_HYGIENE', codeOf(error)); }
  } catch (error) { add('error', 'CHECK', codeOf(error)); }
  return { ok: !issues.some(issue => issue.level === 'error'), mode: 'static', executed: false, directory: dir, id: manifest?.id ?? null, manifestFile, kind: manifest?.kind ?? null, entry: manifest?.entry ?? null, files: files.map(file => file.name), issues,
    note: '静态检查不导入或运行扩展。启发式提示不等于完整源码分析；请继续执行可信代码自检并人工检查发布文件。' };
}

export function packExtension(directory, output) {
  const checked = checkExtension(directory);
  if (!checked.ok) return { ...checked, command: 'pack' };
  const dir = path.resolve(directory), out = path.resolve(output), relative = path.relative(dir, out);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('--out 必须在扩展目录外，避免 ZIP 自包含和社区发布内容不一致');
  const files = publicFiles(dir), zip = createStoredZip(files);
  if (zip.length > MARKET_MAX_ZIP_BYTES) throw new Error('安装包超过生产社区 8MB 上限');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Exclusive output protects an existing release from accidental overwrite.
  fs.writeFileSync(out, zip, { flag: 'wx' });
  return { ok: true, command: 'pack', id: checked.id, file: out, bytes: zip.length, sha256: crypto.createHash('sha256').update(zip).digest('hex'), files: files.map(file => file.name), issues: checked.issues,
    note: '使用生产社区相同文件集合和 ZIP 规则；没有上传社区。请人工复查公开文件，静态扫描无法识别任意文本中的全部秘密。' };
}

function childEnv() {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'PATH', 'PATHEXT', 'HOME', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
  env.ELECTRON_RUN_AS_NODE = '1'; return env;
}

function runCase(directory, definition, timeoutMs) {
  return new Promise(resolve => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-agent-extension-check-'));
    const worker = fileURLToPath(new URL('./extension-dev-worker.mjs', import.meta.url));
    const child = fork(worker, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true, env: childEnv(), execArgv: [] });
    let settled = false, noiseBytes = 0, outcome = null;
    const finish = value => { if (settled) return; settled = true; outcome = value; clearTimeout(timer); child.kill(); };
    const cleanup = () => {
      if (fs.existsSync(tempRoot)) {
        const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(tempRoot));
        if (fs.lstatSync(tempRoot).isSymbolicLink() || !path.basename(tempRoot).startsWith('qq-agent-extension-check-') || !relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('自检临时目录身份已改变，拒绝递归清理');
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    };
    const timer = setTimeout(() => finish({ ok: false, name: definition.name ?? 'unnamed', errors: [`自检超过 ${timeoutMs}ms，已停止执行进程`] }), timeoutMs);
    // Extension logs never pollute --json, and unlimited logs cannot fill memory.
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { noiseBytes += chunk.length; if (noiseBytes > 1024 * 1024) finish({ ok: false, name: definition.name ?? 'unnamed', errors: ['扩展输出超过 1MB，自检已停止'] }); });
    child.on('message', value => finish(value));
    child.on('error', error => finish({ ok: false, name: definition.name ?? 'unnamed', errors: [codeOf(error)] }));
    child.on('close', (code, signal) => {
      if (!settled) finish({ ok: false, name: definition.name ?? 'unnamed', errors: [`自检执行进程提前退出（${signal ?? code}）`] });
      try { cleanup(); } catch (error) { outcome.ok = false; outcome.errors = [...(outcome.errors ?? []), codeOf(error)]; }
      resolve(outcome);
    });
    child.send({ directory, definition, tempRoot }, error => { if (error) finish({ ok: false, name: definition.name ?? 'unnamed', errors: [codeOf(error)] }); });
  });
}

export async function testExtension(directory, caseFile) {
  const checked = checkExtension(directory);
  if (!checked.ok) return { ok: false, command: 'test', check: checked, cases: [], notice: TEST_NOTICE };
  const suite = JSON.parse(fs.readFileSync(caseFile, 'utf8').replace(/^\uFEFF/, ''));
  if (suite.version !== 1 || !Array.isArray(suite.cases) || !suite.cases.length || suite.cases.length > 50) throw new Error('case 必须是 {version:1,cases:[...]}，含 1–50 个用例');
  const cases = [];
  for (const definition of suite.cases) {
    if (!definition || typeof definition !== 'object' || !definition.expect || typeof definition.expect !== 'object') throw new Error('每个 case 必须含 expect，避免没有断言的假通过');
    const assertions = new Set(['status', 'ok', 'result', 'resultIncludes', 'errorIncludes', 'results', 'sends', 'storage', 'sendCount', 'httpCount']);
    if (!Object.keys(definition.expect).length || Object.keys(definition.expect).some(key => !assertions.has(key))) throw new Error('expect 必须包含有效断言；请核对字段拼写');
    for (const [key, value] of Object.entries(definition.expect)) {
      const valid = key === 'result'
        || key === 'ok' && typeof value === 'boolean'
        || ['status', 'resultIncludes', 'errorIncludes'].includes(key) && typeof value === 'string' && value.length > 0
        || ['results', 'sends'].includes(key) && Array.isArray(value)
        || key === 'storage' && value !== null && typeof value === 'object' && !Array.isArray(value)
        || ['sendCount', 'httpCount'].includes(key) && Number.isSafeInteger(value) && value >= 0;
      if (!valid) throw new Error(`expect.${key} 的断言值类型无效；请核对字符串、布尔值、数组、对象或非负整数合同`);
    }
    const timeoutMs = Math.min(30_000, Math.max(1000, Number(definition.timeoutMs) || 10_000));
    cases.push(await runCase(path.resolve(directory), definition, timeoutMs));
  }
  return { ok: cases.every(item => item.ok), command: 'test', id: checked.id, cases, notice: TEST_NOTICE };
}
