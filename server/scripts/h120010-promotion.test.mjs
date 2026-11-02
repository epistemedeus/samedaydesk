import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  ADMISSION, PIN, applyBundle, buildBundle, closureMember, humanSurface, loadManifest, manifestDigest,
  measureProduct, safeRelative, sealMeasuredIdentity, selectMembers, sha256,
} from './h120010-promote.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const BASE_S = '11'.repeat(32);
const BASE_H = '22'.repeat(32);
const CAND_S = '33'.repeat(32);
const CAND_H = '44'.repeat(32);
const PROFILE = 'vendor/hosted-wallet-market/src/profile.mjs';
const CREATED = 'vendor/hosted-wallet-market/schema/011_capability_composition.sql';

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
  assert.equal(measured.sourceSha256, '8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6');
  assert.equal(measured.hostSha256, 'a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3');
  assert.notEqual(measured.sourceSha256, ADMISSION.recordedCandidateSourceSha256);
  const out = mkdtempSync(join(tmpdir(), 'h120010-bundle-'));
  try {
    const built = await buildBundle({repo, out});
    assert.equal(built.recordedCandidateSourceSha256, ADMISSION.recordedCandidateSourceSha256);
    assert.equal(built.recordedSourceConstantAuthority, false);
    assert.equal(built.sha256, manifestDigest(built));
    assert.equal(built.members.some(member => humanSurface(member.path)), false);
    assert.equal(built.members.some(member => member.path === PIN), true);
    assert.equal(built.members.some(member => member.path === CREATED && member.baselineSha256 === null && member.baselineBytes === 0), true);
    assert.equal(built.excluded.some(row => row.path === 'AE25-EXPORT.md'), true);
    assert.equal(built.excluded.some(row => row.path === 'vendor/hosted-wallet-market/H115010-RESULT.md'), true);
    assert.equal(built.excluded.some(row => row.path.startsWith('client/')), false);
    const sealed = sealMeasuredIdentity(out, measured);
    assert.equal(sealed.recordedSourceConstantAgrees, false);
    assert.equal(sealed.measuredCandidateSourceSha256, measured.sourceSha256);
    assert.equal(loadManifest(out).sha256, manifestDigest(sealed));
  } finally {
    rmSync(out, {recursive: true, force: true});
  }
});

function writeBundle(dir, members) {
  const manifest = {
    schema: 'sds.h120010.machine-bundle.v1',
    baselineCommit: ADMISSION.baselineCommit,
    candidateCommit: ADMISSION.candidateCommit,
    baselineSourceSha256: BASE_S,
    baselineHostSha256: BASE_H,
    recordedCandidateSourceSha256: ADMISSION.recordedCandidateSourceSha256,
    recordedSourceConstantAuthority: false,
    runtimeCommit: ADMISSION.runtimeCommit,
    deskCommit: ADMISSION.deskCommit,
    flags: ADMISSION.flags,
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
  return sealMeasuredIdentity(dir, {sourceSha256: CAND_S, hostSha256: CAND_H});
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

test('apply refuses the wrong predecessor, a bad digest, a human path, and an unmeasured bundle', async () => {
  const root = mkdtempSync(join(tmpdir(), 'h120010-apply-'));
  const bundle = join(root, 'bundle');
  const dest = join(root, 'dest');
  try {
    const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
    const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
    const created = member(CREATED, null, 'schema-011\n');
    writeBundle(bundle, [profile, created, pin]);
    seedDestination(dest);
    const unmeasured = join(root, 'open');
    writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({...loadManifest(bundle), measuredCandidateSourceSha256: undefined}));
    await assert.rejects(() => applyBundle({bundleDir: bundle, destination: dest, role: 'candidate', measure: async () => measureFromPin(dest)}),
      error => error.codeName === 'bundle_identity_unmeasured' || error.codeName === 'bundle_digest_refused');
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-base\n');
    writeBundle(bundle, [profile, created, pin]);
    await assert.rejects(() => applyBundle({bundleDir: bundle, destination: dest, role: 'candidate', measure: async () => ({sourceSha256: 'ab'.repeat(32), hostSha256: 'cd'.repeat(32)})}),
      error => error.codeName === 'predecessor_refused');
    assert.equal(existsSync(join(dest, CREATED)), false);
    const tampered = join(bundle, 'candidate', CREATED);
    writeFileSync(tampered, 'schema-tampered\n');
    await assert.rejects(() => applyBundle({bundleDir: bundle, destination: dest, role: 'candidate', measure: measureFromPin}),
      error => error.codeName === 'member_digest_refused');
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-base\n');
    assert.equal(existsSync(join(dest, CREATED)), false);
    const humanBundle = join(root, 'human');
    writeBundle(humanBundle, [member('client/app.html', null, '<p>no</p>\n'), pin]);
    await assert.rejects(() => applyBundle({bundleDir: humanBundle, destination: dest, role: 'candidate', measure: measureFromPin}),
      error => error.codeName === 'human_surface_refused');
    assert.equal(existsSync(join(dest, 'client/app.html')), false);
    const wrong = join(root, 'wrong');
    mkdirSync(wrong, {recursive: true});
    const bad = {...loadManifest(bundle), candidateCommit: 'f'.repeat(40)};
    writeFileSync(join(wrong, 'manifest.json'), JSON.stringify(bad));
    assert.throws(() => loadManifest(wrong), error => error.codeName === 'wrong_source');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('candidate install creates a new closure file and baseline rollback removes only that file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'h120010-roundtrip-'));
  const bundle = join(root, 'bundle');
  const dest = join(root, 'dest');
  try {
    const pin = member(PIN, 'pin-base\n', 'pin-cand\n');
    const profile = member(PROFILE, 'profile-base\n', 'profile-cand\n');
    const created = member(CREATED, null, 'schema-011\n');
    writeBundle(bundle, [created, profile, pin]);
    seedDestination(dest);
    const installed = await applyBundle({bundleDir: bundle, destination: dest, role: 'candidate', measure: measureFromPin});
    assert.equal(installed.ok, true);
    assert.equal(readFileSync(join(dest, PIN), 'utf8'), 'pin-cand\n');
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-cand\n');
    assert.equal(readFileSync(join(dest, CREATED), 'utf8'), 'schema-011\n');
    const restored = await applyBundle({bundleDir: bundle, destination: dest, role: 'baseline', measure: measureFromPin});
    assert.equal(restored.after.sourceSha256, BASE_S);
    assert.equal(readFileSync(join(dest, PROFILE), 'utf8'), 'profile-base\n');
    assert.equal(existsSync(join(dest, CREATED)), false);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
