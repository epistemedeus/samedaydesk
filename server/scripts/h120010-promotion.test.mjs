import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  PIN, PROGRESS_SCHEMA, applyBundle, buildBundle, closureMember, humanSurface, loadManifest, loadReleaseContract,
  manifestDigest, measureProduct, preservedViteInvoked, safeRelative, sealMeasuredIdentity, selectMembers, sha256, successorDescriptor,
  validateReleaseContract,
} from './h120010-promote.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const contractPath = fileURLToPath(new URL('../../docs/machine-promotion/release-contract.json', import.meta.url));
const contract = loadReleaseContract(contractPath);
const BASE_S = '11'.repeat(32);
const BASE_H = '22'.repeat(32);
const CAND_S = '33'.repeat(32);
const CAND_H = '44'.repeat(32);
const PROFILE = 'vendor/hosted-wallet-market/src/profile.mjs';
const CREATED = 'vendor/hosted-wallet-market/schema/011_capability_composition.sql';

test('preserved client comparison reports Vite only from the script result', () => {
  const quiet = {body: {viteInvoked: false}};
  assert.equal(preservedViteInvoked(quiet, quiet), false);
  assert.equal(preservedViteInvoked({body: {viteInvoked: true}}, quiet), true);
  assert.equal(preservedViteInvoked({body: null}, quiet), true);
  assert.equal(preservedViteInvoked(undefined, quiet), true);
});

test('path and closure classification stays off human and frozen surfaces', () => {
  assert.equal(safeRelative('server/lib/hosted-wallet-market-mount.js'), true);
  assert.equal(safeRelative('../secret'), false);
  assert.equal(safeRelative('/etc/passwd'), false);
  assert.equal(humanSurface('client/dist/index.html'), true);
  assert.equal(humanSurface('public/favicon.ico'), true);
  assert.equal(humanSurface('vendor/hosted-wallet-market/client/app.js'), false);
  assert.equal(humanSurface('vendor/hosted-wallet-market/src/profile.mjs'), false);
  const pinKeys = new Set([PIN, PROFILE, 'client/dist/index.html']);
  assert.equal(closureMember(PROFILE, pinKeys), true);
  assert.equal(closureMember('server/scripts/h120010-promote.mjs', pinKeys), false);
  assert.throws(() => selectMembers(['vendor/neomorphic-contributor-journey/SOURCE.json'], pinKeys), error => error.codeName === 'frozen_runtime_refused');
  const selected = selectMembers([
    'client/dist/index.html', PROFILE, 'AE25-EXPORT.md', 'vendor/hosted-wallet-market/test/example.test.mjs',
  ], pinKeys);
  assert.deepEqual(selected.coupled, ['client/dist/index.html']);
  assert.deepEqual(selected.payload, [PROFILE]);
  assert.equal(selected.excluded.some(row => row.path === 'AE25-EXPORT.md' && row.reason === 'outside_machine_closure'), true);
});

test('recorded source constant is not the measured candidate identity', async () => {
  const measured = await measureProduct(repo);
  assert.equal(measured.sourceSha256, contract.source.measuredCandidateSourceSha256);
  assert.equal(measured.hostSha256, contract.source.measuredCandidateHostSha256);
  assert.equal(contract.source.recordedSourceConstantAgrees, false);
  assert.equal(contract.releaseOrder.pinLastAloneAtomic, false);
  assert.deepEqual(contract.releaseOrder.artifacts, ['code-bundle', 'acquisition-descriptor']);
  const out = mkdtempSync(join(tmpdir(), 'h120010-bundle-'));
  try {
    const built = await buildBundle({repo, out, contract});
    assert.equal(built.recordedCandidateSourceSha256, contract.source.recordedCandidateSourceSha256);
    assert.equal(built.recordedSourceConstantAuthority, false);
    assert.equal(built.sha256, manifestDigest(built));
    assert.equal(built.members.some(member => humanSurface(member.path)), false);
    assert.equal(built.members.some(member => member.path === PIN), true);
    assert.equal(built.members.some(member => member.path === CREATED && member.baselineSha256 === null && member.baselineBytes === 0), true);
    assert.equal(built.excluded.some(row => row.path === 'AE25-EXPORT.md'), true);
    assert.equal(built.excluded.some(row => row.path === 'vendor/hosted-wallet-market/H115010-RESULT.md'), true);
    assert.equal(built.excluded.some(row => row.path.startsWith('client/')), false);
    assert.equal(built.members.length, 19);
    const sealed = sealMeasuredIdentity(out, measured, contract);
    assert.equal(sealed.recordedSourceConstantAgrees, false);
    assert.equal(sealed.measuredCandidateSourceSha256, measured.sourceSha256);
    assert.equal(loadManifest(out, contract).sha256, manifestDigest(sealed));
    assert.equal(sealed.sha256, 'a59b8fe3f9c9a5140d600e88cbeeca517d4fcd6d313d7124a6e761f1aaa5d2d9');
  } finally {
    rmSync(out, {recursive: true, force: true});
  }
});

