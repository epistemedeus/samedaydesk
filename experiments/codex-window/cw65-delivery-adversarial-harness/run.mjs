#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { finished } from 'node:stream/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PACK, REPO, readJson, writeJson } from './lib/context.mjs';
import { sha256 } from './lib/oracle.mjs';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const only = option('--only');
const evidence = resolve(option('--evidence') || join(PACK, 'evidence', new Date().toISOString().replaceAll(':', '-')));
if (existsSync(evidence)) throw new Error('Refusing to overwrite evidence directory: ' + evidence);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'cw65-owned-'));
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim();
};
const base = readJson(join(PACK, 'IMPORTS.json')).base;
const owned = path => /^experiments\/wave5\/d(?:16|18|19|20)\//.test(path) || path.startsWith('experiments/codex-window/cw65-delivery-adversarial-harness/');
const split = text => text.split('\n').filter(Boolean);
const dirty = [...new Set([
  ...split(git('diff', '--name-only', 'HEAD')),
  ...split(git('diff', '--cached', '--name-only', 'HEAD')),
  ...split(git('ls-files', '--others', '--exclude-standard')),
])];
const vsImportBase = split(git('diff', '--name-only', base));
const otherSlicesOnBranch = vsImportBase.filter(p => !owned(p));
const runtimePaths = ['server/paid-useful-jobs', 'tools/managed-useful-jobs-order', 'tools/result-mailbox',
  'tools/job-output-atomicity', 'tools/job-input-preflight', 'tools/lockfile-pin-delta', 'tools/json-schema-webhook-drift',
  'tools/route-table-diff', 'tools/page-change-offline-job', 'experiments/wave5/m01', 'client/public/for-agents/useful-jobs'];
const runtimeDirty = dirty.filter(p => runtimePaths.some(root => p === root || p.startsWith(root + '/')));
if (runtimeDirty.length) throw new Error('Uncommitted runtime changes (CW65 must not edit shared runtime): ' + runtimeDirty.join(', '));
function runtimeHashes() {
  return Object.fromEntries(git('ls-files', '--', ...runtimePaths).split('\n').filter(Boolean).map(path => [path, sha256(readFileSync(join(REPO, path)))]));
}
function harnessHashes() {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'evidence') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path); else if (entry.isFile() && path.endsWith('.mjs')) files.push(path);
    }
  }
  walk(PACK);
  for (const id of ['d16', 'd18', 'd19', 'd20']) files.push(join(REPO, 'experiments/wave5', id, 'current.mjs'));
  return Object.fromEntries(files.sort().map(path => [path.slice(REPO.length + 1), sha256(readFileSync(path))]));
}
const before = runtimeHashes();
writeJson(join(evidence, 'manifest.json'), { schema: 'cw65.current-core-acceptance.v1', startedAt: new Date().toISOString(),
  repoHead: git('rev-parse', 'HEAD'), coreBase: base, branch: git('branch', '--show-current'), hostname: hostname(),
  node: process.version, execPath: process.execPath, concurrency: 1, heapMB: 768, http: 'ephemeral loopback',
  postgres: 'not requested; optional dedicated 55595 lane not run', only, scratch,
  runtimePin: '8a811bbadba7edc6c926b319b0839cd2f01e5896',
  uncommittedOwned: dirty, otherSlicesOnBranchCount: otherSlicesOnBranch.length,
  ownershipCheck: 'uncommitted runtime paths refuse; sibling H7 consumer dirtiness vs HEAD and vs IMPORTS base is recorded, not a runner failure',
  runtimeHashes: before, harnessHashes: harnessHashes(),
  historicalSources: 'IMPORTS.json; preserved only, no historical pin loader executed' });

async function suite(name) {
  const out = createWriteStream(join(evidence, name + '.tap')), err = createWriteStream(join(evidence, name + '.stderr'));
  const argv = ['--max-old-space-size=768', '--test', '--test-concurrency=1', '--test-reporter=tap', join(PACK, 'test', name + '.test.mjs')];
  const child = spawn(process.execPath, argv, { cwd: REPO, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768',
    CW65_EVIDENCE: evidence, CW65_SCRATCH: scratch, CW65_ONLY: only || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out); child.stderr.pipe(err);
  const result = await new Promise((resolveDone, reject) => { child.on('error', reject); child.on('close', (status, signal) => resolveDone({ status, signal })); });
  await Promise.all([finished(out), finished(err)]);
  writeJson(join(evidence, name + '-process.json'), { command: process.execPath, args: argv, ...result });
  process.stdout.write(name + ': exit ' + result.status + '\n');
  return result;
}

try {
  const controls = await suite('controls');
  const acceptance = await suite('acceptance');
  const casesRoot = join(evidence, 'cases');
  const verdicts = readdirSync(casesRoot).flatMap(id => {
    const path = join(casesRoot, id, 'verdict.json'); return existsSync(path) ? [readJson(path)] : [];
  });
  const runtimeUnchanged = JSON.stringify(before) === JSON.stringify(runtimeHashes());
  const selected = only ? verdicts.find(v => v.id === only) || null : null;
  const selectedOnly = Boolean(only);
  const acceptancePass = verdicts.filter(v => v.status === 'pass').length;
  const acceptanceFail = verdicts.filter(v => v.status === 'fail').length;
  const acceptanceIncomplete = verdicts.filter(v => v.status === 'incomplete').length;
  // A filtered --only run never grants global readiness, even if the selected case passes.
  const ready = !selectedOnly && controls.status === 0 && acceptance.status === 0 && runtimeUnchanged
    && verdicts.length > 0 && acceptanceFail === 0 && acceptanceIncomplete === 0 && acceptancePass === verdicts.length;
  const summary = { ready, selectedOnly, selected: selected ? { id: selected.id, status: selected.status } : null,
    controls: { status: controls.status === 0 ? 'pass' : 'fail', readinessCredit: 0, raw: 'controls.tap' },
    acceptance: { pass: acceptancePass, fail: acceptanceFail,
      incomplete: acceptanceIncomplete, process: acceptance, raw: 'acceptance.tap' },
    runtimeUnchanged, cases: verdicts.map(({ id, status, error }) => ({ id, status, message: error?.message || null })) };
  writeJson(join(evidence, 'summary.json'), summary);
  process.stdout.write(JSON.stringify({ ...summary, cases: undefined, evidence }, null, 2) + '\n');
  process.exitCode = summary.ready ? 0 : summary.acceptance.fail || controls.status !== 0 || !runtimeUnchanged ? 2 : 3;
} finally {
  // Only this invocation's scratch tree. Raw inputs, process streams, packages and durable stores remain in evidence.
  rmSync(scratch, { recursive: true, force: true });
  writeJson(join(evidence, 'scratch-cleanup.json'), { path: scratch, removed: !existsSync(scratch) });
}
