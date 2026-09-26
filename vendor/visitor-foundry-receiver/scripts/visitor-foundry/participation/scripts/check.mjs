import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules') continue; const path = join(dir, e.name); if (e.isDirectory()) walk(path); else if (e.name.endsWith('.mjs')) execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' }); } }
walk(root); console.log('All owned JavaScript parsed.');
