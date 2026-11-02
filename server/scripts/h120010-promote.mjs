#!/usr/bin/env node
// Closed machine-only promotion from installed aa861e98 to reviewed 6bde3ec4.
// Roots, the public client, and the destination are arguments. This file does
// not embed a worker scratch path, an account store, or a production credential.
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const ADMISSION = Object.freeze({
  schema: 'sds.h120010.machine-promotion.v1',
  repository: 'https://github.com/epistemedeus/samedaydesk.git',
  baselineCommit: 'aa861e980df0f75a782ff30996450cf15870f2e7',
  candidateCommit: '6bde3ec4df57df5f0783fec38f39eacbadfb6d9e',
  baselineSourceSha256: '5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2',
  baselineHostSha256: '4c0614fc44913b35278757904647b62e0dc35fe6fe0f18a49eae4c9f7b3e4177',
  recordedCandidateSourceSha256: '458c129b2397099200be163ea6b11be61926114f9d6842897607cfcb9a771ba8',
  humanInventorySha256: '6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5',
  humanFiles: 352,
  humanBytes: 59951737,
  runtimeCommit: '427f5a08e3b294a8f15fb9d148f7de46ca7cb538',
  deskCommit: '0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556',
  clientSha256: 'accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9',
  clientBytes: 30187,
  descriptorSha256: '1b6e9c1099f1420d53564674f71e15544333812dcc2c682062aae7af2f5295c4',
  descriptorBytes: 2327,
  clientSource: Object.freeze({
    repository: 'epistemedeus/neomorphic-io',
    commit: 'b79f985e83e829288a675407a4b4124e58a11f3a',
    path: 'clients/cold-requester-0.3.1.mjs',
  }),
  installedHostinger: '01a19731-bfd7-7095-9ec8-7c3218fb8aec',
  flags: Object.freeze({publicReads: '0', fundedTasks: 'off', payments: 'off', humanAssets: 'off', money: 'unfunded', signerAuthority: false}),
});

export const PIN = 'server/foundry/activation/private-control-pin.json';
const SOURCE_PREFIXES = [
  'vendor/hosted-wallet-market/bin/',
  'vendor/hosted-wallet-market/client/',
  'vendor/hosted-wallet-market/contracts/',
  'vendor/hosted-wallet-market/schema/',
  'vendor/hosted-wallet-market/src/',
  'vendor/hosted-wallet-market/runtime/',
];
const SOURCE_FILES = new Set([
  'vendor/hosted-wallet-market/package.json',
  'vendor/hosted-wallet-market/package-lock.json',
]);
const FROZEN = [
  'vendor/neomorphic-contributor-journey/SOURCE.json',
  'vendor/neomorphic-contributor-desk/SOURCE.json',
];
const here = dirname(fileURLToPath(import.meta.url));

