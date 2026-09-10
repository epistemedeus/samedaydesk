#!/usr/bin/env node
import {
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { sanitizeTree, shouldSkipName } from './archive-hygiene.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const REPO = join(PKG, '../..');
const S134 = join(REPO, 'experiments/s134-record-jobs');
const S163 = join(REPO, 'experiments/s163-record-recipes');
const pinPath = join(PKG, 'PIN.json');
const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
const tip =
  (process.env.SEMANTICS_TIP || '').trim() ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim() ||
  'uncommitted';
writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);

const stagingRoot = join(PKG, '.staging');
const staging = join(stagingRoot, 'record-repeat-job');
const outDir = join(PKG, 'dist');
const archiveName = `record-repeat-job-${tip.slice(0, 12)}.tar.gz`;
const archivePath = join(outDir, archiveName);

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(outDir, { recursive: true });

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

function copyDir(src, dest, { excludeNames = [] } = {}) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (excludeNames.includes(name) || shouldSkipName(name)) continue;
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) copyDir(s, d, { excludeNames });
    else copyFile(s, d);
  }
}

copyDir(join(S134, 'modules'), join(staging, 'vendor/s134-record-jobs/modules'));
copyDir(join(S134, 'lib'), join(staging, 'vendor/s134-record-jobs/lib'));
copyFile(join(S134, 'package.json'), join(staging, 'vendor/s134-record-jobs/package.json'));
if (existsSync(join(S134, 'package-lock.json'))) {
  copyFile(join(S134, 'package-lock.json'), join(staging, 'vendor/s134-record-jobs/package-lock.json'));
}
if (existsSync(join(S134, 'fixtures'))) {
  copyDir(join(S134, 'fixtures'), join(staging, 'vendor/s134-record-jobs/fixtures'));
}

copyDir(join(S163, 'adapters'), join(staging, 'vendor/s163-record-recipes/adapters'));
copyDir(join(S163, 'recipes'), join(staging, 'vendor/s163-record-recipes/recipes'));
copyDir(join(S163, 'sources'), join(staging, 'vendor/s163-record-recipes/sources'), {
  excludeNames: ['capture-a.atom.xml', 'capture-b.atom.xml'],
});
copyDir(join(S163, 'registry'), join(staging, 'vendor/s163-record-recipes/registry'));
if (existsSync(join(S163, 'fixtures'))) {
  copyDir(join(S163, 'fixtures'), join(staging, 'vendor/s163-record-recipes/fixtures'));
}

copyDir(join(PKG, 'bin'), join(staging, 'bin'));
for (const rel of [
  'PIN.json',
  'MANIFEST.json',
  'LICENSE',
  'SOURCE.txt',
  'INSTALL.txt',
  'SKILL.md',
]) {
  const src = join(PKG, rel);
  if (!existsSync(src)) throw new Error(`missing ${rel}`);
  copyFile(src, join(staging, rel));
}
copyDir(join(PKG, 'docs'), join(staging, 'docs'));
copyDir(join(PKG, 'test'), join(staging, 'test'), {
  excludeNames: ['archive-hygiene.test.mjs'],
});

const leaks = sanitizeTree(staging);
if (leaks.length) {
  throw new Error(
    `archive hygiene failed (private paths/secrets/transcripts):\n${leaks
      .map((h) => `${h.kind} ${h.file}`)
      .join('\n')}`,
  );
}

const archivePkg = {
  name: '@samedaydesk/record-repeat-job',
  version: '0.1.0',
  private: true,
  type: 'module',
  engines: { node: '>=20' },
  description:
    'Lean acquisition package: four offline source/record repeat-job families over S134 parsers.',
  bin: { 'record-repeat': './bin/record-repeat.mjs' },
  scripts: {
    test: 'node --test test/*.test.mjs',
    sample: 'node bin/record-repeat.mjs sample --all',
  },
};
writeFileSync(join(staging, 'package.json'), `${JSON.stringify(archivePkg, null, 2)}\n`);

const npmCi = spawnSync('npm', ['ci', '--omit=dev'], {
  cwd: join(staging, 'vendor/s134-record-jobs'),
  encoding: 'utf8',
});
if (npmCi.status !== 0) {
  const npmInstall = spawnSync('npm', ['install', '--omit=dev'], {
    cwd: join(staging, 'vendor/s134-record-jobs'),
    encoding: 'utf8',
  });
  if (npmInstall.status !== 0) {
    throw new Error(npmInstall.stderr || npmCi.stderr || 'npm install failed');
  }
}

const tarArgs = ['-czf', archivePath, '-C', stagingRoot, 'record-repeat-job'];
const tarProbe = spawnSync('tar', ['--version'], { encoding: 'utf8' });
if (String(tarProbe.stdout || '').includes('GNU tar')) {
  tarArgs.splice(
    0,
    0,
    '--sort=name',
    '--mtime=UTC0',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
  );
}
const packed = spawnSync('tar', tarArgs, { encoding: 'utf8' });
if (packed.status !== 0) throw new Error(packed.stderr || 'tar failed');

const bytes = readFileSync(archivePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const receipt = {
  schema: 'samedaydesk.lean-archive-receipt.v1',
  packageId: 'record-repeat-job',
  archive: archiveName,
  bytes: bytes.length,
  sha256,
  semanticsTip: tip,
  parserPin: pin.parserPin,
  recipePin: pin.recipePin,
  builtAt: new Date().toISOString(),
};
writeFileSync(join(outDir, 'archive.sha256.json'), `${JSON.stringify(receipt, null, 2)}\n`);
writeFileSync(join(outDir, 'archive.sha256'), `${sha256}  ${archiveName}\n`);

const publicKit = join(REPO, 'client/public/kit');
mkdirSync(publicKit, { recursive: true });
cpSync(archivePath, join(publicKit, archiveName));
cpSync(join(outDir, 'archive.sha256.json'), join(publicKit, 'record-repeat-archive.sha256.json'));

const discovery = {
  schema: 'samedaydesk.acquisition-discovery.v1',
  packageId: 'record-repeat-job',
  title: 'Offline OpenAPI, price-row, keyed CSV, and feed comparison package',
  summary: 'Compare local before/after OpenAPI used operations, price/unit rows, keyed CSV, and RSS/Atom feeds. Labeled samples and next-run manifests included. Does not fetch, charge, or schedule.',
  page: 'https://samedaydesk.com/for-agents/record-repeat',
  archive: {
    path: `/kit/${archiveName}`,
    url: `https://samedaydesk.com/kit/${archiveName}`,
    sha256,
    bytes: bytes.length,
  },
  pins: {
    parser: pin.parserPin,
    recipes: pin.recipePin,
    semanticsTip: tip,
  },
  families: ['openapi-used-ops', 'pricing-row-unit', 'csv-keyed-drift', 'rss-atom-brief'],
  runsOffline: true,
  invokesPricedExecution: false,
  coldStart: [
    `curl -fsSL -o record-repeat-job.tar.gz https://samedaydesk.com/kit/${archiveName}`,
    'mkdir -p /tmp && tar -xzf record-repeat-job.tar.gz -C /tmp',
    'cd /tmp/record-repeat-job',
    'node bin/record-repeat.mjs sample --all',
  ],
  materialLimit: 'Unsupported HTML and missing identity or units are refused, not invented.',
};
mkdirSync(join(REPO, 'client/public/discovery'), { recursive: true });
writeFileSync(
  join(REPO, 'client/public/discovery/record-repeat.json'),
  `${JSON.stringify(discovery, null, 2)}\n`,
);
writeFileSync(join(PKG, 'discovery/record-repeat.json'), `${JSON.stringify(discovery, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
