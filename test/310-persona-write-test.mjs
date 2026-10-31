// persona.write / persona.read 插件能力端到端：真实 config/permissions/loader/sdk，
// 离线运行（无内核进程、无 HTTP、无外呼）。覆盖验收门：写入→personaForChat 生效、
// 清字段恢复全局、越权 403、超长 400、headless ask=deny、审计不含正文、__replace__ 删键、旧条目保留。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bus } from '../src/kernel/bus.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createSdkAccess } from '../src/kernel/sdk-services.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { createPersonaWriter } from '../src/kernel/persona-write.js';
import { createPersonaTemplateController } from '../src/console/persona-templates.js';
import { personaForChat } from '../src/kernel/persona.js';

function buildHarness({ headless }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), headless ? 'qqa-persona-310h-' : 'qqa-persona-310-'));
  const dataDir = path.join(root, 'data');
  for (const dir of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  const stateKey = '__persona310_' + Math.random().toString(36).slice(2);
  const state = globalThis[stateKey] = {};
  const infos = [], warns = [];
  const log = { info: (value) => infos.push(String(value)), warn: (value) => warns.push(String(value)), error() {}, child() { return this; } };
  const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
  const bus = new Bus(log);
  const statusEvents = [];
  bus.on('status', (payload) => statusEvents.push(payload), { internal: true });
  const permissions = createPermissions({ dataDir, log, bus, headless });
  const capabilities = createCapabilityRegistry({ log });
  const registry = createToolRegistry({ permissions, capabilities, log, bus });
  const scheduler = createScheduler({ log });
  const storage = createStorage({ dataDir, log });
  const templates = createPersonaTemplateController({ config, personaText: '出厂人设正文' });
  const personaWriter = createPersonaWriter({ config, log, bus, templates: () => templates.list().templates });
  // 与 kernel.js 相同的 facets 装配（审计身份取自 SDK 消费者上下文）。
  const sdk = createSdkAccess({ config, permissions, bus, loaderOf: () => loader, facets: {
    'persona.write': Object.freeze({
      write(input = {}) { return personaWriter.write(input, sdk.consumerIdentity()); },
      select(input = {}) { return personaWriter.select(input, sdk.consumerIdentity()); },
    }),
    'persona.read': Object.freeze({ read: () => personaWriter.read(), resolve: (chatKey) => personaWriter.resolve(chatKey) }),
  } });
  let loader;
  loader = createPluginLoader({ appRoot: root, log, bus, registry, capabilityRegistry: capabilities, permissions, scheduler, storage, config, sdkHost: sdk });
  function plugin(kind, id, manifest, setup) {
    const dir = path.join(root, kind, id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, ...manifest }));
    fs.writeFileSync(path.join(dir, 'index.js'), `export default {setup(ctx){globalThis[${JSON.stringify(stateKey)}][ctx.id]=ctx;${setup ?? ''}}};`);
    return dir;
  }
  plugin('skills', 'persona-writer', { permissions: ['persona.write', 'persona.read'] });
  plugin('skills', 'persona-reader', { permissions: ['persona.read'] });
  plugin('skills', 'persona-undeclared', { permissions: [] });
  plugin('bundled', 'persona-bundled', { permissions: ['persona.write', 'persona.read'] });
  const grant = (id, scope, decision = 'allow') => assert.equal(permissions.setOverride(id, scope, decision, { fingerprint: loader.hostEntry(id).fingerprint }), true);
  async function start() {
    await loader.loadAll({ reason: 'test' });
    return Object.fromEntries(Object.keys(state).map((id) => [id, state[id]]));
  }
  async function stop() {
    loader.stopAll(); scheduler.stop(); permissions.close();
    delete globalThis[stateKey];
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
  return { root, dataDir, config, bus, permissions, infos, statusEvents, grant, start, stop, templates };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) { const end = Date.now() + 2000; while (!predicate()) { assert.ok(Date.now() < end, '权限请求未就绪'); await sleep(5); } }