export function fail(code, extra = {}) {
  const error = new Error(code);
  error.codeName = code;
  Object.assign(error, extra);
  return error;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function safeRelative(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 4096 &&
    !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

export function humanSurface(name) {
  return name.startsWith('client/') || name.startsWith('publication/') || name.startsWith('web-guides/') ||
    (name.startsWith('public/') && /\.(html|css|svg|png|woff2|ico|webp)$/.test(name));
}

export function closureMember(name, pinKeys) {
  if (name === PIN || pinKeys.has(name) || SOURCE_FILES.has(name)) return true;
  return SOURCE_PREFIXES.some(prefix => name.startsWith(prefix));
}

export function selectMembers(changed, pinKeys) {
  const payload = [];
  const excluded = [];
  const coupled = [];
  for (const name of [...changed].sort()) {
    if (!safeRelative(name)) throw fail('path_refused', {path: name});
    if (FROZEN.includes(name)) throw fail('frozen_runtime_refused', {path: name});
    if (!closureMember(name, pinKeys)) {
      excluded.push({path: name, reason: 'outside_machine_closure'});
      continue;
    }
    if (humanSurface(name)) {
      coupled.push(name);
      excluded.push({path: name, reason: 'human_surface_coupled'});
      continue;
    }
    payload.push(name);
  }
  return {payload, excluded, coupled};
}

function git(repo, args, encoding) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitBytes(repo, commit, path) {
  try {
    return git(repo, ['show', `${commit}:${path}`]);
  } catch (error) {
    if (String(error.stderr || '').includes('exists on disk') || String(error.stderr || '').includes('does not exist')) return null;
    if (/exists on disk|does not exist|Path .* does not exist/.test(String(error.stderr || error.message))) return null;
    throw error;
  }
}

function existsAt(repo, commit, path) {
  const probe = spawnSync('git', ['-C', repo, 'cat-file', '-e', `${commit}:${path}`], {stdio: 'ignore'});
  return probe.status === 0;
}

export async function measureProduct(root) {
  const href = pathToFileURL(join(root, 'vendor/hosted-wallet-market/src/native-debt.mjs')).href;
  const mod = await import(href);
  return {sourceSha256: mod.installedSourceSha256(), hostSha256: mod.hostSourceSha256(root)};
}

export function readPin(bytes) {
  const pin = JSON.parse(bytes.toString('utf8'));
  if (!pin || typeof pin !== 'object' || !pin.files || typeof pin.files !== 'object') throw fail('pin_refused');
  return pin;
}

export function sourceConstant(root) {
  const body = JSON.parse(readFileSync(join(root, 'vendor/hosted-wallet-market/SOURCE.json'), 'utf8'));
  return {
    recordedSourceSha256: body.installedSourceSha256,
    agreesWithMeasured: null,
    installedFlag: body.installed,
  };
}

function walkFiles(dir) {
  const out = new Map();
  const rec = prefix => {
    for (const name of readdirSync(prefix ? join(dir, prefix) : dir)) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (!safeRelative(rel)) throw fail('path_refused', {path: rel});
      const absolute = join(dir, rel);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw fail('link_refused', {path: rel});
      if (stat.isDirectory()) rec(rel);
      else if (!stat.isFile()) throw fail('special_refused', {path: rel});
      else out.set(rel, sha256(readFileSync(absolute)));
    }
  };
  rec('');
  return out;
}

export function compareDirectories(left, right) {
  const a = walkFiles(left);
  const b = walkFiles(right);
  const mismatched = [];
  const onlyLeft = [];
  const onlyRight = [];
  for (const [file, digest] of a) {
    if (!b.has(file)) onlyLeft.push(file);
    else if (b.get(file) !== digest) mismatched.push(file);
  }
  for (const file of b.keys()) if (!a.has(file)) onlyRight.push(file);
  const files = [...a.keys()].sort();
  return {
    equal: mismatched.length === 0 && onlyLeft.length === 0 && onlyRight.length === 0,
    files: a.size,
    mismatched, onlyLeft, onlyRight,
    leftInventory: inventoryOf([...a].sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0)),
    rightInventory: inventoryOf([...b].sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0)),
  };
}

function inventoryOf(pairs) {
  return sha256(Buffer.from(JSON.stringify(pairs)));
}

export function preservedClient(root) {
  const run = spawnSync(process.execPath, ['--max-old-space-size=256', join(root, 'server/scripts/publish-preserved-client.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1'},
  });
  let body = null;
  try { body = JSON.parse(run.stdout || ''); } catch { body = null; }
  return {status: run.status ?? 1, body, stderr: (run.stderr || '').slice(0, 500)};
}

function writeBytes(file, bytes) {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, bytes, {mode: 0o644});
}

function memberBytes(bundleDir, role, path) {
  const file = join(bundleDir, role, path);
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw fail('member_refused', {path});
  return readFileSync(file);
}

