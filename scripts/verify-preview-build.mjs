// Verify the application build; external OneBot services are user-managed.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const appRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist', 'win-unpacked', 'resources', 'app');
const required = ['electron', 'src', 'ui', 'bundled', 'package.json'];
const missing = required.filter(name => !fs.existsSync(path.join(appRoot, name)));
console.log(JSON.stringify({ appRoot, required, missing }, null, 2));
if (missing.length) process.exitCode = 1;