// ---- 常规模式（headless:false，走 ask 流程）----
{
  const h = buildHarness({ headless: false });
  try {
    const ctx = await h.start();
    const writer = ctx['persona-writer'], reader = ctx['persona-reader'], bundled = ctx['persona-bundled'];
    assert.ok(writer && reader && bundled && ctx['persona-undeclared']);

    console.log('· 用户插件 ask 授权后写全局人设：落盘+审计不含正文');
    const pendingWrite = writer.capability('persona.write').write({ chatKey: null, fields: { roleText: '全局人设甲', customRules: ' 附加规则甲 ' } });
    await until(() => h.permissions.pending().some((item) => item.pluginId === 'persona-writer' && item.scope === 'persona.write'));
    const request = h.permissions.pending().find((item) => item.pluginId === 'persona-writer');
    assert.equal(h.permissions.resolveAsk(request.id, 'once').ok, true);
    const globalResult = await pendingWrite;
    h.grant('persona-writer', 'persona.write'); // once 仅覆盖单次调用；后续用例改为持久授权
    assert.deepEqual({ scope: globalResult.scope, applied: globalResult.applied, effective: globalResult.effective }, { scope: 'global', applied: ['roleText', 'customRules'], effective: true });
    assert.equal(h.config.get().persona.roleText, '全局人设甲');
    assert.equal(h.config.get().persona.customRules, '附加规则甲');
    assert.equal(h.config.get().persona.botName, '小鲸鱼'); // 白名单外字段不受影响
    assert.ok(fs.readFileSync(path.join(h.dataDir, 'config.json'), 'utf8').includes('全局人设甲'));
    const audit = h.infos.find((line) => line.includes('[persona.write]') && line.includes('全局'));
    assert.ok(audit?.includes('persona-writer') && audit.includes('roleText'), audit);
    assert.ok(!h.infos.some((line) => line.includes('全局人设甲')), '审计日志不得包含正文');
    assert.ok(h.statusEvents.some((event) => event.configUpdated === true && event.personaByChatUpdated === undefined));

    console.log('· 会话级写入：personaUnified=false 时 personaForChat 下轮即用新人设');
    h.config.update({ personaUnified: false });
    const chatResult = await writer.capability('persona.write').write({ chatKey: 'group:123', fields: { roleText: '跑团人设', customRules: '骰规' } });
    assert.equal(chatResult.effective, true);
    const saved = h.config.get().personaByChat['group:123'];
    assert.equal(saved.roleText, '跑团人设');
    assert.equal(personaForChat(h.config.get(), 'group:123').roleText, '跑团人设');
    assert.equal(personaForChat(h.config.get(), 'group:123').customRules, '骰规');
    assert.equal(personaForChat(h.config.get(), 'group:456').roleText, '全局人设甲'); // 其他会话仍用全局
    assert.ok(h.statusEvents.some((event) => event.configUpdated === true && event.personaByChatUpdated === true));

    console.log('· 空串/纯空白=清除：删键恢复全局；清空全部字段则条目整体移除');
    await writer.capability('persona.write').write({ chatKey: 'group:123', fields: { roleText: '   ', customRules: null } });
    assert.equal(h.config.get().personaByChat['group:123']?.roleText, undefined);
    assert.equal(h.config.get().personaByChat['group:123']?.customRules, undefined);
    assert.equal(personaForChat(h.config.get(), 'group:123').roleText, '全局人设甲');
    await writer.capability('persona.write').write({ chatKey: 'group:123', fields: { roleText: '临时' } });
    await writer.capability('persona.write').write({ chatKey: 'group:123', fields: { roleText: '' } });
    assert.equal(Object.hasOwn(h.config.get().personaByChat, 'group:123'), false, '空条目应从映射移除');
    assert.equal(h.config.get().persona.roleText, '全局人设甲'); // 全局人设不被会话级清除波及

    console.log('· 越权字段 403：账号身份/参与度/未知键/__proto__ 一律拒绝且不落盘');
    for (const fields of [{ botName: '夺舍' }, { selfNickname: 'x' }, { participation: 'low' }, { botName: '', unknown: 'x' }]) {
      await assert.rejects(writer.capability('persona.write').write({ chatKey: null, fields }), (error) => error.status === 403);
    }
    const polluted = JSON.parse('{"__proto__":{"roleText":"polluted"}}');
    await assert.rejects(writer.capability('persona.write').write({ chatKey: null, fields: polluted }), (error) => error.status === 403);
    assert.equal(h.config.get().persona.botName, '小鲸鱼');
    assert.equal({}.roleText, undefined);

    console.log('· 超长 400 与边界值；chatKey 形状校验 400');
    await assert.rejects(writer.capability('persona.write').write({ chatKey: null, fields: { roleText: '甲'.repeat(20001) } }), (error) => error.status === 400);
    await assert.rejects(writer.capability('persona.write').write({ chatKey: null, fields: { customRules: '乙'.repeat(4001) } }), (error) => error.status === 400);
    await writer.capability('persona.write').write({ chatKey: 'private:777', fields: { systemPromptOverride: '丙'.repeat(20000) } });
    assert.equal(h.config.get().personaByChat['private:777'].systemPromptOverride.length, 20000);
    for (const chatKey of ['group:abc', '123', 'cluster:123', 'group:0', '']) {
      await assert.rejects(writer.capability('persona.write').write({ chatKey, fields: { roleText: 'x' } }), (error) => error.status === 400);
    }
    await assert.rejects(writer.capability('persona.write').write({}), /fields/); // 空 fields
    await writer.capability('persona.write').write({ fields: { customRules: '省略chatKey默认全局' } });
    assert.equal(h.config.get().persona.customRules, '省略chatKey默认全局', 'chatKey 缺省=写全局');

    console.log('· 读摘要：只有在位标记与字数，无人格正文；resolve 反映会话生效合成');
    const summary = await reader.capability('persona.read').read();
    const serialized = JSON.stringify(summary);
    assert.equal(summary.unified, false);
    assert.equal(summary.global.roleText.set, true);
    assert.ok(!serialized.includes('全局人设甲') && !serialized.includes('跑团人设'));
    assert.ok(summary.chats.some((item) => item.chatKey === 'private:777' && item.fields.includes('systemPromptOverride')));
    assert.deepEqual(
      Object.entries(await reader.capability('persona.read').resolve('group:123')).map(([key, info]) => [key, info.set]).filter(([, set]) => set),
      [['roleText', true], ['customRules', true]]); // 全局+会话合成视角
    assert.equal(h.permissions.check('persona-reader', 'persona.read', { kind: 'user', notify: false }).decision, 'allow', 'persona.read 用户默认 allow，无需逐次授权');

    console.log('· 权限闸：未声明拒绝；捆绑插件声明后免授权；persona.write 用户默认 ask');
    await assert.rejects(ctx['persona-undeclared'].capability('persona.write').write({ chatKey: null, fields: { roleText: 'x' } }), /未声明/);
    const beforeBundled = h.config.get().persona.roleText;
    const bundledResult = bundled.capability('persona.write').write({ chatKey: null, fields: { roleText: '捆绑写入' } });
    assert.equal(bundledResult.ok, true); // bundled 默认 allow（仍须清单声明）
    assert.notEqual(h.config.get().persona.roleText, beforeBundled);
    const status = h.permissions.status('persona-writer', 'persona.write');
    assert.equal(status.def.user, 'ask');

    console.log('· once 授权仅一次：回到 ask 覆盖后再次写入需重新确认，拒绝后不落盘');
    h.grant('persona-writer', 'persona.write', 'ask');
    const reAsk = writer.capability('persona.write').write({ chatKey: null, fields: { roleText: '二次写入' } });
    await until(() => h.permissions.pending().some((item) => item.pluginId === 'persona-writer' && item.scope === 'persona.write'));
    const reRequest = h.permissions.pending().find((item) => item.pluginId === 'persona-writer');
    h.permissions.resolveAsk(reRequest.id, 'deny');
    await assert.rejects(reAsk, /用户拒绝该权限/);
    assert.equal(h.config.get().persona.roleText, '捆绑写入');
  } finally { await h.stop(); }
}