export function loadManifest(bundleDir) {
  const manifest = JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8'));
  if (manifest?.schema !== 'sds.h120010.machine-bundle.v1') throw fail('bundle_refused');
  if (manifest.baselineCommit !== ADMISSION.baselineCommit || manifest.candidateCommit !== ADMISSION.candidateCommit) {
    throw fail('wrong_source');
  }
  if (!Array.isArray(manifest.members) || manifest.members.length === 0) throw fail('bundle_refused');
  return manifest;
}

// Compact form, sha256 field omitted. Pretty printing of the file is not part of the digest.
export function manifestDigest(manifest) {
  const copy = {...manifest};
  delete copy.sha256;
  return sha256(Buffer.from(JSON.stringify(copy)));
}

export async function buildBundle({repo, out}) {
  const changed = git(repo, ['diff', '--name-only', ADMISSION.baselineCommit, ADMISSION.candidateCommit], 'utf8')
    .split('\n').map(line => line.trim()).filter(Boolean);
  const baselinePin = readPin(gitBytes(repo, ADMISSION.baselineCommit, PIN));
  const candidatePin = readPin(gitBytes(repo, ADMISSION.candidateCommit, PIN));
  const pinKeys = new Set([...Object.keys(baselinePin.files), ...Object.keys(candidatePin.files)]);
  const selected = selectMembers(changed, pinKeys);
  if (selected.coupled.length) throw fail('human_surface_coupled', {paths: selected.coupled});
  rmSync(out, {recursive: true, force: true});
  mkdirSync(out, {recursive: true});
  const members = [];
  for (const path of selected.payload) {
    const baseline = existsAt(repo, ADMISSION.baselineCommit, path) ? gitBytes(repo, ADMISSION.baselineCommit, path) : null;
    const candidate = gitBytes(repo, ADMISSION.candidateCommit, path);
    if (!candidate) throw fail('candidate_member_missing', {path});
    const baselineSha256 = baseline ? sha256(baseline) : null;
    const candidateSha256 = sha256(candidate);
    if (baseline && baselineSha256 === candidateSha256) continue;
    if (baseline) writeBytes(join(out, 'baseline', path), baseline);
    writeBytes(join(out, 'candidate', path), candidate);
    members.push({
      path,
      baselineBytes: baseline ? baseline.length : 0,
      candidateBytes: candidate.length,
      baselineSha256,
      candidateSha256,
    });
  }
  const recorded = JSON.parse(git(repo, ['show', `${ADMISSION.candidateCommit}:vendor/hosted-wallet-market/SOURCE.json`], 'utf8'));
  const manifest = {
    schema: 'sds.h120010.machine-bundle.v1',
    baselineCommit: ADMISSION.baselineCommit,
    candidateCommit: ADMISSION.candidateCommit,
    baselineSourceSha256: ADMISSION.baselineSourceSha256,
    baselineHostSha256: ADMISSION.baselineHostSha256,
    recordedCandidateSourceSha256: recorded.installedSourceSha256,
    recordedSourceConstantAuthority: false,
    runtimeCommit: ADMISSION.runtimeCommit,
    deskCommit: ADMISSION.deskCommit,
    flags: ADMISSION.flags,
    members,
    excluded: selected.excluded,
  };
  manifest.sha256 = manifestDigest(manifest);
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o644});
  writeFileSync(join(out, 'partition.json'), `${JSON.stringify({
    schema: 'sds.h120010.machine-partition.v1',
    payload: members.map(member => member.path),
    excluded: selected.excluded,
    humanSurfaceCoupled: selected.coupled,
    frozenUntouched: FROZEN,
  }, null, 2)}\n`);
  return manifest;
}

function expectedSide(member, role) {
  return role === 'candidate'
    ? {bytes: member.candidateBytes, sha256: member.candidateSha256, other: member.baselineSha256, otherBytes: member.baselineBytes}
    : {bytes: member.baselineBytes, sha256: member.baselineSha256, other: member.candidateSha256, otherBytes: member.candidateBytes};
}

