// Source-only index. This deliberately does not read either version's data,
// credentials, downloaded runtime, logs or node_modules. An index is NOT parity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'), reference = path.resolve(root, '../develop');
const files = [];
function walk(relative) {
  const dir = path.join(reference, relative);
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(relative, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', 'vendor', 'data', '.git'].includes(entry.name)) walk(file); }
    else if (/\.(?:[cm]?js|html)$/.test(entry.name)) files.push(file);
  }
}
for (const dir of ['src', 'ui', 'electron']) walk(dir);
const sources = files.sort().map(file => {
  const bytes = fs.readFileSync(path.join(reference, file)), source = bytes.toString('utf8'), candidates = [];
  const rules = [
    ['function', /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm],
    ['api-path', /["'`]((?:\/api\/)[^"'`\s]*)["'`]/g],
    ['config-control', /\bid=["'](cfg-[A-Za-z0-9_-]+)["']/g],
  ];
  for (const [kind, regex] of rules) for (const match of source.matchAll(regex)) candidates.push({kind, name: match[1], line: source.slice(0, match.index).split('\n').length, status: 'needs-semantic-review'});
  return {file: file.replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), lines: source.split('\n').length, candidates};
});
const result = {version: 1, reference: '../develop', scope: ['src', 'ui (excluding vendor)', 'electron'],
  limitations: 'Candidate anchors only. Nested handlers, runtime branches, extension manifests/tools and documentation require separate semantic review. No equivalence or completion is inferred from names or counts.', sources};
fs.writeFileSync(path.join(root, 'docs/v04-parity-source-index.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({sourceFiles: sources.length, candidateAnchors: sources.reduce((sum, row) => sum + row.candidates.length, 0), status: 'indexed, not semantically completed'}));
