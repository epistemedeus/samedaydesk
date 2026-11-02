#!/usr/bin/env node
// Closed machine-only promotion helper.
// The reviewed pair lives in an explicit release contract. This file does not
// embed a worker scratch path, an account store, or a production credential.
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PIN = 'server/foundry/activation/private-control-pin.json';
export const RELEASE_SCHEMA = 'sds.h120010.release-contract.v1';
export const PROGRESS_SCHEMA = 'sds.h120010.apply-progress.v1';
const PROGRESS_OWNER = 'h120010-apply';
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
const FLAG_KEYS = ['publicReads', 'fundedTasks', 'payments', 'humanAssets', 'money', 'signerAuthority'];
const FROZEN_FLAGS = Object.freeze({publicReads: '0', fundedTasks: 'off', payments: 'off', humanAssets: 'off', money: 'unfunded', signerAuthority: false});
const TOP_KEYS = ['schema', 'repository', 'source', 'runtime', 'client', 'descriptor', 'endpoints', 'flags', 'human', 'installedHostinger', 'releaseOrder'];
const SOURCE_KEYS = ['baselineCommit', 'candidateCommit', 'baselineSourceSha256', 'baselineHostSha256', 'measuredCandidateSourceSha256', 'measuredCandidateHostSha256', 'recordedCandidateSourceSha256', 'recordedSourceConstantAuthority', 'recordedSourceConstantAgrees'];
const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const HTTPS_PATH = /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_./~-]+$/;

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

