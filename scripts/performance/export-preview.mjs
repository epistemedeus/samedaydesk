// A portable production-static mount, with only its existing Express/compression
// runtime. npm's frozen offline install owns transitive dependency placement.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), out = args[args.indexOf('--out') + 1];
if (!args.includes('--out') || !isAbsolute(out ?? '') || existsSync(out)) throw Error('--out must be a new absolute directory');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--untracked-files=no')) throw Error('commit the production source first');
const source = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
const fs = statfsSync(root);
if ((fs.files - fs.ffree) / fs.files >= .9) throw Error('inode admission refused: at least90% used');
if (!existsSync(join(root, 'client/dist/route-shells/.public-first-render/home.html'))) throw Error('build:managed-foundry must complete first');
mkdirSync(out, { mode: 0o700 });
const stage = mkdtempSync(join(out, '.export-'));
try {
  const files = ['server/lib/spa-client.js', 'server/lib/spa-fallback.js', 'server/lib/spa-route-shells.js',
    'server/lib/start-guide.js', 'server/lib/receipt-snapshot.js', 'client/src/data/receiptPages.mjs',
    'client/src/data/receipts.json', 'client/src/data/machineEntry.mjs', 'client/src/data/distributionRepairKit.json',
    'client/src/data/consumerRepeatKit.json', 'client/src/data/usefulJobsKit.json',
    'scripts/performance/preview-server.mjs', 'scripts/performance/run-n12.mjs', 'scripts/performance/capture-lcp-diagnostic.mjs'];
  for (const file of files) { mkdirSync(dirname(join(stage, file)), { recursive: true }); cpSync(join(root, file), join(stage, file)); }
  cpSync(join(root, 'client/dist'), join(stage, 'client/dist'), { recursive: true });
  cpSync(join(root, 'scripts/performance/runtime/package.json'), join(stage, 'package.json'));
  cpSync(join(root, 'scripts/performance/runtime/package-lock.json'), join(stage, 'package-lock.json'));
  execFileSync('npm', ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, stdio: 'inherit' });
  const hashes = {};
  function receive(dir) { for (const e of readdirSync(join(stage, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) receive(p);
    else if (e.isFile()) hashes[p] = createHash('sha256').update(readFileSync(join(stage, p))).digest('hex');
    else throw Error('non-regular export member');
  } }
  receive('client/dist'); receive('server'); receive('scripts');
  const metadata = { schema: 'samedaydesk.performance-preview.v1', source, tree,
    pages: JSON.parse(readFileSync(join(root, 'release/key-pages.json'))).pages.filter(p => p.lighthouse !== false).map(p => p.path),
    buildCommand: 'npm run build:managed-foundry', mount: 'production Express mount, not legacy static route shells',
    originalN12Source: 'd4190b9affb6453a355518369de91dcd9717d703', files: hashes };
  writeFileSync(join(stage, 'preview-source.json'), JSON.stringify(metadata, null, 2) + '\n');
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: stage, encoding: 'utf8' }))[0];
  const archive = join(out, packed.filename);
  // npm pack excludes node_modules unless explicitly bundled.
  if (!packed.bundled?.includes('express') || !packed.bundled?.includes('compression')) throw Error('portable runtime not bundled');
  if (git('rev-parse', 'HEAD') !== source || git('status', '--porcelain', '--untracked-files=no')) throw Error('source changed during export');
  writeFileSync(join(out, 'receipt.json'), JSON.stringify({ source, tree, file: packed.filename, bytes: packed.size,
    sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), regularSourceFiles: Object.keys(hashes).length }, null, 2) + '\n');
  console.log(archive);
} finally { rmSync(stage, { recursive: true, force: true }); }
