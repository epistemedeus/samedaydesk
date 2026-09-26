import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
function check(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules') continue;
    if (item.isDirectory()) check(`${dir}/${item.name}`);
    else if (item.name.endsWith('.mjs')) {
      const r = spawnSync(process.execPath, ['--check', `${dir}/${item.name}`], { encoding: 'utf8' });
      if (r.status) throw new Error(r.stderr); count++;
    }
  }
}
check(root); console.log(JSON.stringify({ syntaxChecked: count }));
