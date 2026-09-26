import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { schemas, schemaId } from '../src/contracts.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const [name, body] of Object.entries(schemas)) {
  const bytes = `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: schemaId(name), ...body }, null, 2)}\n`;
  const path = `${root}schema/${name}.v1.json`;
  if (process.argv.includes('--write-schemas')) writeFileSync(path, bytes);
  else if (readFileSync(path, 'utf8') !== bytes) throw new Error(`Schema drift: ${name}`);
}
for (const file of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.mjs') && !f.startsWith('.local/'))) {
  const result = spawnSync(process.execPath, ['--check', `${root}${file}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
}
console.log('Exported schemas match; JavaScript syntax checks passed.');