// personaUnified 默认 true 时的会话级语义（独立夹具，避免与上面互相污染）
{
  const h = buildHarness({ headless: false });
  try {
    const ctx = await h.start();
    const writer = ctx['persona-writer'];
    h.grant('persona-writer', 'persona.write');
    h.config.update({ persona: { roleText: '全局底稿' } });
    const result = await writer.capability('persona.write').write({ chatKey: 'group:999', fields: { roleText: '覆盖稿' } });
    assert.equal(result.unified, true);
    assert.equal(result.effective, false, '统一人设模式下会话级覆盖不生效，须如实返回');
    assert.equal(h.config.get().personaByChat['group:999'].roleText, '覆盖稿');
    assert.equal(personaForChat(h.config.get(), 'group:999').roleText, '全局底稿');
    // 控制台切换到分会话模式后，既有插件写入无需重写即生效
    h.config.update({ personaUnified: false });
    assert.equal(personaForChat(h.config.get(), 'group:999').roleText, '覆盖稿');

    console.log('· 旧共享条目与其他会话条目在 __replace__ 读改写中原样保留');
    h.config.update({ personaByChat: { __replace__: { '777': { roleText: '旧共享' }, 'group:888': { roleText: '邻居', templateId: 'tpl-1', templateName: '模板甲' } } } });
    await writer.capability('persona.write').write({ chatKey: 'group:999', fields: { roleText: '覆盖稿二' } });
    const map = h.config.get().personaByChat;
    assert.equal(map['777'].roleText, '旧共享');
    assert.equal(map['group:888'].roleText, '邻居');
    assert.equal(map['group:888'].templateId, 'tpl-1', '未触及条目的模板指针不动');

    console.log('· 改写被模板标记的条目：模板指针随自定义内容失效；写相同值则保留');
    await writer.capability('persona.write').write({ chatKey: 'group:888', fields: { roleText: '邻居改' } });
    assert.equal(h.config.get().personaByChat['group:888'].templateId, undefined);
    h.config.update({ personaByChat: { __replace__: { ...h.config.get().personaByChat, 'group:888': { roleText: '邻居改', templateId: 'tpl-2', templateName: '模板乙' } } } });
    await writer.capability('persona.write').write({ chatKey: 'group:888', fields: { roleText: '邻居改' } });
    assert.equal(h.config.get().personaByChat['group:888'].templateId, 'tpl-2');
  } finally { await h.stop(); }
}

