// Local emitted-file and production-route capture. No external requests.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createSdsApp } from '../../../server/app.js';
const [label, snapshot] = process.argv.slice(2);
if (!['before', 'after'].includes(label) || !snapshot) throw Error('capture.mjs before|after SNAPSHOT_DIRECTORY');
const out = new URL(`./${label}/`, import.meta.url);
mkdirSync(out, { recursive: true });
cpSync('client/dist', snapshot, { recursive: true, errorOnExist: true, force: false });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else { const bytes = readFileSync(path); files.push({ path: relative(snapshot, path), bytes: bytes.length, sha256: sha(bytes) }); }
  }
}
walk(snapshot);
writeFileSync(new URL('emitted-files.json', out), JSON.stringify(files, null, 2) + '\n');
const app = createSdsApp();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const responses = [];
  for (const [name, path] of Object.entries({ descriptor: '/discovery/paid-gateway.json', llms: '/llms.txt', skill: '/skill.md', openapi: '/openapi.json', catalog: '/.well-known/api-catalog', card: '/.well-known/agent-card.json' })) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200) throw Error(`${path}: ${response.status}`);
    writeFileSync(new URL(`${name}.body`, out), bytes);
    responses.push({ path, status: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length, sha256: sha(bytes) });
  }
  writeFileSync(new URL('machine-responses.json', out), JSON.stringify(responses, null, 2) + '\n');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
console.log(JSON.stringify({ label, files: files.length, snapshot }));