function syntheticContract() {
  const next = structuredClone(contract);
  next.source.baselineSourceSha256 = BASE_S;
  next.source.baselineHostSha256 = BASE_H;
  next.source.measuredCandidateSourceSha256 = CAND_S;
  next.source.measuredCandidateHostSha256 = CAND_H;
  next.source.recordedSourceConstantAgrees = false;
  next.descriptor.requiredProfile.sourceSha256 = BASE_S;
  next.descriptor.requiredProfile.hostSha256 = BASE_H;
  next.descriptor.sha256 = '55'.repeat(32);
  next.descriptor.bytes = 32;
  next.client.sha256 = '66'.repeat(32);
  next.client.bytes = 32;
  next.human.inventorySha256 = '77'.repeat(32);
  next.human.files = 1;
  next.human.bytes = 1;
  return validateReleaseContract(next);
}

function publishedFor(release) {
  return {
    schema: release.descriptor.schema,
    version: release.client.version,
    sha256: release.client.sha256,
    bytes: release.client.bytes,
    source: {repository: release.client.repository, commit: release.client.commit, path: release.client.path},
    profile: release.endpoints.profile,
    contract: release.endpoints.participationContract,
    requiredProfile: {
      money: 'unfunded', participation: 'voluntary-artifact-v1',
      sourceSha256: release.source.baselineSourceSha256, hostSha256: release.source.baselineHostSha256,
    },
    publicationStatus: 'source_qualified_diagnostics',
  };
}

function writeBundle(dir, members, release) {
  const manifest = {
    schema: 'sds.h120010.machine-bundle.v1',
    baselineCommit: release.source.baselineCommit,
    candidateCommit: release.source.candidateCommit,
    baselineSourceSha256: release.source.baselineSourceSha256,
    baselineHostSha256: release.source.baselineHostSha256,
    recordedCandidateSourceSha256: release.source.recordedCandidateSourceSha256,
    recordedSourceConstantAuthority: false,
    runtimeCommit: release.runtime.journeyCommit,
    deskCommit: release.runtime.deskCommit,
    flags: release.flags,
    members,
    excluded: [],
  };
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  for (const member of members) {
    if (member.baselineBytes) {
      mkdirSync(join(dir, 'baseline', member.path, '..'), {recursive: true});
      writeFileSync(join(dir, 'baseline', member.path), member.baselineText);
    }
    if (member.candidateBytes) {
      mkdirSync(join(dir, 'candidate', member.path, '..'), {recursive: true});
      writeFileSync(join(dir, 'candidate', member.path), member.candidateText);
    }
  }
  return sealMeasuredIdentity(dir, {
    sourceSha256: release.source.measuredCandidateSourceSha256,
    hostSha256: release.source.measuredCandidateHostSha256,
  }, release);
}

function member(path, baselineText, candidateText) {
  const baseline = baselineText == null ? null : Buffer.from(baselineText);
  const candidate = candidateText == null ? null : Buffer.from(candidateText);
  return {
    path,
    baselineBytes: baseline ? baseline.length : 0,
    candidateBytes: candidate ? candidate.length : 0,
    baselineSha256: baseline ? sha256(baseline) : null,
    candidateSha256: candidate ? sha256(candidate) : null,
    baselineText, candidateText,
  };
}

function measureFromPin(root) {
  const pin = readFileSync(join(root, PIN), 'utf8');
  if (pin === 'pin-base\n') return {sourceSha256: BASE_S, hostSha256: BASE_H};
  if (pin === 'pin-cand\n') return {sourceSha256: CAND_S, hostSha256: CAND_H};
  throw new Error('pin');
}

