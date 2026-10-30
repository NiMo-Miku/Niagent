// Check shareable project files without printing matched personal data or credentials.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const findings = [];
let scanned = 0;
const ignored = /^(?:\.git|node_modules|dist|\.qa-local|\.shots|\.extension-management-v1|data(?:[-.].*)?)$/i;
const textFile = /\.(?:[cm]?js|json|ya?ml|md|txt|html|css|svg|ps1|bat|cmd|toml|ini|env|pem|key)$/i;
const patterns = [
  ['personal-home-path', /[A-Z]:[\\/]+Users[\\/]+([^\\/\s"'`<>]+)[\\/]+/gi, match => !/^(?:Public|Default|example|user|private|synthetic|test|a)$/i.test(match[1])],
  ['credential-token', /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|LTAI[A-Za-z0-9]{16,})\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{80,}-----END/g],
  ['phone-number', /(?<![A-Za-z0-9.])(?:\+86[- ]?)?1[3-9]\d{9}(?![A-Za-z0-9])/g],
  ['embedded-account', /(?:QQ\s*(?:账号|号)?\s*[:：=]?\s*|qq号\s*[:：=]?\s*|user_id\s*[:=]\s*)[1-9]\d{5,11}\b/g],
  ['email-address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, match => !/(?:@example\.(?:com|org|net)|\.(?:invalid|test|example))$/i.test(match[0])],
  ['credential-literal', /["']?(?:api_?key|access_?token|password|secret|authorization|cookie)["']?\s*[:=]\s*(["'])([A-Za-z0-9+/=_-]{28,})\1/gi, match => !/^(?:qa|test|fixture|example|synthetic|YOUR_|REPLACE_ME)/i.test(match[2])],
];

function inspect(file, rel) {
  const bytes=fs.readFileSync(file);
  if(bytes.subarray(0,8192).includes(0))return;
  scanned++;
  const text=bytes.toString('utf8');
  for(const [kind,pattern,accept] of patterns) {
    if(['embedded-account','email-address'].includes(kind) && rel.startsWith('test/'))continue; // Explicit synthetic protocol/account fixtures.
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern)) {
      if(accept && !accept(match))continue;
      findings.push({file:rel, line:text.slice(0,match.index).split('\n').length, kind});
    }
  }
}
function walk(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name),rel=path.relative(root,file).replaceAll('\\','/');
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()) {
      if(ignored.test(entry.name)||/(?:^|\/)vendor$|^website\/qa$/.test(rel))continue;
      walk(file);
    }else if(textFile.test(entry.name)||entry.name.startsWith('.env')||entry.name==='.gitignore')inspect(file,rel);
  }
}
walk(root);
console.log(JSON.stringify({scanned, findings},null,2));
if(findings.length)process.exitCode=1;