// ---- 人设切换（select）：与控制台同一套「选择」语义 ----
{
  const h = buildHarness({ headless: false });
  try {
    const ctx = await h.start();
    const writer = ctx['persona-writer'], reader = ctx['persona-reader'];
    h.grant('persona-writer', 'persona.write');
    h.config.update({ personaUnified: false });
    const kp = h.templates.create({ name: '跑团主持人', text: '你是KP。', customRules: '骰规：coc7' }).created;

    console.log('· select 全局切换：采用模板内容、清 systemPromptOverride、记录模板指针，不动参与度');
    h.config.update({ persona: { roleText: '旧全文', systemPromptOverride: '旧覆盖', participation: 'high' } });
    const global = await writer.capability('persona.write').select({ chatKey: null, personaId: kp });
    assert.equal(global.scope, 'global');
    const persona = h.config.get().persona;
    assert.equal(persona.roleText, '你是KP。');
    assert.equal(persona.customRules, '骰规：coc7');
    assert.equal(persona.systemPromptOverride, '');
    assert.equal(persona.templateId, kp);
    assert.equal(persona.templateName, '跑团主持人');
    assert.equal(persona.participation, 'high');
    assert.equal(personaForChat(h.config.get(), 'group:1').roleText, '你是KP。');

    console.log('· select 会话级：记录模板指针并清 override/participation（回归继承）');
    await writer.capability('persona.write').select({ chatKey: 'group:123', personaId: kp });
    assert.equal(h.config.get().personaByChat['group:123'].templateId, kp);
    assert.equal(personaForChat(h.config.get(), 'group:123').roleText, '你是KP。');
    h.config.update({ personaByChat: { __replace__: { ...h.config.get().personaByChat, 'group:123': { ...h.config.get().personaByChat['group:123'], participation: 'low', systemPromptOverride: '覆盖' } } } });
    await writer.capability('persona.write').select({ chatKey: 'group:123', personaId: kp });
    const entry = h.config.get().personaByChat['group:123'];
    assert.equal(entry.participation, undefined);
    assert.equal(entry.systemPromptOverride, undefined);

    console.log('· select 出厂人设；personaId=null 会话级=整条移除（跟随全局）；全局清空 400；未知 id 404');
    await writer.capability('persona.write').select({ chatKey: null, personaId: 'xiaojingyu' });
    assert.equal(h.config.get().persona.roleText, '出厂人设正文');
    assert.equal(h.config.get().persona.templateId, 'xiaojingyu');
    await writer.capability('persona.write').select({ chatKey: 'group:123', personaId: null });
    assert.equal(Object.hasOwn(h.config.get().personaByChat, 'group:123'), false);
    assert.equal(personaForChat(h.config.get(), 'group:123').roleText, '出厂人设正文');
    await assert.rejects(writer.capability('persona.write').select({ chatKey: null, personaId: null }), (error) => error.status === 400);
    await assert.rejects(writer.capability('persona.write').select({ chatKey: null, personaId: 'custom_nope' }), (error) => error.status === 404);
    await assert.rejects(writer.capability('persona.write').select({ chatKey: 'group:1', personaId: 42 }), (error) => error.status === 400);
    await assert.rejects(writer.capability('persona.write').select({ chatKey: 'bad-key', personaId: kp }), (error) => error.status === 400);

    console.log('· read 摘要暴露模板指针；select 同受 persona.write 闸（ask 拒绝路径）');
    let summary = await reader.capability('persona.read').read();
    assert.equal(summary.global.templateId, 'xiaojingyu');
    h.config.update({ personaByChat: { __replace__: { ...h.config.get().personaByChat, 'group:55': { roleText: 'x', templateId: 'custom_x' } } } });
    summary = await reader.capability('persona.read').read();
    assert.equal(summary.chats.find((item) => item.chatKey === 'group:55').templateId, 'custom_x');
    h.grant('persona-writer', 'persona.write', 'ask');
    const reAsk = writer.capability('persona.write').select({ chatKey: null, personaId: 'xiaojingyu' });
    await until(() => h.permissions.pending().some((item) => item.pluginId === 'persona-writer' && item.scope === 'persona.write'));
    h.permissions.resolveAsk(h.permissions.pending().find((item) => item.pluginId === 'persona-writer').id, 'deny');
    await assert.rejects(reAsk, /用户拒绝该权限/);
    const audit = h.infos.find((line) => line.includes('select=xiaojingyu'));
    assert.ok(audit?.includes('persona-writer'), audit);
  } finally { await h.stop(); }
}

// ---- headless：未授权 ask → deny ----
{
  const h = buildHarness({ headless: true });
  try {
    const ctx = await h.start();
    h.grant('persona-writer', 'persona.read'); // 只授读，写保持未授权
    console.log('· headless 未授权 persona.write → deny，且不落盘');
    await assert.rejects(ctx['persona-writer'].capability('persona.write').write({ chatKey: null, fields: { roleText: '无头写入' } }), /无人在场/);
    assert.equal(h.config.get().persona.roleText, '');
    await assert.rejects(ctx['persona-undeclared'].capability('persona.read').read(), /未声明/);
    const summary = await ctx['persona-writer'].capability('persona.read').read();
    assert.equal(summary.unified, true);
  } finally { await h.stop(); }
}

console.log('✓ 310-persona-write：persona.write / persona.read 合同全部通过');
