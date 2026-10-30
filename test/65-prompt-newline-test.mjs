// 65 · prompt 拼接的换行语义：不得用字面 \n 冒充换行。
//
// 踩坑记录：kernel.js 的 memory.consolidate prompt 曾写成 `].join('\\n')`（双反斜杠），
// 于是每条规则之间是"反斜杠 + n"两个字符而不是真换行。代码照常运行、不报错，
// 但发给模型的 prompt 被压成一行带 \n 字面量，直接拉低整理质量——静默劣化，最难发现。
//
// 本测试按字节判断（cat -A 口径）：源码里 join('\n') 是 1 个反斜杠（正确），
// join('\\n') 是 2 个（错误）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createMemoryStore, createMemoryConsolidator, extractJsonObject } from '../src/kernel/memory.js';
import { createChatStore } from '../src/kernel/store.js';
import { createKernel } from '../src/kernel/kernel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', 'dist', 'data', '.git'].includes(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(full);
  }
  return out;
};

console.log('=== A. 全库无字面 \\n 冒充换行 ===');
{
  // 关键区分（JS 源码层面）：
  //   '\n'  → 源码含 1 个反斜杠 → JS 求值后是【真换行】✅
  //   '\\n' → 源码含 2 个反斜杠 → JS 求值后是【字面 \n】❌（prompt 会被压成一行）
  // 因此按"源码里紧跟 n 之前的连续反斜杠个数"判断：1 个正确，2 个及以上是 bug。
  const offenders = [];
  let checked = 0;
  for (const file of [...walk(path.join(root, 'src')), ...walk(path.join(root, 'bundled')), ...walk(path.join(root, 'scripts'))]) {
    const rel = path.relative(root, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      // 匹配 join('<若干反斜杠>n') 形式
      const m = /join\((['"])(\\*)n\1\)/.exec(line);
      if (!m) return;
      checked += 1;
      if (m[2].length >= 2) offenders.push(`${rel}:${i + 1}  源码含 ${m[2].length} 个反斜杠 → 求值后是字面 \\n  ${line.trim().slice(0, 60)}`);
    });
  }
  assert.equal(offenders.length, 0, `存在字面 \\n 冒充换行（会把 prompt 压成一行）：\n  ${offenders.join('\n  ')}`);
  console.log(`✓ 检查 ${checked} 处 join('\\n') 拼接，反斜杠数均为 1（求值为真实换行）`);
}

console.log('=== B. 记忆整理 prompt 结构正确（且含关键约束）===');
{
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-prompt65-'));
  try {
    const memory = createMemoryStore({ dataDir, log: {} }), store = createChatStore({ dataDir, log: {} });
    memory.append('group:1', { userId: '123456', name: '旧成员', content: '仍有用的长期事实' });
    for (let i = 0; i < 45; i++) store.appendIncoming('group:1', { senderId: '654321', senderName: '新成员', text: `真实发言${i}` });
    const requests = [];
    const service = createMemoryConsolidator({ cfg: () => ({ api: { model: 'fixture' }, memory: { maxImpressionsPerMember: 3 } }), memory, store, log: {}, callLLM: async (args) => {
      requests.push(args.messages);
      const input = JSON.parse(args.messages[1].content.split('\n').at(-1));
      return { message: { content: JSON.stringify({ impressions: input.impressions.length ? input.impressions : ['只根据真实发言生成'] }) }, usage: {} };
    } });
    const result = await service({ chatKey: 'group:1', create: true, userIds: ['123456', '654321'] });
    const oldPrompt = requests[0][1].content, newPrompt = requests[1][1].content;
    assert.match(oldPrompt, /不得增加事实或条数/, '整理禁止新增事实和印象条数');
    assert.match(oldPrompt, /合并重复.*删除过时或空洞/, '整理仅合并重复、删除过时或空洞内容');
    for (const prompt of [oldPrompt, newPrompt]) {
      assert.match(prompt, /每条最多120字/, '印象长度上限120字');
      assert.match(prompt, /最多3条/, '配置的每人条数上限进入真实请求');
      assert.match(prompt, /只输出 JSON/, '模型只能输出JSON');
      assert.ok(prompt.split('\n').length >= 3, '真实提示包含多行');
      assert.equal(prompt.includes('\\n'), false, '真实提示不含字面反斜杠n冒充换行');
    }
    assert.match(newPrompt, /只根据.*最近的发言.*不要编造/, '新建必须依据发言且不得编造事实');
    const input = JSON.parse(newPrompt.split('\n').at(-1));
    assert.equal(input.messages.length, 40, '新建只取该成员最近40条发言');
    assert.equal(input.messages[0].text, '真实发言5'); assert.equal(input.messages.at(-1).text, '真实发言44');
    assert.deepEqual(result.members.map(({ userId, name }) => ({ userId, name })), [{ userId: '123456', name: '旧成员' }, { userId: '654321', name: '新成员' }], '整理保留真实身份');
    console.log('✓ 实际模型请求保留事实、取样与容量约束，且含真实换行');
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
}

console.log('=== C. 真实 loader 装载默认记忆插件并随停用撤销能力 ===');
{
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-prompt65-plugin-'));
  let kernel;
  try {
    fs.cpSync(path.join(root, 'src'), path.join(appRoot, 'src'), { recursive: true });
    fs.cpSync(path.join(root, 'bundled', 'memory-service'), path.join(appRoot, 'bundled', 'memory-service'), { recursive: true });
    fs.cpSync(path.join(root, 'bundled', 'llm-dialects'), path.join(appRoot, 'bundled', 'llm-dialects'), { recursive: true });
    fs.copyFileSync(path.join(root, 'package.json'), path.join(appRoot, 'package.json'));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(appRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: path.join(appRoot, 'data') },
      transport: { start() {}, stop() {}, actions: {} }, fetchImpl: async () => { throw new Error('65 禁止外部网络'); },
      priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true }) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
    });
    kernel.config.update({ api: { model: 'fixture' }, telemetry: { enabled: false }, proactive: { enabled: false } });
    assert.equal(kernel.capability.has('memory.consolidate'), false, '默认实现由插件加载拥有');
    await kernel.loader.loadAll(); await kernel.services.start();
    const selected = kernel.capability.providers('memory.consolidate')[0];
    assert.equal(selected.ownerId, 'memory-service'); assert.equal(typeof selected.provider, 'function');
    assert.equal(kernel.capability.options('memory.consolidate', 'memory-service').default, true);
    assert.equal(kernel.services.get('memory.consolidate'), selected.provider, '宿主运行实际整理函数');
    assert.deepEqual((await selected.provider({ chatKey: 'group:65' })).members, [], '无目标时真实服务不造假档、不发模型请求');
    await kernel.loader.setEnabled('memory-service', false); await kernel.services.refresh();
    assert.equal(kernel.capability.has('memory.consolidate'), false); assert.equal(kernel.services.get('memory.consolidate'), undefined);
  } finally {
    await kernel?.stop();
    assert.equal(path.dirname(path.resolve(appRoot)), path.resolve(os.tmpdir()));
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
  assert.deepEqual(extractJsonObject('```json\n{"impressions":["保留"]}\n```'), { impressions: ['保留'] }, '实际解析器容忍markdown代码块');
  assert.throws(() => extractJsonObject('{invalid json}'), /JSON|Unexpected|Unexpected token|Expected/);
  console.log('✓ 能力由 memory-service 注册并撤销，实际服务与输出解析容错到位');
}

console.log('\n✓ 65 prompt 换行语义：全部通过');
