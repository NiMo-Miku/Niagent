import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mktmp, eq, ok, section, summary } from './helpers.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const source = fs.readFileSync(path.join(root, 'src/console/routes.js'), 'utf8');
section('M3 route registry contract');
for (const route of ['/api/status','/api/config','/api/prompt-preview','/api/skills','/api/skills/reload','/api/skills/cleanup','/api/sessions','/api/chats','/api/tools','/api/tools/availability','/api/pause']) ok(source.includes(route), route);
ok(source.includes('deepMerge') && source.includes('buildSystemPrompt'), 'prompt preview implementation');
summary('26-route-registry');
