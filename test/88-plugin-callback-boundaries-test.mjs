// Real kernel/loader/SDK callbacks; no QQ connection, network or billed model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKernel } from '../src/kernel/kernel.js';
import { runAgent } from '../src/kernel/agent-runner.js';

async function fixture(t, source, permissions = []) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-callback-boundary-'));
  for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, name));
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  const dir = path.join(appRoot, 'plugins', 'callback-fixture'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'callback-fixture', kind: 'plugin', version: '1.0.0', permissions, configSchema: { visible: { type: 'string', default: 'own-value' } } }));
  fs.writeFileSync(path.join(dir, 'index.js'), source);
  const calls = [];
  const kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: path.join(appRoot, 'data'), QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent') },
    fetchImpl: async (url) => { calls.push(String(url)); throw new Error('fixture forbids external HTTP'); },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true }) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  });
  kernel.log.setLevel('error');
  kernel.config.update({ api: { apiKey: 'fake-callback-key' }, persona: { customRules: 'unchanged' }, skills: { 'callback-fixture': { settings: { visible: 'own-value' } } } });
  t.after(async () => {
    await kernel.stop(); assert.equal(calls.length, 0);
    const target = path.resolve(appRoot);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-callback-boundary-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  await kernel.loader.loadAll(); assert.equal(kernel.loader.isActive('callback-fixture'), true);
  return { kernel, kv: (key) => kernel.storage.namespace('callback-fixture').get(key), control: () => kernel.capability.consume('callback.control') };
}

test('every hook and dynamic prompt receives scoped config and guarded stores instead of credentials or raw host objects', async (t) => {
  const { kernel, kv } = await fixture(t, `export default { setup(ctx) {
    const inspect = async (kind,p) => {
      let readDenied=false,writeDenied=false;
      try { await p.memory.query('group:123'); } catch { readDenied=true; }
      try { await p.memory.append('group:123',{userId:'456',name:'Fixture',content:'must-not-write'}); } catch { writeDenied=true; }
      const reports=ctx.storage.get('reports') || {};
      reports[kind]={hasKey:!!(p.api?.apiKey || p.cfg?.api?.apiKey || p.response?._usedApi?.apiKey), rawStore:typeof p.store.appendIncoming==='function', rawMemory:typeof p.memory.formatForPrompt==='function',
        rawHeaders:!!p.session?.requestHeaders, rawRequest:!!p.session?.rawRequest, visible:p.cfg.visible, readDenied,writeDenied,
        rawResponseObserved:p.response?.raw?.choices?.[0]?.message?.content, reasoning:p.response?.reasoning};
      ctx.storage.set('reports',reports); p.cfg.visible='isolated'; if(p.session) p.session.reasoning='isolated';
      if(p.response) p.response.message.content='isolated';
    };
    for(const name of ['before-context','before-llm-messages','before-tool','after-tool','after-response'])ctx.hooks.on(name,p=>inspect(name,p));
    this._inspect=p=>inspect('promptSections',p);
  }, async promptSections(p) { await this._inspect(p); return []; } };`);
  const session = { chatKey: 'group:123', reasoning: 'before', requestHeaders: { Authorization: 'fake-callback-key' }, rawRequest: { apiKey: 'fake-callback-key' } };
  const response = { message: { content: 'before' }, _usedApi: { apiKey: 'fake-callback-key' }, reasoning: 'visible-reasoning', raw: { choices: [{ message: { content: 'visible-vendor-response' } }], apiKey: 'fake-callback-key' } };
  const c = kernel.config.get();
  const payload = { chatKey: 'group:123', session, response, cfg: c, api: c.api, store: kernel.store, memory: kernel.memory, triggerEntries: [], messages: [{ role: 'user', content: 'before' }], toolName: 'fixture', argsRaw: '{}', result: 'observation', signal: new AbortController().signal };
  for (const name of ['before-context', 'before-llm-messages', 'before-tool', 'after-tool', 'after-response']) await kernel.loader.hooksOf(name)[0].fn(payload);
  await kernel.loader.promptSections(payload);
  const reports = kv('reports'); assert.deepEqual(Object.keys(reports).sort(), ['after-response', 'after-tool', 'before-context', 'before-llm-messages', 'before-tool', 'promptSections'].sort());
  for (const report of Object.values(reports)) {
    assert.equal(report.hasKey, false); assert.equal(report.rawStore, false); assert.equal(report.rawMemory, false);
    assert.equal(report.rawHeaders, false); assert.equal(report.rawRequest, false); assert.equal(report.visible, 'own-value');
    assert.equal(report.readDenied, true); assert.equal(report.writeDenied, true);
  }
  assert.equal(reports['after-response'].rawResponseObserved, 'visible-vendor-response'); assert.equal(reports['after-response'].reasoning, 'visible-reasoning');
  assert.equal(kernel.memory.query('group:123').length, 0); assert.equal(c.persona.customRules, 'unchanged');
  assert.equal(kernel.config.get().skills['callback-fixture'].settings.visible, 'own-value');
  assert.equal(session.reasoning, 'before'); assert.equal(response.message.content, 'before');
});

test('successful message and context changes are committed to the existing array without lending retained references', async (t) => {
  const { kernel, control } = await fixture(t, `export default { setup(ctx) {
    let saved;
    ctx.hooks.on('before-context',p=>{p.triggerEntries[0].text='processed-trigger';p.context.processed=true;});
    ctx.hooks.on('before-llm-messages',p=>{saved=p;p.messages[0].content='processed';p.messages.push({role:'user',content:'appended'});});
    ctx.registerCapability('callback.control',{late(){saved.messages[0].content='late';saved.messages.push({role:'user',content:'late'});return saved.signal.aborted;}});
  } };`);
  const messages = [{ role: 'user', content: 'original' }], identity = messages;
  const triggerEntries = [{ id: 1, text: 'original-trigger' }], context = { existing: true };
  await kernel.loader.hooksOf('before-context')[0].fn({ chatKey: 'group:123', triggerEntries, context });
  assert.equal(triggerEntries[0].text, 'processed-trigger'); assert.deepEqual(context, { existing: true, processed: true });
  await kernel.loader.hooksOf('before-llm-messages')[0].fn({ chatKey: 'group:123', messages });
  assert.equal(messages, identity); assert.deepEqual(messages.map((message) => message.content), ['processed', 'appended']);
  assert.equal(control().late(), true, 'retained callback capabilities are closed when it completes');
  assert.deepEqual(messages.map((message) => message.content), ['processed', 'appended']);
});

test('before-tool keeps object and positional callback forms and still vetoes the real runner', async (t) => {
  const { kernel, kv } = await fixture(t, `export default { setup(ctx) {
    ctx.hooks.on('before-tool',(first,args,context)=>{
      const positional=typeof first==='string'; const p=positional?context:first;
      ctx.storage.set('form',positional?'positional':'object');ctx.storage.set('args',positional?args:p.argsRaw);
      return {block:p.toolName==='fixture_tool',reason:positional?'positional-veto':'object-veto'};
    });
    ctx.hooks.on('after-tool',p=>ctx.storage.set('observedResult',p.result));
  } };`);
  const fn = kernel.loader.hooksOf('before-tool')[0].fn;
  assert.deepEqual(await fn('fixture_tool', { value: 7 }), { block: true, reason: 'positional-veto' });
  assert.equal(kv('form'), 'positional'); assert.deepEqual(kv('args'), { value: 7 });
  let executed = 0;
  const result = await runAgent({ session: { chatKey: 'group:123', sent: [] }, systemPrompt: '', userPrompt: 'fixture', tools: [], execContext: { chatKey: 'group:123' }, cfg: { api: { maxRounds: 1 } }, log: kernel.log,
    hooksOf: kernel.loader.hooksOf, callLLM: async () => ({ message: { tool_calls: [{ id: 'call1', type: 'function', function: { name: 'fixture_tool', arguments: '{"value":8}' } }] } }),
    invokeTool: async () => { executed++; return { ok: true }; },
  });
  assert.equal(executed, 0); assert.equal(kv('form'), 'object'); assert.equal(kv('args'), '{"value":8}');
  assert.match(result.messages.find((message) => message.role === 'tool').content, /object-veto/); assert.match(kv('observedResult'), /object-veto/);
});

const deferredSource = (kind) => `export default { setup(ctx) {
  let resolveEntered,release,resolveDone,lateWrite;
  const entered=new Promise(r=>resolveEntered=r),wait=new Promise(r=>release=r),done=new Promise(r=>resolveDone=r);
  const run=async p=>{resolveEntered();await wait;
    if(p.messages){p.messages[0].content='late';p.messages.push({role:'user',content:'late'});}
    if(p.triggerEntries)p.triggerEntries[0].text='late';
    // Observation belongs to this fixture closure, not the now-inactive SDK KV.
    try{await p.memory.append('group:123',{userId:'456',name:'Fixture',content:'must-not-write-late'});lateWrite=true;}catch{lateWrite=false;}finally{resolveDone();}
    return [{content:'late-section',priority:99}];};
  ${kind === 'promptSections' ? 'this.render=run;' : `ctx.hooks.on('${kind}',run);`}
  ctx.registerCapability('callback.control',{entered:()=>entered,release:()=>release(),done:()=>done,lateWrite:()=>lateWrite});
},promptSections(p){return this.render?.(p) || [];} };`;

test('the 5-second hook deadline cancels scoped operations and discards late message changes', async (t) => {
  const { kernel, control } = await fixture(t, deferredSource('before-llm-messages'), ['fs.outsideNamespace']);
  assert.equal(kernel.permissions.setOverride('callback-fixture', 'fs.outsideNamespace', 'allow'), true);
  const probe = control(), messages = [{ role: 'user', content: 'original' }];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promise = kernel.loader.hooksOf('before-llm-messages')[0].fn({ chatKey: 'group:123', messages });
    await probe.entered(); t.mock.timers.tick(4999); await Promise.resolve();
    assert.equal(kernel.loader.listEntries()[0].lastError, null);
    t.mock.timers.tick(1); await assert.rejects(promise, /超时（5000ms）/);
    probe.release(); await probe.done();
    assert.deepEqual(messages, [{ role: 'user', content: 'original' }]); assert.equal(probe.lateWrite(), false); assert.equal(kernel.memory.query('group:123').length, 0);
    assert.match(kernel.loader.listEntries()[0].lastError, /超时/);
  } finally { t.mock.timers.reset(); }
});

test('disabling a pending dynamic prompt discards its late sections and closes the captured memory gateway', async (t) => {
  const { kernel, control } = await fixture(t, deferredSource('promptSections'), ['fs.outsideNamespace']);
  assert.equal(kernel.permissions.setOverride('callback-fixture', 'fs.outsideNamespace', 'allow'), true);
  const probe = control(), triggerEntries = [{ text: 'original' }];
  const promise = kernel.loader.promptSections({ chatKey: 'group:123', triggerEntries });
  await probe.entered(); await kernel.loader.setEnabled('callback-fixture', false);
  assert.deepEqual(await promise, []); probe.release(); await probe.done();
  assert.deepEqual(triggerEntries, [{ text: 'original' }]); assert.equal(probe.lateWrite(), false); assert.equal(kernel.memory.query('group:123').length, 0);
  assert.equal(kernel.loader.isActive('callback-fixture'), false);
});
