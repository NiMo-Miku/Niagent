// Test infrastructure only: real default UI, no installed extension scan, and
// exact owned-origin transport boundaries. Production never imports this file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import callbackDns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

export function isolateConsoleFixture(dataDir, label) {
  assert.ok(path.isAbsolute(dataDir));
  assert.match(label, /^\d+$/);
  const appRoot = path.join(dataDir, 'application');
  fs.mkdirSync(appRoot);
  fs.cpSync(new URL('../ui', import.meta.url), path.join(appRoot, 'ui'), {recursive:true});
  for (const name of ['bundled','plugins','skills']) fs.mkdirSync(path.join(appRoot,name));
  const origins = new Set(), blocked = {node:[],dns:[],browser:[]};
  const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup, nativeCallbackLookup = callbackDns.lookup;
  function literalLoopback(hostname, options) {
    const family = hostname === '127.0.0.1' ? 4 : hostname === '::1' ? 6 : 0;
    if (!family) { blocked.dns.push(String(hostname)); throw Error(`QA${label} forbids external DNS`); }
    return options?.all ? [{address:hostname,family}] : {address:hostname,family};
  }
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (origins.has(url.origin)) return nativeFetch(input,options);
    blocked.node.push(url.origin);throw Error(`QA${label} forbids an external fetch`);
  };
  // net.listen may ask the callback API to resolve a literal bind address.
  // Answer only our literal loopbacks locally; never call the OS resolver.
  dns.lookup = async (hostname, options) => literalLoopback(hostname, options);
  callbackDns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') { callback=options;options=undefined; }
    let result;
    try { result=literalLoopback(hostname,options); }
    catch (error) { queueMicrotask(()=>callback(error));return; }
    queueMicrotask(()=>Array.isArray(result) ? callback(null,result) : callback(null,result.address,result.family));
  };
  syncBuiltinESMExports();
  function allowOrigin(value) {
    const url = new URL(value);
    assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'15967');
    origins.add(url.origin);return url.origin;
  }
  function assertEmpty(kernel) {
    assert.deepEqual(kernel.loader.listEntries(),[],`QA${label} loads no installed extensions`);
  }
  async function bindPage(page, base) {
    const own = new URL(base).origin;assert.ok(origins.has(own));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (new URL(url).origin === own) return route.continue();
      blocked.browser.push(url);return route.abort();
    });
  }
  function assertOffline() {assert.deepEqual(blocked,{node:[],dns:[],browser:[]},`QA${label} stays within its owned synthetic origins`);}
  function restore() {
    globalThis.fetch = nativeFetch;dns.lookup = nativeLookup;callbackDns.lookup = nativeCallbackLookup;syncBuiltinESMExports();assertOffline();
  }
  return Object.freeze({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent-migration')},allowOrigin,assertEmpty,bindPage,assertOffline,restore});
}