function seedDestination(root) {
  mkdirSync(join(root, 'vendor/hosted-wallet-market/src'), {recursive: true});
  mkdirSync(join(root, 'server/foundry/activation'), {recursive: true});
  writeFileSync(join(root, PIN), 'pin-base\n');
  writeFileSync(join(root, PROFILE), 'profile-base\n');
}

function applyArgs(root, release, extra = {}) {
  return {
    bundleDir: join(root, 'bundle'),
    destination: join(root, 'dest'),
    role: 'candidate',
    contract: release,
    progressFile: join(root, 'progress.json'),
    measure: measureFromPin,
    ...extra,
  };
}

test('release contract rejects missing and contradictory input before a destination write', async () => {
  assert.throws(() => validateReleaseContract(null), error => error.codeName === 'contract_refused');
  assert.throws(() => loadReleaseContract(join(tmpdir(), 'h120010-missing-contract.json')), error => error.codeName === 'contract_required');
  const contradictory = structuredClone(contract);
  contradictory.source.recordedSourceConstantAuthority = true;
  assert.throws(() => validateReleaseContract(contradictory), error => error.codeName === 'contract_contradiction');
  const swapped = structuredClone(contract);
  swapped.releaseOrder.artifacts = ['acquisition-descriptor', 'code-bundle'];
  assert.throws(() => validateReleaseContract(swapped), error => error.codeName === 'contract_contradiction');
  const agreed = structuredClone(contract);
  agreed.source.recordedSourceConstantAgrees = true;
  assert.throws(() => validateReleaseContract(agreed), error => error.codeName === 'contract_contradiction');
  const root = mkdtempSync(join(tmpdir(), 'h120010-contract-'));
  try {
    const release = syntheticContract();
    const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
    const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
    writeBundle(join(root, 'bundle'), [profile, pin], release);
    seedDestination(join(root, 'dest'));
    writeFileSync(join(root, 'bundle-marker'), 'keep');
    const drifted = structuredClone(release);
    drifted.source.recordedCandidateSourceSha256 = 'ab'.repeat(32);
    const marked = mkdtempSync(join(tmpdir(), 'h120010-marked-'));
    writeFileSync(join(marked, 'keep.txt'), 'keep');
    await assert.rejects(() => buildBundle({repo, out: marked, contract: drifted}), error => error.codeName === 'contract_contradiction');
    assert.equal(readFileSync(join(marked, 'keep.txt'), 'utf8'), 'keep');
    rmSync(marked, {recursive: true, force: true});
    await assert.rejects(() => applyBundle(applyArgs(root, contradictory)), error => error.codeName === 'contract_contradiction');
    assert.equal(readFileSync(join(root, 'dest', PIN), 'utf8'), 'pin-base\n');
    assert.equal(existsSync(join(root, 'progress.json')), false);
    const other = structuredClone(release);
    other.source.measuredCandidateSourceSha256 = '99'.repeat(32);
    await assert.rejects(() => applyBundle(applyArgs(root, other)), error => error.codeName === 'bundle_contract_refused');
    assert.equal(readFileSync(join(root, 'dest', PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(existsSync(join(root, 'progress.json')), false);
    const successor = successorDescriptor(publishedFor(release), release);
    assert.equal(successor.published, false);
    assert.equal(successor.descriptor.source.repository, release.client.repository);
    assert.equal(successor.descriptor.source.commit, release.client.commit);
    assert.equal(successor.descriptor.source.path, release.client.path);
    assert.equal(successor.descriptor.sha256, release.client.sha256);
    assert.equal(successor.descriptor.bytes, release.client.bytes);
    assert.equal(successor.descriptor.profile, release.endpoints.profile);
    assert.equal(successor.descriptor.contract, release.endpoints.participationContract);
    assert.equal(successor.descriptor.requiredProfile.sourceSha256, CAND_S);
    assert.equal(successor.descriptor.requiredProfile.hostSha256, CAND_H);
    assert.equal(successor.descriptor.publicationStatus, 'private_unreleased');
    assert.notEqual(successor.sha256, release.descriptor.sha256);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('apply refuses the wrong predecessor, a bad digest, a human path, and an unmeasured bundle', async () => {
  const root = mkdtempSync(join(tmpdir(), 'h120010-apply-'));
  const release = syntheticContract();
  const bundle = join(root, 'bundle');
  const dest = join(root, 'dest');
  try {
    const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
    const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
    const created = member(CREATED, null, 'schema-011\n');
    writeBundle(bundle, [profile, created, pin], release);
    seedDestination(dest);
    const unmeasured = {...loadManifest(bundle, release)};
    delete unmeasured.measuredCandidateSourceSha256;
    writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(unmeasured));
    await assert.rejects(() => applyBundle(applyArgs(root, release)), error => error.codeName === 'bundle_identity_unmeasured' || error.codeName === 'bundle_digest_refused');
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-base\n');
    assert.equal(existsSync(join(root, 'progress.json')), false);
    writeBundle(bundle, [profile, created, pin], release);
    await assert.rejects(() => applyBundle({...applyArgs(root, release), measure: async () => ({sourceSha256: 'ab'.repeat(32), hostSha256: 'cd'.repeat(32)})}),
      error => error.codeName === 'predecessor_refused');
    assert.equal(existsSync(join(dest, CREATED)), false);
    assert.equal(existsSync(join(root, 'progress.json')), false);
    writeFileSync(join(bundle, 'candidate', CREATED), 'schema-tampered\n');
    await assert.rejects(() => applyBundle(applyArgs(root, release)), error => error.codeName === 'member_digest_refused');
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-base\n');
    assert.equal(existsSync(join(dest, CREATED)), false);
    const humanBundle = join(root, 'human');
    writeBundle(humanBundle, [member('client/app.html', null, '<p>no</p>\n'), pin], release);
    await assert.rejects(() => applyBundle({...applyArgs(root, release), bundleDir: humanBundle}), error => error.codeName === 'human_surface_refused');
    assert.equal(existsSync(join(dest, 'client/app.html')), false);
    const wrong = join(root, 'wrong');
    mkdirSync(wrong, {recursive: true});
    const bad = {...loadManifest(bundle, release), candidateCommit: 'f'.repeat(40)};
    writeFileSync(join(wrong, 'manifest.json'), JSON.stringify(bad));
    assert.throws(() => loadManifest(wrong, release), error => error.codeName === 'wrong_source');
    await assert.rejects(() => applyBundle({...applyArgs(root, release), progressFile: undefined}), error => error.codeName === 'progress_required');
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-base\n');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('a corrupt late member and a preexisting path do not write earlier payload', async () => {
  const root = mkdtempSync(join(tmpdir(), 'h120010-preflight-'));
  const release = syntheticContract();
  const dest = join(root, 'dest');
  try {
    const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
    const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
    const created = member(CREATED, null, 'schema-011\n');
    writeBundle(join(root, 'bundle'), [created, profile, pin], release);
    seedDestination(dest);
    writeFileSync(join(root, 'bundle', 'candidate', PIN), 'pin-tampered\n');
    await assert.rejects(() => applyBundle(applyArgs(root, release)), error => error.codeName === 'member_digest_refused');
    assert.equal(existsSync(join(dest, CREATED)), false);
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-base\n');
    assert.equal(existsSync(join(root, 'progress.json')), false);
    writeBundle(join(root, 'bundle'), [created, profile, pin], release);
    mkdirSync(join(dest, 'vendor/hosted-wallet-market/schema'), {recursive: true});
    writeFileSync(join(dest, CREATED), 'already-there\n');
    await assert.rejects(() => applyBundle(applyArgs(root, release)), error => error.codeName === 'destination_member_refused');
    assert.equal(readFileSync(join(dest, CREATED), 'utf8'), 'already-there\n');
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-base\n');
    assert.equal(existsSync(join(root, 'progress.json')), false);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('interrupted apply finishes the candidate or returns to the predecessor', async () => {
  const release = syntheticContract();
  const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
  const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
  const created = member(CREATED, null, 'schema-011\n');
  const finish = mkdtempSync(join(tmpdir(), 'h120010-finish-'));
  const revert = mkdtempSync(join(tmpdir(), 'h120010-revert-'));
  const unrelated = mkdtempSync(join(tmpdir(), 'h120010-unrelated-'));
  try {
    for (const root of [finish, revert, unrelated]) {
      writeBundle(join(root, 'bundle'), [created, profile, pin], release);
      seedDestination(join(root, 'dest'));
    }
    await assert.rejects(() => applyBundle({...applyArgs(finish, release), interruptAfterWrites: 1}), error => error.codeName === 'apply_interrupted');
    assert.equal(readFileSync(join(finish, 'dest', CREATED), 'utf8'), 'schema-011\n');
    assert.equal(readFileSync(join(finish, 'dest', PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(readFileSync(join(finish, 'dest', PIN), 'utf8'), 'pin-base\n');
    const partial = JSON.parse(readFileSync(join(finish, 'progress.json'), 'utf8'));
    assert.equal(partial.schema, PROGRESS_SCHEMA);
    assert.equal(partial.phase, 'writing');
    assert.equal(partial.pinLastAloneAtomic, false);
    assert.equal(partial.owner, 'h120010-apply');
    const installed = await applyBundle(applyArgs(finish, release));
    assert.equal(installed.ok, true);
    assert.equal(installed.resumed, true);
    assert.equal(installed.pinLastAloneAtomic, false);
    assert.equal(readFileSync(join(finish, 'dest', PROFILE), 'utf8'), 'profile-cand\n');
    assert.equal(readFileSync(join(finish, 'dest', PIN), 'utf8'), 'pin-cand\n');
    assert.equal(JSON.parse(readFileSync(join(finish, 'progress.json'), 'utf8')).phase, 'complete');

    await assert.rejects(() => applyBundle({...applyArgs(revert, release), interruptAfterWrites: 1}), error => error.codeName === 'apply_interrupted');
    const restored = await applyBundle({...applyArgs(revert, release), role: 'baseline'});
    assert.equal(restored.after.sourceSha256, BASE_S);
    assert.equal(existsSync(join(revert, 'dest', CREATED)), false);
    assert.equal(readFileSync(join(revert, 'dest', PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(readFileSync(join(revert, 'dest', PIN), 'utf8'), 'pin-base\n');

    await assert.rejects(() => applyBundle({...applyArgs(unrelated, release), interruptAfterWrites: 1}), error => error.codeName === 'apply_interrupted');
    writeFileSync(join(unrelated, 'dest', PROFILE), 'unrelated\n');
    await assert.rejects(() => applyBundle(applyArgs(unrelated, release)), error => error.codeName === 'destination_unrelated_refused');
    assert.equal(readFileSync(join(unrelated, 'dest', PROFILE), 'utf8'), 'unrelated\n');
    assert.equal(readFileSync(join(unrelated, 'dest', CREATED), 'utf8'), 'schema-011\n');
    assert.equal(readFileSync(join(unrelated, 'dest', PIN), 'utf8'), 'pin-base\n');
    const banned = JSON.parse(readFileSync(join(unrelated, 'progress.json'), 'utf8'));
    banned.password = 'no';
    writeFileSync(join(unrelated, 'progress.json'), JSON.stringify(banned));
    await assert.rejects(() => applyBundle({...applyArgs(unrelated, release), role: 'baseline'}), error => error.codeName === 'progress_refused');
    assert.equal(readFileSync(join(unrelated, 'dest', PROFILE), 'utf8'), 'unrelated\n');
  } finally {
    for (const root of [finish, revert, unrelated]) rmSync(root, {recursive: true, force: true});
  }
});

test('candidate install creates a new closure file and baseline rollback removes only that file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'h120010-roundtrip-'));
  const release = syntheticContract();
  const dest = join(root, 'dest');
  try {
    const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
    const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
    const created = member(CREATED, null, 'schema-011\n');
    writeBundle(join(root, 'bundle'), [created, profile, pin], release);
    seedDestination(dest);
    const installed = await applyBundle(applyArgs(root, release));
    assert.equal(installed.ok, true);
    assert.equal(installed.pinLastAloneAtomic, false);
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-cand\n');
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-cand\n');
    assert.equal(readFileSync(join(dest, CREATED), 'utf8'), 'schema-011\n');
    const restored = await applyBundle({...applyArgs(root, release), role: 'baseline'});
    assert.equal(restored.after.sourceSha256, BASE_S);
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(existsSync(join(dest, CREATED)), false);
    const again = await applyBundle({...applyArgs(root, release), role: 'baseline'});
    assert.equal(again.resumed, true);
    assert.equal(existsSync(join(dest, CREATED)), false);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
