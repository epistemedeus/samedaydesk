import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, chmodSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPlan, verifyPlan, validatePolicy, boundedJson, DEFAULT_LIMITS } from '../lib/planner.mjs';
import { RevisionPair, sha256, safePath } from '../lib/git.mjs';
import { JOBS } from '../lib/release.mjs';
import { spawnOwned } from '../../../../server/paid-useful-jobs/release/lib/owned-spawn.mjs';

const cli = resolve('experiments/codex-window/cw48-repository-job-plan/cli.mjs');
function shell(repo, args) { const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Planner Test', GIT_AUTHOR_EMAIL: 'planner@example.invalid', GIT_COMMITTER_NAME: 'Planner Test', GIT_COMMITTER_EMAIL: 'planner@example.invalid' } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
function write(repo, files) { for (const [name, value] of Object.entries(files)) { const file = join(repo, name); mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); } }
function commit(repo) { shell(repo, ['add', '.']); shell(repo, ['commit', '--allow-empty', '-qm', 'caller snapshot']); return shell(repo, ['rev-parse', 'HEAD']); }
function fixture(t, before, after) { const root = mkdtempSync(join(tmpdir(), 'cw48-plan-')); t.after(() => rmSync(root, { recursive: true, force: true })); const repo = join(root, 'repo'); mkdirSync(repo); shell(repo, ['init', '-q']); write(repo, before); const base = commit(repo); write(repo, after); const head = commit(repo); return { root, repo, base, head }; }
function policy(bindings = [], extra = {}) { return { schema: 'samedaydesk.repository-task-policy.v1', callerOwned: true, mode: 'dry-run', execution: 'offline', costCapAtomic: '0', allowedJobs: JOBS, bindings, ...extra }; }
function plan(f, p = policy(), suffix = 'bundle') { return createPlan({ ...f, policy: p, out: join(f.root, suffix) }); }
const lock = version => ({ name: 'caller', lockfileVersion: 3, packages: { '': { name: 'caller' }, 'node_modules/widget': { version, integrity: `sha512-${version}`, resolved: 'https://registry.example.invalid/widget.tgz' } } });
const routes = title => ({ routes: [{ path: '/docs', canonical: 'https://caller.example/docs', title }] });
const price = value => ({ observedAt: '2026-09-12T06:00:00Z', rows: [{ field: 'standard-unit', value, unit: 'USD/request' }] });
function page(title) { return { ok: true, product: 'samedaydesk-extract-batch', schemaVersion: 'samedaydesk.extract-batch.v0', quote: {}, jobId: 'a'.repeat(64), jobStatus: 'completed', stopReason: null, partial: false, sources: [{ id: 'page1', source: 'https://caller.example/docs', status: 'success', data: { title }, notes: [], error: null, provenance: { transport: 'live', completedAt: '2026-09-12T06:00:00Z', finalUrl: 'https://caller.example/docs', httpStatus: 200 } }], accounting: {}, costInputs: {}, charged: false, boundary: {} }; }
const bindings = [{ path: 'schema.json', used: { pointers: ['/event'] } }, { path: 'capture.json', fields: ['title'], clock: '2026-09-12T06:10:00Z' }];
async function runSelected(f, selected, bundle = 'bundle') {
  const dir = join(f.root, bundle);
  const result = await spawnOwned(process.execPath, selected.command.argv.slice(1), { cwd: join(dir, selected.command.cwd), env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768', TMPDIR: join(f.root, 'engine-tmp') }, timeoutMs: 20000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  for (const file of selected.expectedOutputs) assert.ok(existsSync(join(dir, file)), file);
  return JSON.parse(readFileSync(join(dir, selected.expectedOutputs.find(n => n.endsWith('.json')))));
}

test('actual multi-language Git repository selects all five released jobs; actual CLI produces every promised output', async t => {
  const before = { 'package-lock.json': lock('1.0.0'), 'schema.json': { type: 'object', properties: { event: { type: 'string' } } }, 'routes.json': routes('Old docs'), 'vendor.json': price(1), 'capture.json': page('Old page'), 'app.js': 'export const x=1;', 'service.py': 'x=1', 'src/main.rs': 'fn main() {}', 'main.go': 'package main', 'app.rb': 'x=1' };
  const after = { 'package-lock.json': lock('2.0.0'), 'schema.json': { type: 'object', properties: { event: { type: 'number' } } }, 'routes.json': routes('New docs'), 'vendor.json': { ...price(2), rows: [...price(2).rows, { field: 'new-unit', value: 3, unit: 'USD/request' }] }, 'capture.json': page('New page'), 'app.js': 'export const x=2;', 'service.py': 'x=2', 'src/main.rs': 'fn main() { println!("changed"); }', 'main.go': 'package other', 'app.rb': 'x=2' };
  const f = fixture(t, before, after); mkdirSync(join(f.root, 'engine-tmp'));
  const p = await plan(f, policy(bindings));
  assert.equal(p.release.version, '1.4.1'); assert.equal(p.status, 'ready_with_stops'); assert.equal(p.selected.length, 5); assert.equal(p.stops.length, 5); assert.equal(p.semanticNoChangeProven, false);
  assert.deepEqual(new Set(p.selected.map(j => j.job)), new Set(JOBS));
  const digest = sha256(readFileSync(join(f.root, 'bundle/plan.json')));
  assert.ok(verifyPlan(join(f.root, 'bundle'), digest).verifiedFiles > 20);
  for (const selected of p.selected) { assert.ok(existsSync(join(f.root, 'bundle', selected.preflight.receipt))); const result = await runSelected(f, selected); assert.ok(result); if (selected.job === 'vendor-budget-impact') { assert.match(JSON.stringify(result), /new-unit/); assert.match(JSON.stringify(result), /added/); } }
  assert.equal(p.authority.networkUsed, false); assert.equal(p.authority.plannedCostAtomic, '0');
});

test('portable CLI from another cwd and relocated bundle; no untracked or working tree bytes consumed', async t => {
  const f = fixture(t, { 'package-lock.json': lock('1') }, { 'package-lock.json': lock('2') });
  write(f.repo, { 'package-lock.json': Buffer.from([0, 255]), 'secret.json': { token: 'never-read' } });
  const pfile = join(f.root, 'policy.json'); writeFileSync(pfile, JSON.stringify(policy()));
  const r = spawnSync(process.execPath, [cli, 'plan', '--repo', f.repo, '--base', f.base, '--head', f.head, '--policy', pfile, '--out', join(f.root, 'bundle')], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768' } });
  assert.equal(r.status, 0, r.stdout); const p = JSON.parse(r.stdout); assert.equal(p.selected.length, 1); assert.ok(!r.stdout.includes('never-read'));
  renameSync(join(f.root, 'bundle'), join(f.root, 'moved')); mkdirSync(join(f.root, 'engine-tmp'));
  const hash = sha256(readFileSync(join(f.root, 'moved/plan.json'))); assert.equal(verifyPlan(join(f.root, 'moved'), hash).ok, true);
  await runSelected(f, p.selected[0], 'moved');
});

for (const [name, before, after, binding, code] of [
  ['npm v1 refuses', { lockfileVersion: 1, dependencies: {} }, { lockfileVersion: 1, dependencies: { a: {} } }, { job: JOBS[0] }, 'unsupported-lockfile-version'],
  ['package manifest not lockfile', { name: 'app', version: '1' }, { name: 'app', version: '2' }, { job: JOBS[0] }, 'package-json-only'],
  ['OpenAPI not schema migration', { openapi: '3.0.0', paths: {} }, { openapi: '3.1.0', paths: {} }, { job: JOBS[1], used: { pointers: ['/models'] } }, 'not-this-job-openapi'],
  ['OpenAPI not route catalog', { openapi: '3.0.0', paths: {} }, { openapi: '3.1.0', paths: {} }, { job: JOBS[2] }, 'unsupported_catalog'],
  ['remote schema refs', { type: 'object', properties: { x: { $ref: 'https://evil.invalid/a' } } }, { type: 'object', properties: { x: { $ref: 'https://evil.invalid/b' } } }, { job: JOBS[1], used: { pointers: ['/x'] } }, 'remote_ref_refused'],
  ['missing used pins', { type: 'object', properties: {} }, { type: 'object', properties: { x: {} } }, { job: JOBS[1] }, 'missing-used-list'],
  ['bad vendor rows', { rows: [{ field: 'x', value: '1', unit: 'usd' }] }, { rows: [{ field: 'x', value: '2', unit: 'usd' }] }, { job: JOBS[3] }, 'input-schema-mismatch'],
  ['page not merchant capture', { product: 'samedaydesk-extract-batch' }, { product: 'samedaydesk-extract-batch', data: 1 }, { job: JOBS[4], fields: ['title'], clock: '2026-09-12T06:00:00Z' }, 'invalid_or_truncated_page_capture'],
  ['missing clock', page('a'), page('b'), { job: JOBS[4], fields: ['title'] }, 'clock_required'],
]) test(name, async t => { const f = fixture(t, { 'data.json': before }, { 'data.json': after }); const p = await plan(f, policy([{ path: 'data.json', ...binding }])); assert.equal(p.selected.length, 0); assert.equal(p.semanticNoChangeProven, false); assert.equal(p.stops[0].code, code); });

for (const filename of ['yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'Gemfile.lock', 'go.sum']) test(`${filename} is unsupported, never unchanged`, async t => { const f = fixture(t, { [filename]: 'version 1' }, { [filename]: 'version 2' }); const p = await plan(f); assert.equal(p.stops[0].code, 'unsupported_format'); assert.equal(p.semanticNoChangeProven, false); });

test('unknown schema combinator is unknown in actual current CLI output', async t => {
  const f = fixture(t, { 'schema.json': { type: 'object', properties: { event: { type: 'string' } } } }, { 'schema.json': { type: 'object', properties: { event: { allOf: [{ type: 'string' }] } } } }); mkdirSync(join(f.root, 'engine-tmp'));
  const p = await plan(f, policy([bindings[0]])); assert.equal(p.selected.length, 1); const result = await runSelected(f, p.selected[0]); assert.ok(result.impact.unknown.length > 0); assert.equal(p.semanticNoChangeProven, false);
});

test('page absent selected field is coverage unknown, not no-change', async t => {
  const after = page('ignored'); delete after.sources[0].data.title;
  const f = fixture(t, { 'capture.json': page('a') }, { 'capture.json': after }); mkdirSync(join(f.root, 'engine-tmp'));
  const p = await plan(f, policy([bindings[1]])); const result = await runSelected(f, p.selected[0]); assert.equal(result.report.claims.noChangeProven, false); assert.notEqual(result.report.verdict, 'unchanged');
});

test('moving branch refused, immutable commits survive working tree mutation', t => { const f = fixture(t, { a: '1' }, { a: '2' }); shell(f.repo, ['branch', 'review', f.head]); const pair = new RevisionPair(f.repo, f.base, 'review'); shell(f.repo, ['update-ref', 'refs/heads/review', f.base]); assert.throws(() => pair.verify(), { code: 'revision_changed' }); assert.equal(pair.commits.head, f.head); });
test('symlink Git modes refused and worktree symlink never followed', async t => { const f = fixture(t, { 'data.json': lock('1') }, { 'data.json': lock('2') }); rmSync(join(f.repo, 'data.json')); symlinkSync('/etc/passwd', join(f.repo, 'data.json')); f.head = commit(f.repo); const p = await plan(f); assert.equal(p.stops[0].code, 'symlink_or_gitlink'); });
test('SAMPLE sibling survives Git staging boundary', async t => { const f = fixture(t, { 'SAMPLE.txt': 'fixture', 'package-lock.json': lock('1') }, { 'package-lock.json': lock('2') }); const p = await plan(f); assert.equal(p.stops[0].code, 'disguised-sample'); });
test('binary .json never parsed as ordinary text', async t => { const f = fixture(t, { 'data.json': Buffer.from([0, 1]) }, { 'data.json': Buffer.from([0, 2]) }); assert.equal((await plan(f)).stops[0].code, 'binary_input'); });
test('malformed UTF8 refuses', async t => { const f = fixture(t, { 'data.json': '{}' }, { 'data.json': Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]) }); assert.equal((await plan(f)).stops[0].code, 'invalid_json_or_encoding'); });
test('byte bounds refuse before oversized read', async t => { const f = fixture(t, { 'data.json': price(1) }, { 'data.json': price(2) }); const p = await plan(f, policy([], { limits: { maxFileBytes: 10 } })); assert.equal(p.stops[0].code, 'file_byte_limit'); });
test('total bytes bounded without partial no-change claim', async t => { const f = fixture(t, { 'data.json': price(1) }, { 'data.json': price(2) }); const p = await plan(f, policy([], { limits: { maxTotalBytes: 5 } })); assert.equal(p.stops[0].code, 'total_byte_limit'); assert.ok(p.totals.inputBytes <= 5); });
test('row bounds refuse rather than truncate', async t => { const f = fixture(t, { 'data.json': price(1) }, { 'data.json': price(2) }); const p = await plan(f, policy([], { limits: { maxRows: 1 } })); assert.equal(p.stops[0].code, 'row_limit'); });
test('changed file bound refuses whole plan', async t => { const f = fixture(t, { a: '1', b: '1' }, { a: '2', b: '2' }); await assert.rejects(() => plan(f, policy([], { limits: { maxChangedFiles: 1 } })), { code: 'changed_file_limit' }); });
test('new/deleted/renamed files require explicit pair, never synthetic empty snapshots', async t => { const f = fixture(t, { 'old.json': lock('1') }, {}); renameSync(join(f.repo, 'old.json'), join(f.repo, 'new.json')); f.head = commit(f.repo); const p = await plan(f); assert.equal(p.stops.length, 2); assert.ok(p.stops.every(s => s.code === 'paired_snapshot_required')); });
test('live-required stops; no generic models substitute', async t => { const f = fixture(t, { 'package-lock.json': lock('1') }, { 'package-lock.json': lock('2') }); const p = await plan(f, policy([], { execution: 'live-required' })); assert.equal(p.stops[0].code, 'live_contract_unverified'); assert.equal(p.liveContract.available, false); });
test('policy deny wins over heuristic', async t => { const f = fixture(t, { 'package-lock.json': lock('1') }, { 'package-lock.json': lock('2') }); const p = await plan(f, policy([], { allowedJobs: [] })); assert.equal(p.stops[0].code, 'job_not_allowed'); });
test('no diff has precise Git meaning only', async t => { const f = fixture(t, { a: '1' }, {}); const p = await plan(f); assert.equal(p.status, 'no_git_changes'); assert.equal(p.semanticNoChangeProven, false); });
test('tampered or symlinked staged files fail pinned verification', async t => { const f = fixture(t, { 'package-lock.json': lock('1') }, { 'package-lock.json': lock('2') }); const p = await plan(f); const root = join(f.root, 'bundle'), hash = sha256(readFileSync(join(root, 'plan.json'))); const file = join(root, 'inputs/job-001/before.json'); chmodSync(file, 0o600); writeFileSync(file, '{}'); assert.throws(() => verifyPlan(root, hash), { code: 'artifact_digest_mismatch' }); rmSync(file); symlinkSync('/etc/passwd', file); assert.throws(() => verifyPlan(root, hash), { code: 'symlink_path' }); assert.throws(() => verifyPlan(root, '0'.repeat(64)), { code: 'plan_digest_mismatch' }); });
test('existing output and symlink parent never overwritten', async t => { const f = fixture(t, { a: '1' }, { a: '2' }); mkdirSync(join(f.root, 'bundle')); writeFileSync(join(f.root, 'bundle/keep'), 'owned by caller'); await assert.rejects(() => plan(f), { code: 'EEXIST' }); assert.equal(readFileSync(join(f.root, 'bundle/keep'), 'utf8'), 'owned by caller'); symlinkSync(f.root, join(f.root, 'alias')); await assert.rejects(() => createPlan({ ...f, policy: policy(), out: join(f.root, 'alias/other') }), { code: 'symlink_path' }); });
test('strict policy and path authority', () => { for (const change of [{ callerOwned: false }, { costCapAtomic: '1' }, { mode: 'execute' }, { surprise: true }, { limits: { maxRows: Infinity } }]) assert.throws(() => validatePolicy(policy([], change))); for (const path of ['../secret', '/etc/passwd', 'x/../a', '.git/config', 'a\nb', 'a\\b']) assert.throws(() => safePath(path)); assert.throws(() => boundedJson(Buffer.from(JSON.stringify({ a: { b: 1 } })), { ...DEFAULT_LIMITS, maxJsonDepth: 1 }), { code: 'json_structure_limit' }); });
