/** SPDX-License-Identifier: MIT. Minimal licensed caller closure; no backend or owner state. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const PACKAGE = 'relevant-activation-caller-0.1.0';
const digest = (body) => createHash('sha256').update(body).digest('hex');

function walk(path, prefix = '') {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('export symlink refused');
    return entry.isDirectory() ? walk(join(path, entry.name), rel + '/') : [rel];
  });
}

export function pack(destination = join(root, 'export'), sourcePin = 'uncommitted_candidate') {
  const acquired = JSON.parse(readFileSync(join(root, 'EIN-ACQUISITION.json')));
  const vendor = acquired.files.map(({ path }) => `vendor/ein-activation-continuation/${path}`);
  const owned = [
    'LICENSE', 'README.md', 'SOURCE-NOTICE.md', 'EIN-ACQUISITION.json',
    'bin/sds-activation.mjs', ...walk(join(root, 'src')).map((path) => `src/${path}`),
    ...walk(join(root, 'examples')).map((path) => `examples/${path}`),
  ];
  const stage = mkdtempSync(join(tmpdir(), 'sol384-profile-stage-'));
  const name = PACKAGE + '.tgz';
  const files = [];
  const write = (path, body, mode = 0o644) => {
    const target = join(stage, PACKAGE, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, { mode });
    files.push({ path, bytes: body.length, mode, sha256: digest(body) });
  };
  try {
    for (const path of [...owned, ...vendor].sort()) {
      const stat = lstatSync(join(root, path));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('export source must be a regular file');
      const body = readFileSync(join(root, path));
      if (path.startsWith('vendor/')) {
        const rel = path.slice('vendor/ein-activation-continuation/'.length);
        const expected = acquired.files.find(({ path }) => path === rel);
        if (digest(body) !== expected.sha256 || body.length !== expected.bytes) throw new Error('acquired source changed');
      }
      write(path, body, path.endsWith('/bin/ein-continuation.mjs') || path === 'bin/sds-activation.mjs' ? 0o755 : 0o644);
    }
    write('package.json', Buffer.from(JSON.stringify({ name: '@samedaydesk/relevant-activation-caller', version: '0.1.0', type: 'module', license: 'MIT', engines: { node: '>=22' }, exports: './src/composition.mjs' }, null, 2) + '\n'));
    const archive = join(stage, name);
    const tar = spawnSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', archive, '-C', stage, PACKAGE], { env: { PATH: process.env.PATH, LANG: 'C' }, encoding: 'utf8' });
    if (tar.status !== 0) throw new Error('native pack failed');
    const body = readFileSync(archive);
    mkdirSync(destination, { recursive: true });
    const target = join(destination, name);
    if (existsSync(target) && digest(readFileSync(target)) !== digest(body)) throw new Error('immutable profile archive differs');
    if (!existsSync(target)) writeFileSync(target, body);
    const manifest = { schema: 'samedaydesk.relevant-activation.profile.v1', name: PACKAGE, sourcePin,
      license: 'MIT', archive: name, bytes: body.length, sha256: digest(body), files: files.sort((a, b) => a.path.localeCompare(b.path)),
      published: false, productionAcquisition: false, customerActivation: 'unknown',
      ein: { source: acquired.source, version: acquired.version, archiveSha256: acquired.sha256, acquiredMembers: vendor.length, modified: false },
      backendIncluded: false, npmDependencies: [], credentialsIncluded: false, ownerStateIncluded: false,
      readiness: { origin: 'https://samedaydesk.com', path: '/api/public-readiness/supplied-row', newMount: false } };
    writeFileSync(join(destination, PACKAGE + '.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = pack(undefined, process.env.SOL384_SOURCE_PIN);
  process.stdout.write(JSON.stringify({ archive: result.archive, bytes: result.bytes, sha256: result.sha256, files: result.files.length, published: result.published, sourcePin: result.sourcePin }) + '\n');
}
