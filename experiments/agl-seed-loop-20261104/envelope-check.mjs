// Resolve one dotted path against a raw HTTP JSON body. No repository imports.
import {readFileSync} from 'node:fs';

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function emit(payload, status) {
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(status);
}

const rawPath = flag('--raw');
const path = flag('--path');
if (!rawPath || !path) emit({ok: false, code: 'usage'}, 1);
const raw = readFileSync(rawPath, 'utf8');
let body;
try { body = JSON.parse(raw); }
catch { emit({ok: false, code: 'raw_refused', path}, 1); }
let node = body;
for (const key of path.split('.')) {
  if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) {
    emit({ok: false, code: 'path_absent', path, key}, 1);
  }
  node = node[key];
}
const equals = flag('--equals');
const schema = flag('--schema');
const task = flag('--task');
if (equals !== null && node !== equals) emit({ok: false, code: 'value_mismatch', path}, 1);
if (schema !== null && node?.schema !== schema) emit({ok: false, code: 'schema_mismatch', path}, 1);
if (task !== null && !(Array.isArray(node) && node.some((item) => item && item.taskId === task))) {
  emit({ok: false, code: 'task_mismatch', path}, 1);
}
const excerpt = raw.length > 220 ? raw.slice(0, 220) : raw;
emit({ok: true, path, excerpt}, 0);
