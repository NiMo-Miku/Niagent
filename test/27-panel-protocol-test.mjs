import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, section, summary } from './helpers.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const source = fs.readFileSync(path.join(root, 'ui/shell/rpc-bridge.js'), 'utf8');
section('Panel RPC protocol');
for (const token of ['jsonrpc','panel.init','panel.ready','api.request','nonce','contentWindow','FORBIDDEN']) ok(source.includes(token), token);
summary('27-panel-protocol');