function exactKeys(value, keys) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function validateReleaseContract(input) {
  if (!exactKeys(input, TOP_KEYS) || input.schema !== RELEASE_SCHEMA) throw fail('contract_refused');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(input.repository)) throw fail('contract_refused');
  const source = input.source;
  if (!exactKeys(source, SOURCE_KEYS)) throw fail('contract_refused');
  if (!HEX40.test(source.baselineCommit) || !HEX40.test(source.candidateCommit)) throw fail('contract_refused');
  if (source.baselineCommit === source.candidateCommit) throw fail('contract_contradiction');
  for (const key of ['baselineSourceSha256', 'baselineHostSha256', 'measuredCandidateSourceSha256', 'measuredCandidateHostSha256', 'recordedCandidateSourceSha256']) {
    if (!HEX64.test(source[key])) throw fail('contract_refused');
  }
  if (source.baselineSourceSha256 === source.measuredCandidateSourceSha256 && source.baselineHostSha256 === source.measuredCandidateHostSha256) {
    throw fail('contract_contradiction');
  }
  if (source.recordedSourceConstantAuthority !== false) throw fail('contract_contradiction');
  if (source.recordedSourceConstantAgrees !== (source.recordedCandidateSourceSha256 === source.measuredCandidateSourceSha256)) {
    throw fail('contract_contradiction');
  }
  const runtime = input.runtime;
  if (!exactKeys(runtime, ['journeyCommit', 'deskCommit', 'journeySource', 'deskSource'])) throw fail('contract_refused');
  if (!HEX40.test(runtime.journeyCommit) || !HEX40.test(runtime.deskCommit)) throw fail('contract_refused');
  if (runtime.journeyCommit === runtime.deskCommit) throw fail('contract_contradiction');
  if (runtime.journeySource !== FROZEN[0] || runtime.deskSource !== FROZEN[1]) throw fail('contract_contradiction');
  const client = input.client;
  if (!exactKeys(client, ['version', 'sha256', 'bytes', 'repository', 'commit', 'path'])) throw fail('contract_refused');
  if (client.version !== '0.3.1' || !HEX64.test(client.sha256) || !Number.isSafeInteger(client.bytes) || client.bytes <= 0) throw fail('contract_refused');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(client.repository) || !HEX40.test(client.commit) || !safeRelative(client.path)) throw fail('contract_refused');
  const descriptor = input.descriptor;
  if (!exactKeys(descriptor, ['schema', 'sha256', 'bytes', 'requiredProfile', 'source'])) throw fail('contract_refused');
  if (descriptor.schema !== 'neomorphic.machine-participation.acquisition.v1') throw fail('contract_contradiction');
  if (!HEX64.test(descriptor.sha256) || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes <= 0) throw fail('contract_refused');
  const profile = descriptor.requiredProfile;
  if (!exactKeys(profile, ['money', 'participation', 'sourceSha256', 'hostSha256'])) throw fail('contract_refused');
  if (profile.money !== 'unfunded' || profile.participation !== 'voluntary-artifact-v1') throw fail('contract_contradiction');
  if (profile.sourceSha256 !== source.baselineSourceSha256 || profile.hostSha256 !== source.baselineHostSha256) throw fail('contract_contradiction');
  if (!exactKeys(descriptor.source, ['repository', 'commit', 'path'])) throw fail('contract_refused');
  if (descriptor.source.repository !== client.repository || descriptor.source.commit !== client.commit || descriptor.source.path !== client.path) {
    throw fail('contract_contradiction');
  }
  const endpoints = input.endpoints;
  if (!exactKeys(endpoints, ['profile', 'participationContract'])) throw fail('contract_refused');
  if (!HTTPS_PATH.test(endpoints.profile) || !HTTPS_PATH.test(endpoints.participationContract)) throw fail('contract_refused');
  if (endpoints.profile.includes('@') || endpoints.participationContract.includes('@')) throw fail('contract_contradiction');
  if (endpoints.profile === endpoints.participationContract) throw fail('contract_contradiction');
  if (!exactKeys(input.flags, FLAG_KEYS)) throw fail('contract_refused');
  for (const key of FLAG_KEYS) if (input.flags[key] !== FROZEN_FLAGS[key]) throw fail('contract_contradiction');
  const human = input.human;
  if (!exactKeys(human, ['build', 'viteInvoked', 'inventorySha256', 'files', 'bytes'])) throw fail('contract_refused');
  if (human.build !== 'server/scripts/publish-preserved-client.mjs' || human.viteInvoked !== false) throw fail('contract_contradiction');
  if (!HEX64.test(human.inventorySha256) || !Number.isSafeInteger(human.files) || human.files <= 0 || !Number.isSafeInteger(human.bytes) || human.bytes <= 0) {
    throw fail('contract_refused');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.installedHostinger)) throw fail('contract_refused');
  const order = input.releaseOrder;
  if (!exactKeys(order, ['artifacts', 'descriptorPublication', 'partialCodeRepair', 'pinLastAloneAtomic', 'schema011', 'rule'])) throw fail('contract_refused');
  if (!Array.isArray(order.artifacts) || order.artifacts.length !== 2 || order.artifacts[0] !== 'code-bundle' || order.artifacts[1] !== 'acquisition-descriptor') {
    throw fail('contract_contradiction');
  }
  if (order.descriptorPublication !== 'after-measured-candidate-identity' || order.partialCodeRepair !== 'progress-journal' || order.pinLastAloneAtomic !== false) {
    throw fail('contract_contradiction');
  }
  if (order.schema011 !== 'separate-sql-not-dropped-on-code-rollback') throw fail('contract_contradiction');
  if (typeof order.rule !== 'string' || order.rule.length < 40 || order.rule.length > 2000) throw fail('contract_refused');
  return input;
}

export function loadReleaseContract(file) {
  if (!file || !existsSync(file) || !lstatSync(file).isFile()) throw fail('contract_required', {path: file});
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw fail('contract_refused', {path: file}); }
  return validateReleaseContract(parsed);
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
    if (/exists on disk|does not exist|Path .* does not exist/.test(String(error.stderr || error.message))) return null;
    throw error;
  }
}

function existsAt(repo, commit, path) {
  const probe = spawnSync('git', ['-C', repo, 'cat-file', '-e', `${commit}:${path}`], {stdio: 'ignore'});
  return probe.status === 0;
}

export function closureDrift(repo, commit) {
  const out = git(repo, ['diff', '--name-only', commit, '--', PIN, 'server/lib/hosted-wallet-market-mount.js', 'vendor/hosted-wallet-market'], 'utf8');
  return out.split('\n').map(line => line.trim()).filter(Boolean);
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
  let bytes = 0;
  const rec = prefix => {
    for (const name of readdirSync(prefix ? join(dir, prefix) : dir)) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (!safeRelative(rel)) throw fail('path_refused', {path: rel});
      const absolute = join(dir, rel);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw fail('link_refused', {path: rel});
      if (stat.isDirectory()) rec(rel);
      else if (!stat.isFile()) throw fail('special_refused', {path: rel});
      else {
        const body = readFileSync(absolute);
        bytes += body.length;
        out.set(rel, sha256(body));
      }
    }
  };
  rec('');
  return {files: out, bytes};
}