export async function applyBundle({bundleDir, destination, role, measure = measureProduct}) {
  if (role !== 'candidate' && role !== 'baseline') throw fail('role_refused');
  const manifest = loadManifest(bundleDir);
  if (manifest.sha256 !== manifestDigest(manifest)) throw fail('bundle_digest_refused');
  if (!/^[a-f0-9]{64}$/.test(manifest.measuredCandidateSourceSha256 || '') || !/^[a-f0-9]{64}$/.test(manifest.measuredCandidateHostSha256 || '')) {
    throw fail('bundle_identity_unmeasured');
  }
  const root = resolve(destination);
  const before = await measure(root);
  const expectBefore = role === 'candidate'
    ? {sourceSha256: manifest.baselineSourceSha256, hostSha256: manifest.baselineHostSha256}
    : {sourceSha256: manifest.measuredCandidateSourceSha256, hostSha256: manifest.measuredCandidateHostSha256};
  if (before.sourceSha256 !== expectBefore.sourceSha256 || before.hostSha256 !== expectBefore.hostSha256) {
    throw fail('predecessor_refused', {before, expectBefore});
  }
  // Non-pin payload first. The pin is last so a crash cannot publish a pin that names bytes not yet written.
  const writing = [...manifest.members].sort((a, b) => Number(a.path === PIN) - Number(b.path === PIN) || a.path.localeCompare(b.path));
  if (writing.some(member => member.path === PIN) && writing.at(-1).path !== PIN) throw fail('pin_order_refused');
  for (const member of writing) {
    if (!safeRelative(member.path) || humanSurface(member.path) || FROZEN.includes(member.path)) throw fail('human_surface_refused', {path: member.path});
    const side = expectedSide(member, role);
    if (side.bytes === 0) {
      const target = join(root, member.path);
      if (existsSync(target)) {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile()) throw fail('member_refused', {path: member.path});
        if (side.other && sha256(readFileSync(target)) !== side.other) throw fail('destination_member_refused', {path: member.path});
        rmSync(target);
      }
      continue;
    }
    const bytes = memberBytes(bundleDir, role, member.path);
    if (!bytes || bytes.length !== side.bytes || sha256(bytes) !== side.sha256) throw fail('member_digest_refused', {path: member.path});
    const currentPath = join(root, member.path);
    if (side.otherBytes === 0) {
      if (existsSync(currentPath)) throw fail('destination_member_refused', {path: member.path});
    } else if (side.other) {
      if (!existsSync(currentPath)) throw fail('destination_member_missing', {path: member.path});
      const current = readFileSync(currentPath);
      if (sha256(current) !== side.other) throw fail('destination_member_refused', {path: member.path});
    }
    const resolved = resolve(currentPath);
    if (resolved !== root && !resolved.startsWith(root + sep)) throw fail('path_refused', {path: member.path});
    writeBytes(resolved, bytes);
  }
  const after = await measure(root);
  const expectAfter = role === 'candidate'
    ? {sourceSha256: manifest.measuredCandidateSourceSha256, hostSha256: manifest.measuredCandidateHostSha256}
    : {sourceSha256: manifest.baselineSourceSha256, hostSha256: manifest.baselineHostSha256};
  if (after.sourceSha256 !== expectAfter.sourceSha256 || after.hostSha256 !== expectAfter.hostSha256) {
    throw fail('installed_identity_refused', {after, expectAfter});
  }
  return {ok: true, role, before, after, members: manifest.members.length};
}

