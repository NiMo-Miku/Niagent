import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkExtension, packExtension, testExtension } from '../scripts/lib/extension-dev.mjs';
import { extractZipSafely, collectPublishFiles, createStoredZip } from '../bundled/market/client.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-extension-tools-279-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const cli = fileURLToPath(new URL('../scripts/extension-dev.mjs', import.meta.url));
let serial = 0;
function extension(source, patch = {}) {
  const id = `fixture-${++serial}`, dir = path.join(root, id); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, kind: 'skill', apiVersion: 1, version: '1.0.0', entry: 'index.js', permissions: ['qq.send', 'net.outbound'], configSchema: { prefix: { type: 'string' } }, settings: { prefix: 'default' }, ...patch }));
  fs.writeFileSync(path.join(dir, 'index.js'), source); return dir;
}
function cases(dir, definitions) {
  const file = path.join(dir, 'extension.check.json'); fs.writeFileSync(file, JSON.stringify({ version: 1, cases: definitions })); return file;
}
const source = `export default { setup(ctx) {
  ctx.scheduler.every(100000, () => {});
  ctx.registerTool({ id:'run', name:'Run', params:{type:'object',properties:{text:{type:'string'},mode:{type:'string'}},required:['text'],additionalProperties:false}, async execute(args, execution) {
    if(args.mode==='business-error')return {ok:false,error:'business failure'};
    if(args.mode==='throw')throw new Error('expected fixture exception');
    if(args.mode==='raw'){await fetch('https://never-real.example/');}
    const response=await ctx.http.fetch('https://fixture.example/query',{method:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify({query:args.text}),signal:execution.signal});
    const data=await response.json();
    const count=(ctx.storage.get('count')??0)+1;ctx.storage.set('count',count);
    const receipt=await execution.send.sendImage(execution.chatKey,{dataUrl:'data:image/png;base64,YQ=='},{signal:execution.signal});
    if(!receipt.ok||!receipt.sent?.length)throw new Error('no confirmed delivery');
    return {text:ctx.config.get('prefix')+data.answer,count};
  }});
}};`;
const http = (answer = 'answer', more = {}) => ({ url: 'https://fixture.example/query', method: 'POST', json: { answer }, request: { headers: { authorization: 'Bearer test-token' }, json: { query: 'hello' } }, ...more });

test('check is static and does not import top-level extension code', () => {
  const dir = extension(`throw new Error('must not execute'); export default {setup(){}};`);
  const result = checkExtension(dir); assert.equal(result.ok, true); assert.equal(result.executed, false); assert.equal(result.mode, 'static');
});

test('native 0.4 log/sender/parameters/argument mistakes are actionable failures', () => {
  const dir = extension(`export default {setup(ctx){ctx.log('old');ctx.registerTool({parameters:{},execute(context,args){return context.sender.sendImage();}})}};`);
  const result = checkExtension(dir);
  for (const code of ['LEGACY_LOG', 'LEGACY_SENDER', 'LEGACY_PARAMETERS', 'LEGACY_ARGUMENT_ORDER']) assert.ok(result.issues.some(item => item.code === code), code);
  assert.equal(result.ok, false);
});

test('native logger method aliases pass while direct callable logger objects remain errors', () => {
  for (const expression of ['ctx.log.info.bind(ctx.log)', 'ctx.log.info', 'ctx.log["info"]', 'ctx.log?.info']) {
    const dir = extension(`export default {setup(ctx){const log=${expression};log('ready');}};`);
    const checked = checkExtension(dir);
    assert.equal(checked.ok, true, `${expression}: ${JSON.stringify(checked)}`);
  }
  const invalid = extension(`export default {setup(ctx){const log=ctx.log;log('old');}};`);
  assert.ok(checkExtension(invalid).issues.some(item => item.code === 'LEGACY_LOG'));
});

test('production manifest precedence and entry boundary are preserved', () => {
  const dir = extension('export default {setup(){}};', { entry: '../outside.js' });
  fs.writeFileSync(path.join(root, 'outside.js'), 'export default {}');
  assert.ok(checkExtension(dir).issues.some(item => item.code === 'ENTRY'));
  fs.writeFileSync(path.join(dir, 'plugin.json'), '{}');
  const ambiguous = checkExtension(dir); assert.equal(ambiguous.manifestFile, 'skill.json'); assert.ok(ambiguous.issues.some(item => item.code === 'AMBIGUOUS_MANIFEST'));
});

