#!/usr/bin/env node
// Public copy check on the built site (rules: design/SELLING-RULES.md). The React routes are
// rendered with system Chrome (--dump-dom), since their words only exist after the app runs;
// static pages and machine files are read as built. Exit 1 on any blocked finding.
//   node scripts/check-public-copy.mjs [builtDir]     default client/dist
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findChrome} from '../tools/browser-smoke/lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, process.argv[2] || 'client/dist');
const out = join(root, '.copy-render');
if (!existsSync(dist)) { console.error(`No built site at ${dist}`); process.exit(2); }

// Every public React route (client/src/App.tsx), signed-in pages excluded.
const ROUTES = ['/', '/x402', '/x402/seller-conformance', '/x402/verified', '/tools/ai-readiness',
  '/for-agents', '/for-agents/record-repeat', '/for-agents/distribution-repair',
  '/for-agents/consumer-repeat', '/for-agents/useful-jobs', '/receipts', '/terms', '/privacy',
  '/login', '/signup', '/no-such-page'];
const MACHINE = ['llms.txt', 'start.md'];

const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'});
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const chrome = findChrome();
if (!chrome) console.warn('No system Chrome: the React routes are not rendered; static pages and machine files only.');
rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
const files = [];
for (const route of chrome ? ROUTES : []) {
  // Async, so this process keeps serving the pages Chrome asks for.
  const r = await promisify(execFile)(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=6000',
    '--dump-dom', base + route], {encoding: 'utf8', maxBuffer: 64 << 20, timeout: 60000}).catch((e) => ({stdout: e.stdout || ''}));
  const name = (route === '/' ? 'home' : route.slice(1).replace(/\//g, '__')) + '.html';
  writeFileSync(join(out, name), r.stdout || '');
  files.push(join(out, name));
}
server.close();

(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const rel = relative(dist, p);
    if (statSync(p).isDirectory()) { if (rel !== 'assets') walk(p); continue; }
    if (name.endsWith('.html') && rel !== 'index.html') files.push(p);
    if (d === dist && MACHINE.includes(name)) files.push(p);
  }
})(dist);

const r = spawnSync(process.execPath, [join(root, 'tools/public-copy-check.mjs'), '--site', 'samedaydesk', ...files], {stdio: 'inherit'});
process.exit(r.status ?? 1);