export function compareDirectories(left, right) {
  const a = walkFiles(left);
  const b = walkFiles(right);
  const mismatched = [];
  const onlyLeft = [];
  const onlyRight = [];
  for (const [file, digest] of a.files) {
    if (!b.files.has(file)) onlyLeft.push(file);
    else if (b.files.get(file) !== digest) mismatched.push(file);
  }
  for (const file of b.files.keys()) if (!a.files.has(file)) onlyRight.push(file);
  return {
    equal: mismatched.length === 0 && onlyLeft.length === 0 && onlyRight.length === 0,
    files: a.files.size,
    leftBytes: a.bytes,
    rightBytes: b.bytes,
    mismatched, onlyLeft, onlyRight,
    leftInventory: inventoryOf([...a.files].sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0)),
    rightInventory: inventoryOf([...b.files].sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0)),
  };
}

function inventoryOf(pairs) {
  return sha256(Buffer.from(JSON.stringify(pairs)));
}

export function preservedViteInvoked(left, right) {
  return left?.body?.viteInvoked === false && right?.body?.viteInvoked === false ? false : true;
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

export function loadManifest(bundleDir, contract) {
  validateReleaseContract(contract);
  const manifest = JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8'));
  if (manifest?.schema !== 'sds.h120010.machine-bundle.v1') throw fail('bundle_refused');
  if (manifest.baselineCommit !== contract.source.baselineCommit || manifest.candidateCommit !== contract.source.candidateCommit) {
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

function bindSealedManifest(manifest, contract) {
  if (manifest.sha256 !== manifestDigest(manifest)) throw fail('bundle_digest_refused');
  if (!HEX64.test(manifest.measuredCandidateSourceSha256 || '') || !HEX64.test(manifest.measuredCandidateHostSha256 || '')) {
    throw fail('bundle_identity_unmeasured');
  }
  const source = contract.source;
  const same = manifest.baselineSourceSha256 === source.baselineSourceSha256 &&
    manifest.baselineHostSha256 === source.baselineHostSha256 &&
    manifest.measuredCandidateSourceSha256 === source.measuredCandidateSourceSha256 &&
    manifest.measuredCandidateHostSha256 === source.measuredCandidateHostSha256 &&
    manifest.recordedCandidateSourceSha256 === source.recordedCandidateSourceSha256 &&
    manifest.recordedSourceConstantAuthority === false &&
    manifest.recordedSourceConstantAgrees === source.recordedSourceConstantAgrees &&
    manifest.runtimeCommit === contract.runtime.journeyCommit &&
    manifest.deskCommit === contract.runtime.deskCommit &&
    JSON.stringify(manifest.flags) === JSON.stringify(contract.flags);
  if (!same) throw fail('bundle_contract_refused');
  return manifest;
}

export async function buildBundle({repo, out, contract}) {
  validateReleaseContract(contract);
  const source = contract.source;
  const recorded = JSON.parse(git(repo, ['show', `${source.candidateCommit}:vendor/hosted-wallet-market/SOURCE.json`], 'utf8'));
  if (recorded.installedSourceSha256 !== source.recordedCandidateSourceSha256) throw fail('contract_contradiction');
  const changed = git(repo, ['diff', '--name-only', source.baselineCommit, source.candidateCommit], 'utf8')
    .split('\n').map(line => line.trim()).filter(Boolean);
  const baselinePin = readPin(gitBytes(repo, source.baselineCommit, PIN));
  const candidatePin = readPin(gitBytes(repo, source.candidateCommit, PIN));
  const pinKeys = new Set([...Object.keys(baselinePin.files), ...Object.keys(candidatePin.files)]);
  const selected = selectMembers(changed, pinKeys);
  if (selected.coupled.length) throw fail('human_surface_coupled', {paths: selected.coupled});
  const staged = [];
  for (const path of selected.payload) {
    const baseline = existsAt(repo, source.baselineCommit, path) ? gitBytes(repo, source.baselineCommit, path) : null;
    const candidate = gitBytes(repo, source.candidateCommit, path);
    if (!candidate) throw fail('candidate_member_missing', {path});
    const baselineSha256 = baseline ? sha256(baseline) : null;
    const candidateSha256 = sha256(candidate);
    if (baseline && baselineSha256 === candidateSha256) continue;
    staged.push({path, baseline, candidate, baselineSha256, candidateSha256});
  }
  rmSync(out, {recursive: true, force: true});
  mkdirSync(out, {recursive: true});
  const members = [];
  for (const item of staged) {
    if (item.baseline) writeBytes(join(out, 'baseline', item.path), item.baseline);
    writeBytes(join(out, 'candidate', item.path), item.candidate);
    members.push({
      path: item.path,
      baselineBytes: item.baseline ? item.baseline.length : 0,
      candidateBytes: item.candidate.length,
      baselineSha256: item.baselineSha256,
      candidateSha256: item.candidateSha256,
    });
  }
  const manifest = {
    schema: 'sds.h120010.machine-bundle.v1',
    baselineCommit: source.baselineCommit,
    candidateCommit: source.candidateCommit,
    baselineSourceSha256: source.baselineSourceSha256,
    baselineHostSha256: source.baselineHostSha256,
    recordedCandidateSourceSha256: recorded.installedSourceSha256,
    recordedSourceConstantAuthority: false,
    runtimeCommit: contract.runtime.journeyCommit,
    deskCommit: contract.runtime.deskCommit,
    flags: contract.flags,
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

function stagedBytes(bundleDir, member, role) {
  const side = expectedSide(member, role);
  if (side.bytes === 0) {
    if (side.sha256 !== null) throw fail('member_digest_refused', {path: member.path});
    return null;
  }
  const bytes = memberBytes(bundleDir, role, member.path);
  if (!bytes || bytes.length !== side.bytes || sha256(bytes) !== side.sha256) throw fail('member_digest_refused', {path: member.path});
  return bytes;
}

function classifyMember(root, member, role) {
  const side = expectedSide(member, role);
  const target = join(root, member.path);
  if (!existsSync(target)) {
    if (side.bytes === 0) return 'target';
    if (side.otherBytes === 0) return 'predecessor';
    return 'foreign';
  }
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) return 'foreign';
  const digest = sha256(readFileSync(target));
  if (side.sha256 && digest === side.sha256) return 'target';
  if (side.other && digest === side.other) return 'predecessor';
  return 'foreign';
}

function pinLast(members) {
  return [...members].sort((a, b) => Number(a.path === PIN) - Number(b.path === PIN) || a.path.localeCompare(b.path));
}

function roleEnds(contract, role) {
  const baseline = {sourceSha256: contract.source.baselineSourceSha256, hostSha256: contract.source.baselineHostSha256};
  const candidate = {sourceSha256: contract.source.measuredCandidateSourceSha256, hostSha256: contract.source.measuredCandidateHostSha256};
  return role === 'candidate' ? {from: baseline, to: candidate} : {from: candidate, to: baseline};
}

function sameIdentity(left, right) {
  return left?.sourceSha256 === right?.sourceSha256 && left?.hostSha256 === right?.hostSha256;
}

function writeProgress(file, value) {
  const banned = Object.keys(value).some(key => /password|token|secret|database|credential|cookie|postgres/i.test(key));
  if (banned || value.schema !== PROGRESS_SCHEMA || value.owner !== PROGRESS_OWNER || value.pinLastAloneAtomic !== false) throw fail('progress_refused');
  const bytes = JSON.stringify(value);
  mkdirSync(dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

function readProgress(file) {
  let value;
  try { value = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw fail('progress_refused'); }
  if (!value || value.schema !== PROGRESS_SCHEMA || value.owner !== PROGRESS_OWNER || value.pinLastAloneAtomic !== false) throw fail('progress_refused');
  if (Object.keys(value).some(key => /password|token|secret|database|credential|cookie|postgres/i.test(key))) throw fail('progress_refused');
  if (!HEX64.test(value.bundleSha256 || '') || (value.phase !== 'writing' && value.phase !== 'complete')) throw fail('progress_refused');
  if (value.role !== 'candidate' && value.role !== 'baseline') throw fail('progress_refused');
  for (const end of [value.from, value.to]) {
    if (!HEX64.test(end?.sourceSha256 || '') || !HEX64.test(end?.hostSha256 || '')) throw fail('progress_refused');
  }
  return value;
}

function mutateMember(root, member, role, payload) {
  const side = expectedSide(member, role);
  const resolved = resolve(join(root, member.path));
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw fail('path_refused', {path: member.path});
  const kind = classifyMember(root, member, role);
  if (kind === 'foreign') throw fail('destination_unrelated_refused', {path: member.path});
  if (kind === 'target') return false;
  if (kind !== 'predecessor') throw fail('destination_member_refused', {path: member.path});
  if (side.bytes === 0) rmSync(resolved);
  else writeBytes(resolved, payload);
  return true;
}

export async function applyBundle({bundleDir, destination, role, contract, progressFile, measure = measureProduct, interruptAfterWrites = null}) {
  validateReleaseContract(contract);
  if (role !== 'candidate' && role !== 'baseline') throw fail('role_refused');
  if (!progressFile || typeof progressFile !== 'string') throw fail('progress_required');
  const root = resolve(destination);
  const progressPath = resolve(progressFile);
  if (progressPath === root || progressPath.startsWith(`${root}${sep}`)) throw fail('progress_refused');
  const manifest = bindSealedManifest(loadManifest(bundleDir, contract), contract);
  const ends = roleEnds(contract, role);
  const payloads = new Map();
  for (const member of manifest.members) {
    if (!safeRelative(member.path) || humanSurface(member.path) || FROZEN.includes(member.path)) throw fail('human_surface_refused', {path: member.path});
    if ((member.baselineBytes === 0) !== (member.baselineSha256 == null) || (member.candidateBytes === 0) !== (member.candidateSha256 == null)) {
      throw fail('member_digest_refused', {path: member.path});
    }
    stagedBytes(bundleDir, member, 'candidate');
    stagedBytes(bundleDir, member, 'baseline');
    payloads.set(member.path, stagedBytes(bundleDir, member, role));
    const resolved = resolve(join(root, member.path));
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw fail('path_refused', {path: member.path});
  }
  let progress = existsSync(progressPath) ? readProgress(progressPath) : null;
  if (progress && (progress.bundleSha256 !== manifest.sha256 || progress.destination !== root)) throw fail('progress_refused');
  const kinds = () => manifest.members.map(member => ({member, kind: classifyMember(root, member, role)}));
  if (progress?.phase === 'complete') {
    const current = kinds();
    const measured = await measure(root);
    if (progress.role === role) {
      if (!sameIdentity(progress.to, ends.to) || !sameIdentity(measured, progress.to) || current.some(item => item.kind !== 'target')) {
        throw fail('installed_identity_refused', {after: measured, expectAfter: ends.to});
      }
      return {ok: true, role, before: progress.from, after: measured, members: manifest.members.length, resumed: true, pinLastAloneAtomic: false};
    }
    if (!sameIdentity(measured, progress.to) || current.some(item => item.kind !== 'predecessor')) throw fail('predecessor_refused', {before: measured, expectBefore: ends.from});
    progress = null;
  }
  const recovering = Boolean(progress);
  if (recovering) {
    const forward = sameIdentity(progress.from, ends.from) && sameIdentity(progress.to, ends.to);
    const reverse = sameIdentity(progress.to, ends.from) && sameIdentity(progress.from, ends.to);
    if (!forward && !reverse) throw fail('progress_refused');
  }
  const seen = kinds();
  const foreign = seen.find(item => item.kind === 'foreign');
  if (foreign) throw fail(recovering ? 'destination_unrelated_refused' : 'destination_member_refused', {path: foreign.member.path});
  if (!recovering) {
    const conflict = seen.find(item => item.kind !== 'predecessor');
    if (conflict) throw fail('destination_member_refused', {path: conflict.member.path});
    const before = await measure(root);
    if (!sameIdentity(before, ends.from)) throw fail('predecessor_refused', {before, expectBefore: ends.from});
    progress = {
      schema: PROGRESS_SCHEMA,
      owner: PROGRESS_OWNER,
      bundleSha256: manifest.sha256,
      destination: root,
      role,
      from: ends.from,
      to: ends.to,
      pinLastAloneAtomic: false,
      phase: 'writing',
    };
    writeProgress(progressPath, progress);
  }
  if (interruptAfterWrites === 0) throw fail('apply_interrupted');
  const pending = pinLast(seen.filter(item => item.kind !== 'target').map(item => item.member));
  if (pending.some(member => member.path === PIN) && pending.length > 1 && pending.at(-1).path !== PIN) throw fail('pin_order_refused');
  let writes = 0;
  for (const member of pending) {
    if (mutateMember(root, member, role, payloads.get(member.path))) writes += 1;
    if (Number.isInteger(interruptAfterWrites) && writes >= interruptAfterWrites) throw fail('apply_interrupted', {path: member.path});
  }
  const after = await measure(root);
  if (!sameIdentity(after, ends.to)) throw fail('installed_identity_refused', {after, expectAfter: ends.to});
  writeProgress(progressPath, {...progress, role, from: ends.from, to: ends.to, phase: 'complete', pinLastAloneAtomic: false});
  return {ok: true, role, before: ends.from, after, members: manifest.members.length, resumed: recovering, pinLastAloneAtomic: false};
}

export function sealMeasuredIdentity(bundleDir, measured, contract) {
  validateReleaseContract(contract);
  if (measured?.sourceSha256 !== contract.source.measuredCandidateSourceSha256 || measured?.hostSha256 !== contract.source.measuredCandidateHostSha256) {
    throw fail('measured_identity_refused');
  }
  const manifest = loadManifest(bundleDir, contract);
  manifest.measuredCandidateSourceSha256 = measured.sourceSha256;
  manifest.measuredCandidateHostSha256 = measured.hostSha256;
  manifest.recordedSourceConstantAgrees = contract.source.recordedSourceConstantAgrees;
  delete manifest.sha256;
  manifest.sha256 = manifestDigest(manifest);
  writeFileSync(join(bundleDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyFrozen(root, contract) {
  validateReleaseContract(contract);
  const runtime = JSON.parse(readFileSync(join(root, FROZEN[0]), 'utf8'));
  const desk = JSON.parse(readFileSync(join(root, FROZEN[1]), 'utf8'));
  if (runtime.sourceCommit !== contract.runtime.journeyCommit) throw fail('runtime_pin_refused');
  if (desk.sourceCommit !== contract.runtime.deskCommit) throw fail('desk_pin_refused');
  return {runtimeCommit: runtime.sourceCommit, deskCommit: desk.sourceCommit, publicEnabled: desk.publicEnabled};
}

export function compareHuman(baselineRoot, candidateRoot, contract) {
  validateReleaseContract(contract);
  const left = preservedClient(baselineRoot);
  const right = preservedClient(candidateRoot);
  const bytes = compareDirectories(join(baselineRoot, 'client/dist'), join(candidateRoot, 'client/dist'));
  const inventory = contract.human.inventorySha256;
  return {
    schema: 'sds.h120010.human-comparison.v1',
    build: contract.human.build,
    viteInvoked: preservedViteInvoked(left, right),
    baseline: left,
    candidate: right,
    byteEqual: bytes.equal,
    files: bytes.files,
    leftBytes: bytes.leftBytes,
    rightBytes: bytes.rightBytes,
    mismatched: bytes.mismatched,
    onlyBaseline: bytes.onlyLeft,
    onlyCandidate: bytes.onlyRight,
    inventorySha256: bytes.equal ? bytes.leftInventory : null,
    preservedInventoryAgrees: preservedViteInvoked(left, right) === false && left.body?.inventorySha256 === inventory && right.body?.inventorySha256 === inventory &&
      bytes.equal && bytes.leftInventory === inventory && bytes.files === contract.human.files &&
      bytes.leftBytes === contract.human.bytes && bytes.rightBytes === contract.human.bytes,
  };
}

export function successorDescriptor(published, contract) {
  validateReleaseContract(contract);
  if (!published || published.schema !== contract.descriptor.schema || published.version !== contract.client.version) throw fail('descriptor_contract_refused');
  const source = published.source || {};
  if (source.repository !== contract.client.repository || source.commit !== contract.client.commit || source.path !== contract.client.path) {
    throw fail('descriptor_provenance_refused');
  }
  if (published.sha256 !== contract.client.sha256 || published.bytes !== contract.client.bytes) throw fail('descriptor_client_refused');
  if (published.profile !== contract.endpoints.profile || published.contract !== contract.endpoints.participationContract) throw fail('endpoint_refused');
  const required = published.requiredProfile || {};
  if (required.money !== 'unfunded' || required.participation !== 'voluntary-artifact-v1' ||
    required.sourceSha256 !== contract.source.baselineSourceSha256 || required.hostSha256 !== contract.source.baselineHostSha256) {
    throw fail('descriptor_contract_refused');
  }
  const next = structuredClone(published);
  next.requiredProfile.sourceSha256 = contract.source.measuredCandidateSourceSha256;
  next.requiredProfile.hostSha256 = contract.source.measuredCandidateHostSha256;
  next.publicationStatus = 'private_unreleased';
  next.hostedAcquisitionVerified = false;
  next.apiActivation = false;
  next.fundingOrPaymentActivation = false;
  next.humanPage = false;
  next.acquisitionClock = 'Private contained successor. No hosted acquisition claimed.';
  next.predecessor = contract.descriptor.sha256;
  const slug = contract.repository.slice('https://github.com/'.length, -'.git'.length);
  next.succession = {
    schema: 'neomorphic.acquisition-binding-succession.v1',
    binding: contract.source.candidateCommit.slice(0, 8),
    reviewedHostSource: {repository: slug, commit: contract.source.candidateCommit},
    predecessorHostSha256: contract.source.baselineHostSha256,
    predecessorProfile: {
      money: 'unfunded',
      participation: 'voluntary-artifact-v1',
      sourceSha256: contract.source.baselineSourceSha256,
      hostSha256: contract.source.baselineHostSha256,
    },
    independentlyReceived: false,
    independentReleaseAuthority: false,
    hostedAcquisitionClaim: false,
    publication: 'private',
  };
  const bytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
  if (sha256(bytes) === contract.descriptor.sha256) throw fail('descriptor_contract_refused');
  return {descriptor: next, bytes, sha256: sha256(bytes), published: false};
}

function arg(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function emit(value, status = value.ok === false ? 1 : 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = status;
}

function requireContract() {
  const file = arg('--contract');
  if (!file) throw fail('contract_required');
  return loadReleaseContract(resolve(file));
}

async function main() {
  const command = process.argv[2];
  try {
    if (!command || command === '--help') {
      emit({ok: false, code: 'usage'}, 2);
      return;
    }
    const contract = requireContract();
    if (command === 'bundle') {
      const manifest = await buildBundle({repo: resolve(arg('--repo') || process.cwd()), out: resolve(arg('--out')), contract});
      emit({ok: true, members: manifest.members.length, sha256: manifest.sha256, recordedSourceConstantAgrees: contract.source.recordedSourceConstantAgrees});
    } else if (command === 'seal') {
      const manifest = sealMeasuredIdentity(resolve(arg('--bundle')), JSON.parse(readFileSync(arg('--measured'), 'utf8')), contract);
      emit({ok: true, sha256: manifest.sha256, measuredCandidateSourceSha256: manifest.measuredCandidateSourceSha256,
        recordedSourceConstantAgrees: manifest.recordedSourceConstantAgrees});
    } else if (command === 'install' || command === 'rollback') {
      const result = await applyBundle({
        bundleDir: resolve(arg('--bundle')),
        destination: resolve(arg('--destination')),
        role: command === 'install' ? 'candidate' : 'baseline',
        contract,
        progressFile: resolve(arg('--progress')),
      });
      emit(result);
    } else if (command === 'compare-human') {
      const report = compareHuman(resolve(arg('--baseline')), resolve(arg('--candidate')), contract);
      const out = arg('--out');
      if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
      emit({ok: report.byteEqual && report.baseline.status === 0 && report.candidate.status === 0 && report.preservedInventoryAgrees === true, ...report});
    } else if (command === 'verify') {
      const root = resolve(arg('--root'));
      emit({ok: true, ...(await measureProduct(root)), ...verifyFrozen(root, contract)});
    } else if (command === 'successor') {
      const published = JSON.parse(readFileSync(arg('--descriptor'), 'utf8'));
      const body = readFileSync(arg('--descriptor'));
      if (body.length !== contract.descriptor.bytes || sha256(body) !== contract.descriptor.sha256) throw fail('descriptor_pin_refused');
      const successor = successorDescriptor(published, contract);
      const out = resolve(arg('--out'));
      writeFileSync(out, successor.bytes, {mode: 0o600});
      emit({ok: true, sha256: successor.sha256, bytes: successor.bytes.length, published: false});
    } else if (command === 'receive') {
      const {runReceive} = await import('./h120010-receive.mjs');
      emit(await runReceive({
        repo: resolve(arg('--repo') || process.cwd()),
        destination: resolve(arg('--destination')),
        state: resolve(arg('--state')),
        client: resolve(arg('--client')),
        descriptor: resolve(arg('--descriptor')),
        contract: resolve(arg('--contract')),
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