test('syntax and malformed JSON fail without executing source', () => {
  const dir = extension('export default {'); assert.ok(checkExtension(dir).issues.some(item => item.code === 'SYNTAX'));
  fs.writeFileSync(path.join(dir, 'skill.json'), '{bad'); assert.equal(checkExtension(dir).ok, false);
});

test('pack has identical production bytes; extracted package passes check', () => {
  const dir = extension(source), out = path.join(root, 'release.zip');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture');
  const result = packExtension(dir, out); assert.equal(result.ok, true);
  assert.deepEqual(fs.readFileSync(out), createStoredZip(collectPublishFiles(dir)));
  const installed = extractZipSafely(fs.readFileSync(out), root);
  assert.equal(checkExtension(installed).ok, true);
  assert.throws(() => packExtension(dir, out), /EEXIST/);
  assert.throws(() => packExtension(dir, path.join(dir, 'release.zip')), /扩展目录外/);
});

test('pack refuses private data and secret values without modifying source', () => {
  const dir = extension(source);
  fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=actual-secret-never-copy');
  let result = packExtension(dir, path.join(root, 'private.zip')); assert.equal(result.ok, false); assert.equal(fs.existsSync(path.join(root, 'private.zip')), false);
  fs.unlinkSync(path.join(dir, '.env'));
  const manifestFile = path.join(dir, 'skill.json'), before = fs.readFileSync(manifestFile, 'utf8');
  const raw = JSON.parse(before); raw.settings.apiKey = 'actual-secret-never-copy'; fs.writeFileSync(manifestFile, JSON.stringify(raw));
  result = packExtension(dir, path.join(root, 'secret.zip')); assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('actual-secret-never-copy')); assert.equal(JSON.parse(fs.readFileSync(manifestFile)).settings.apiKey, 'actual-secret-never-copy');
});

test('check and pack honor custom secret schema fields without disclosing their values', () => {
  for (const marker of [{ secret: true }, { sensitive: true }, { format: 'password' }]) {
    const dir = extension('export default {setup(){}};', {
      configSchema: { credential: { type: 'string', ...marker } }, settings: { credential: 'actual-credential-never-publish' },
    });
    const before = fs.readFileSync(path.join(dir, 'skill.json'));
    const checked = checkExtension(dir), out = path.join(root, `${path.basename(dir)}.zip`), packed = packExtension(dir, out);
    for (const result of [checked, packed]) {
      assert.equal(result.ok, false);
      assert.ok(result.issues.some(item => item.code === 'PUBLISH_HYGIENE' && item.message.includes('settings.credential')));
      assert.ok(!JSON.stringify(result).includes('actual-credential-never-publish'));
    }
    assert.equal(fs.existsSync(out), false);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'skill.json')), before);
  }
});

test('custom secret values in public cases are rejected while synthetic placeholders retain exact publish bytes', () => {
  const dir = extension('export default {setup(){}};', {
    configSchema: { credential: { type: 'string', secret: true } }, settings: { credential: 'example-public-placeholder' },
  });
  const file = cases(dir, [{ config: { credential: 'actual-case-credential-never-publish' }, expect: { status: 'active' } }]);
  const checked = checkExtension(dir);
  assert.equal(checked.ok, false);
  assert.ok(checked.issues.some(item => item.code === 'PUBLISH_HYGIENE' && item.message.includes('cases.0.config.credential')));
  assert.ok(!JSON.stringify(checked).includes('actual-case-credential-never-publish'));
  const suite = JSON.parse(fs.readFileSync(file)); suite.cases[0].config.credential = 'fixture-public-placeholder';
  fs.writeFileSync(file, JSON.stringify(suite));
  const packed = packExtension(dir, path.join(root, `${path.basename(dir)}.zip`));
  assert.equal(packed.ok, true, JSON.stringify(packed));
  assert.deepEqual(fs.readFileSync(packed.file), createStoredZip(collectPublishFiles(dir)));
});

test('production archive file count is enforced', () => {
  const dir = extension('export default {setup(){}};');
  for (let i = 0; i < 100; i++) fs.writeFileSync(path.join(dir, `asset-${i}.txt`), 'a');
  assert.equal(checkExtension(dir).ok, false);
});