export function sealMeasuredIdentity(bundleDir, measured) {
  const manifest = loadManifest(bundleDir);
  manifest.measuredCandidateSourceSha256 = measured.sourceSha256;
  manifest.measuredCandidateHostSha256 = measured.hostSha256;
  manifest.recordedSourceConstantAgrees = manifest.recordedCandidateSourceSha256 === measured.sourceSha256;
  delete manifest.sha256;
  manifest.sha256 = manifestDigest(manifest);
  writeFileSync(join(bundleDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyFrozen(root) {
  const runtime = JSON.parse(readFileSync(join(root, FROZEN[0]), 'utf8'));
  const desk = JSON.parse(readFileSync(join(root, FROZEN[1]), 'utf8'));
  if (runtime.sourceCommit !== ADMISSION.runtimeCommit) throw fail('runtime_pin_refused');
  if (desk.sourceCommit !== ADMISSION.deskCommit) throw fail('desk_pin_refused');
  return {runtimeCommit: runtime.sourceCommit, deskCommit: desk.sourceCommit, publicEnabled: desk.publicEnabled};
}

export function compareHuman(baselineRoot, candidateRoot) {
  const left = preservedClient(baselineRoot);
  const right = preservedClient(candidateRoot);
  const bytes = compareDirectories(join(baselineRoot, 'client/dist'), join(candidateRoot, 'client/dist'));
  return {
    schema: 'sds.h120010.human-comparison.v1',
    build: 'server/scripts/publish-preserved-client.mjs',
    viteInvoked: false,
    baseline: left,
    candidate: right,
    byteEqual: bytes.equal,
    files: bytes.files,
    mismatched: bytes.mismatched,
    onlyBaseline: bytes.onlyLeft,
    onlyCandidate: bytes.onlyRight,
    inventorySha256: bytes.equal ? bytes.leftInventory : null,
    preservedInventoryAgrees: left.body?.inventorySha256 === ADMISSION.humanInventorySha256 &&
      right.body?.inventorySha256 === ADMISSION.humanInventorySha256,
  };
}

function arg(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function emit(value, status = value.ok === false ? 1 : 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = status;
}

async function main() {
  const command = process.argv[2];
  try {
    if (command === 'bundle') {
      const manifest = await buildBundle({repo: resolve(arg('--repo') || process.cwd()), out: resolve(arg('--out'))});
      emit({ok: true, members: manifest.members.length, sha256: manifest.sha256, recordedSourceConstantAgrees: false});
    } else if (command === 'seal') {
      const manifest = sealMeasuredIdentity(resolve(arg('--bundle')), JSON.parse(readFileSync(arg('--measured'), 'utf8')));
      emit({ok: true, sha256: manifest.sha256, measuredCandidateSourceSha256: manifest.measuredCandidateSourceSha256,
        recordedSourceConstantAgrees: manifest.recordedSourceConstantAgrees});
    } else if (command === 'install' || command === 'rollback') {
      const result = await applyBundle({
        bundleDir: resolve(arg('--bundle')),
        destination: resolve(arg('--destination')),
        role: command === 'install' ? 'candidate' : 'baseline',
      });
      emit(result);
    } else if (command === 'compare-human') {
      const report = compareHuman(resolve(arg('--baseline')), resolve(arg('--candidate')));
      const out = arg('--out');
      if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
      emit({ok: report.byteEqual && report.baseline.status === 0 && report.candidate.status === 0, ...report});
    } else if (command === 'verify') {
      const root = resolve(arg('--root'));
      emit({ok: true, ...(await measureProduct(root)), ...verifyFrozen(root)});
    } else if (command === 'receive') {
      const {runReceive} = await import('./h120010-receive.mjs');
      emit(await runReceive({
        repo: resolve(arg('--repo') || process.cwd()),
        destination: resolve(arg('--destination')),
        state: resolve(arg('--state')),
        client: resolve(arg('--client')),
        descriptor: resolve(arg('--descriptor')),
        bundle: resolve(arg('--bundle')),
        evidence: resolve(arg('--evidence')),
        result: resolve(arg('--result')),
      }));
    } else {
      emit({ok: false, code: 'usage'}, 2);
    }
  } catch (error) {
    emit({ok: false, code: error.codeName || 'promotion_failed', message: error.message, path: error.path, before: error.before, after: error.after}, 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // The module must finish evaluating before main imports the receiver, which
  // imports this file. A top-level await here deadlocks that cycle.
  const keepAlive = setInterval(() => {}, 1000);
  main().catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    if (!process.exitCode) process.exitCode = 1;
  }).finally(() => clearInterval(keepAlive));
}