test('real loader/config/sdk/permissions execute multiple calls and persist storage offline', async () => {
  const dir = extension(source);
  const file = cases(dir, [{ name: 'configured', config: { prefix: 'configured:' }, permissions: { 'qq.send': 'allow', 'net.outbound': 'allow' }, inputs: [{ tool: 'run', args: { text: 'hello' }, chatKey: 'private:10001' }, { tool: 'run', args: { text: 'hello' }, chatKey: 'group:20001' }], http: [http(), http()], expect: { ok: true, result: { text: 'configured:answer', count: 2 }, storage: { count: 2 }, sendCount: 2, httpCount: 2, sends: [{ method: 'sendImage', chatKey: 'private:10001' }, { method: 'sendImage', chatKey: 'group:20001' }] } }]);
  const result = await testExtension(dir, file); assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.cases[0].lifecycle, { toolsBeforeStop: 1, toolsAfterStop: 0, timersAfterStop: 0, abortedAfterStop: true });
  assert.equal(fs.existsSync(path.join(dir, 'data')), false);
});

test('permission denial never reaches host; malformed parameters and thrown error are distinct', async () => {
  const dir = extension(source);
  const file = cases(dir, [
    { name: 'deny', input: { tool: 'run', args: { text: 'hello' } }, expect: { ok: false, errorIncludes: '权限', sendCount: 0, httpCount: 0 } },
    { name: 'params', input: { tool: 'run', args: {} }, expect: { ok: false, errorIncludes: '参数缺失', httpCount: 0 } },
    { name: 'throw', input: { tool: 'run', args: { text: 'hello', mode: 'throw' } }, expect: { ok: false, errorIncludes: 'expected fixture exception', httpCount: 0 } },
    { name: 'business result', input: { tool: 'run', args: { text: 'hello', mode: 'business-error' } }, expect: { ok: true, result: { ok: false, error: 'business failure' }, httpCount: 0 } },
  ]);
  const result = await testExtension(dir, file); assert.equal(result.ok, true, JSON.stringify(result));
});

test('cancel propagates to pending HTTP and prevents sending', async () => {
  const dir = extension(source);
  const file = cases(dir, [{ name: 'cancel', permissions: { 'net.outbound': 'allow', 'qq.send': 'allow' }, input: { tool: 'run', args: { text: 'hello' }, cancelAfterMs: 20 }, http: [http('late', { responseDelayMs: 1000 })], expect: { ok: false, errorIncludes: '取消', sendCount: 0, httpCount: 1 } }]);
  const result = await testExtension(dir, file); assert.equal(result.ok, true, JSON.stringify(result));
});

test('stopping an instance aborts pending HTTP and prevents late sending', async () => {
  const dir = extension(source);
  const file = cases(dir, [{ name: 'stop pending', permissions: { 'net.outbound': 'allow', 'qq.send': 'allow' }, input: { tool: 'run', args: { text: 'hello' }, stopAfterMs: 20 }, http: [http('late', { responseDelayMs: 1000 })], expect: { ok: false, errorIncludes: '停止', sendCount: 0, httpCount: 1 } }]);
  const result = await testExtension(dir, file); assert.equal(result.ok, true, JSON.stringify(result));
});

test('JSON reports redact credentials, schema secret values and assertion diagnostics', async () => {
  const dir = extension(`export default {setup(ctx){ctx.registerTool({id:'echo',name:'Echo',execute(){return 'prefix '+ctx.config.get('credential')+' suffix';}})}};`, { configSchema: { credential: { type: 'string', secret: true } }, settings: { credential: '' } });
  const file = cases(dir, [{ name: 'redaction', config: { credential: 'test-sensitive-value' }, input: { tool: 'echo' }, expect: { result: 'wrong' } }]);
  const result = await testExtension(dir, file); assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('test-sensitive-value')); assert.match(JSON.stringify(result), /REDACTED/);
});

test('JSON diagnostics redact all three supported custom sensitive schema markers', async () => {
  for (const marker of [{ secret: true }, { sensitive: true }, { format: 'password' }]) {
    const dir = extension(`export default {setup(ctx){ctx.registerTool({id:'echo',name:'Echo',handler(){return 'prefix '+ctx.config.get('credential')+' suffix';}})}};`, {
      configSchema: { credential: { type: 'string', ...marker } }, settings: { credential: '' },
    });
    const secret = `fixture-sensitive-value-${path.basename(dir)}`;
    const file = cases(dir, [{ config: { credential: secret }, input: { tool: 'echo' }, expect: { result: 'wrong' } }]);
    const result = await testExtension(dir, file);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(secret), JSON.stringify(marker));
    assert.match(JSON.stringify(result), /REDACTED/);
  }
});

test('failed send receipt cannot be confused with delivery; request mismatch cannot falsely pass', async () => {
  const dir = extension(source);
  let file = cases(dir, [{ name: 'send not confirmed', permissions: { 'net.outbound': 'allow', 'qq.send': 'allow' }, input: { tool: 'run', args: { text: 'hello' } }, http: [http()], sendResult: { ok: false, sent: [], failed: [{ error: 'offline failure' }] }, expect: { ok: false, errorIncludes: 'no confirmed delivery', sendCount: 1, httpCount: 1 } }]);
  assert.equal((await testExtension(dir, file)).ok, true);
  file = cases(dir, [{ name: 'wrong body', permissions: { 'net.outbound': 'allow' }, input: { tool: 'run', args: { text: 'wrong' } }, http: [http()], expect: { ok: false, httpCount: 1 } }]);
  assert.equal((await testExtension(dir, file)).ok, false);
});

test('unmocked native global fetch is refused and reported', async () => {
  const dir = extension(source), file = cases(dir, [{ name: 'raw fetch', input: { tool: 'run', args: { text: 'hello', mode: 'raw' } }, expect: { ok: false } }]);
  const result = await testExtension(dir, file); assert.equal(result.ok, false); assert.match(result.cases[0].errors.join(' '), /全局 fetch/);
});

test('invalid or empty assertions are rejected', async () => {
  const dir = extension(source), file = cases(dir, [{ expect: {} }]); await assert.rejects(testExtension(dir, file), /有效断言/);
});

test('invalid assertion value types cannot silently pass and empty arrays remain real assertions', async () => {
  const dir = extension('export default {setup(ctx){ctx.registerTool({id:"nil",name:"Nil",handler(){return null;}})}};');
  for (const expect of [{ results: false }, { sends: false }, { storage: false }, { storage: [] }, { errorIncludes: '' }, { resultIncludes: 0 }, { status: true }, { ok: 'true' }, { sendCount: -1 }, { httpCount: 0.5 }]) {
    await assert.rejects(testExtension(dir, cases(dir, [{ expect }])), /断言值类型无效/, JSON.stringify(expect));
  }
  const file = cases(dir, [
    { name: 'empty arrays assert no calls or sends', expect: { status: 'active', results: [], sends: [], storage: {}, sendCount: 0, httpCount: 0 } },
    { name: 'null is a valid result subset', input: { tool: 'nil' }, expect: { ok: true, result: null, sends: [] } },
  ]);
  const result = await testExtension(dir, file); assert.equal(result.ok, true, JSON.stringify(result));
});

test('hung trusted source is terminated by bounded worker timeout', async () => {
  const dir = extension('while(true){}; export default {setup(){}};');
  const file = cases(dir, [{ name: 'hung import', timeoutMs: 1000, expect: { status: 'active' } }]);
  const result = await testExtension(dir, file); assert.equal(result.ok, false); assert.match(result.cases[0].errors.join(' '), /超过|提前退出/);
});

test('CLI JSON is parseable and distinguishes check/test failure from usage failure', () => {
  const good = extension('export default {setup(){console.log("extension-noise");}};');
  const run = args => { const out = spawnSync(process.execPath, [cli, ...args, '--json'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }); return { code: out.status, result: JSON.parse(out.stdout) }; };
  assert.equal(run(['check', good]).code, 0);
  const bad = extension('export default {'); assert.equal(run(['check', bad]).code, 1);
  assert.equal(run(['pack', good]).code, 2);
  const file = cases(good, [{ name: 'load only', expect: { status: 'active' } }]);
  const testResult = run(['test', good, '--case', file]); assert.equal(testResult.code, 0, JSON.stringify(testResult)); assert.equal(testResult.result.cases.length, 1);
});
