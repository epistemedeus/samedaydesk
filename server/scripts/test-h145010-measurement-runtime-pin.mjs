import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {hostSourceSha256, installedSourceSha256} from '../../vendor/hosted-wallet-market/src/native-debt.mjs';
import {
  buildUnreceivedPair,
  catalogFileName,
  measureCandidate,
  packetFromFiles,
  parsePacket,
  readIndex,
  sha256,
  verifyPacket,
} from './root10940-ci-packet.mjs';

const root = resolve(import.meta.dirname, '../..');
const measured = await measureCandidate(root);
const H142_SOURCE = '2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82';
const H142_HOST = 'b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255';
const HISTORICAL_SOURCE = '5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2';
const HISTORICAL_HOST = '1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c';
const HISTORICAL_PACKET_SHA = 'a3fc0037802ad15c17507eda04da42490d4e1ac8470c5305aac0ad3267d28296';
const H142_RECEIVED_ANCHOR = 'b4a08b92f214e277550495a44a5e1e599d537922751d666f994d6aed1b92a557';
const H142_PROPOSAL_ANCHOR = 'e01d2a0216540ff8a7dde315b39435b6bf31516758a5ead8cbd1bc1b1d676cc8';
const CLIENT = 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs';
const SOURCE_COMMIT = 'e54f91e9d93f02cde6d2b281f0cc9b29ea87dfd9';
const PIN = 'server/foundry/activation/private-control-pin.json';
const PIN_BASE = '4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134';
const proposal = 'docs/receiving/h145010-useful-tool-measurement-20261104';
const h142Proposal = 'docs/receiving/h147010-source-bound-ci-input-20261104';
const producer = 'server/scripts/produce-root10940-ci-packet.mjs';
const selector = 'server/scripts/select-root10940-ci-packet.mjs';
const decoder = 'server/scripts/decode-root10940-ci-packet.mjs';
const catalogDir = join(root, 'server/scripts/fixtures/root10940-approved-ci-packets');
const historicalName = catalogFileName(HISTORICAL_SOURCE, HISTORICAL_HOST);
const h142Name = catalogFileName(H142_SOURCE, H142_HOST);
const MEASUREMENT = [
  'package.json',
  'server/lib/pulse.js',
  'server/lib/pulse-store/free-tool-outcomes.js',
  'server/lib/pulse-store/schema.js',
  'server/lib/pulse-store/supabase-adapter.js',
  'server/lib/pulse-store/wal-schema.js',
  'server/routes/tools.js',
  'supabase/migrations/0010_pulse_free_tool_outcomes.sql',
];
const FIXTURE_REPLAY = 'h145010-measurement-runtime-fixture-not-a-receipt';
const FIXTURE_OBSERVED_AT = '2026-11-04T00:00:00.000Z';
const FIXTURE_COMMIT = 'f145010000000000000000000000000000000001';
const FIXTURE_COMMIT_OTHER = 'f145010000000000000000000000000000000002';

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.startsWith('/')) throw new Error(`${name} must be an absolute directory`);
  return value;
}

requireEnv('AE14_PG_BIN');

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'h145010-pin-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function envClean(extra = {}) {
  const env = {...process.env, ...extra, AE14_PG_BIN: requireEnv('AE14_PG_BIN')};
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_CHANNEL_FD;
  delete env.ROOT10940_CI_PACKET;
  return env;
}

function run(args, {timeout = 30000} = {}) {
  return new Promise(done => {
    execFile(process.execPath, args, {
      cwd: root,
      env: envClean(),
      encoding: 'utf8',
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const code = !error ? 0
        : typeof error.status === 'number' ? error.status
        : typeof error.code === 'number' ? error.code
        : 1;
      done({code, signal: error?.signal ?? null, stdout: stdout ?? '', stderr: stderr ?? ''});
    });
  });
}

function assertExit(result, code) {
  const detail = `${result.stderr}\n${result.stdout}`.slice(-2500);
  assert.equal(result.signal, null, detail);
  assert.equal(result.code, code, detail);
}

function committedBytes() {
  return {
    historical: readFileSync(join(catalogDir, historicalName)),
    h142: readFileSync(join(catalogDir, h142Name)),
    index: readFileSync(join(catalogDir, 'index.json')),
    anchor: readFileSync(join(root, proposal, 'proposed-anchor.json')),
    descriptor: readFileSync(join(root, proposal, 'proposed-descriptor.json')),
    enrollment: readFileSync(join(root, proposal, 'ENROLLMENT.json')),
    h142Anchor: readFileSync(join(root, h142Proposal, 'proposed-anchor.json')),
  };
}

function clientBytes() {
  return readFileSync(join(root, CLIENT));
}

function fixtureReceiving(candidateCommit) {
  return {
    owner: 'Root',
    candidateRepository: 'epistemedeus/samedaydesk',
    candidateCommit,
    independentReplay: FIXTURE_REPLAY,
    observedAt: FIXTURE_OBSERVED_AT,
    passed: 1,
    failed: 0,
    originalWriterUnchanged: true,
    predecessor: 'not-a-root-receipt',
    scope: 'Fixture test double. Not a Root receipt and not authority to modify the committed approved index.',
    qualified: false,
    installed: false,
  };
}

function historicalOnly(dir) {
  mkdirSync(dir, {recursive: true});
  copyFileSync(join(catalogDir, historicalName), join(dir, historicalName));
  const index = readIndex(readFileSync(join(catalogDir, 'index.json'), 'utf8'));
  const row = index.packets.find(item => item.sourceSha256 === HISTORICAL_SOURCE && item.hostSha256 === HISTORICAL_HOST);
  assert.ok(row);
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify({schema: index.schema, packets: [row]}, null, 2)}\n`);
  return dir;
}

test('measurement pin matches the bytes the host closure reads', () => {
  const pin = JSON.parse(readFileSync(join(root, PIN), 'utf8'));
  assert.equal(pin.schema, 'sds.foundry.private-control-source.v1');
  assert.equal(pin.base, PIN_BASE);
  const names = Object.keys(pin.files);
  assert.ok(names.length > 0);
  for (const name of names) {
    assert.equal(pin.files[name], createHash('sha256').update(readFileSync(join(root, name))).digest('hex'), name);
  }
  for (const name of MEASUREMENT) assert.equal(typeof pin.files[name], 'string', name);
  assert.equal(installedSourceSha256(), measured.sourceSha256);
  assert.equal(hostSourceSha256(root), measured.hostSha256);
  assert.equal(measured.repository, 'epistemedeus/samedaydesk');
  assert.equal(measured.sourceSha256, H142_SOURCE);
  assert.notEqual(measured.hostSha256, H142_HOST);
});

test('a changed measurement file is binding_stale and the original bytes recover', () => {
  const target = join(root, 'server/routes/tools.js');
  const original = readFileSync(target);
  const host = hostSourceSha256(root);
  try {
    writeFileSync(target, Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(() => hostSourceSha256(root), error => error?.codeName === 'binding_stale');
  } finally {
    writeFileSync(target, original);
  }
  assert.equal(hostSourceSha256(root), host);
  assert.equal(readFileSync(target).equals(original), true);
});

test('historical-only, received H142, and the pending measurement candidate stay distinct', async t => {
  const before = committedBytes();
  const dir = scratch(t);
  const isolated = historicalOnly(join(dir, 'historical-only'));
  const isolatedBefore = readFileSync(join(isolated, historicalName));
  const stale = await run([
    selector, '--catalog', isolated, '--index', join(isolated, 'index.json'),
    '--out', join(dir, 'historical-live.json'),
  ]);
  assertExit(stale, 3);
  assert.match(stale.stderr, new RegExp(`^stale actual ${measured.sourceSha256} expected ${HISTORICAL_SOURCE}$`, 'm'));
  assert.equal(existsSync(join(dir, 'historical-live.json')), false);
  assert.deepEqual(readFileSync(join(isolated, historicalName)), isolatedBefore);
  assert.equal(sha256(isolatedBefore), HISTORICAL_PACKET_SHA);

  const h142Out = join(dir, 'h142-received.json');
  const h142Selected = await run([
    selector, '--catalog', catalogDir, '--index', join(catalogDir, 'index.json'),
    '--source-sha256', H142_SOURCE, '--host-sha256', H142_HOST,
    '--out', h142Out,
  ]);
  assertExit(h142Selected, 0);
  const h142Packet = verifyPacket(parsePacket(readFileSync(h142Out, 'utf8')));
  assert.equal(h142Packet.profile.sourceSha256, H142_SOURCE);
  assert.equal(h142Packet.profile.hostSha256, H142_HOST);
  assert.equal(sha256(h142Packet.anchorBytes), H142_RECEIVED_ANCHOR);
  assert.equal(h142Packet.anchor.receiving.installed, false);
  assert.notEqual(h142Packet.profile.hostSha256, measured.hostSha256);

  const pendingOut = join(dir, 'pending.json');
  const pending = await run([
    selector, '--catalog', catalogDir, '--index', join(catalogDir, 'index.json'),
    '--out', pendingOut,
  ]);
  assertExit(pending, 3);
  assert.equal(existsSync(pendingOut), false);
  assert.match(pending.stderr, /^stale /m);

  const anchor = JSON.parse(before.anchor.toString('utf8'));
  assert.equal(Object.hasOwn(anchor, 'receiving'), false);
  assert.equal(anchor.requiredProfile.sourceSha256, measured.sourceSha256);
  assert.equal(anchor.requiredProfile.hostSha256, measured.hostSha256);
  assert.equal(sha256(before.h142Anchor), H142_PROPOSAL_ANCHOR);
  const refused = await run([
    producer,
    '--anchor', `${proposal}/proposed-anchor.json`,
    '--client', CLIENT,
    '--descriptor', `${proposal}/proposed-descriptor.json`,
    '--catalog', catalogDir,
    '--index', join(catalogDir, 'index.json'),
  ]);
  assertExit(refused, 1);
  assert.match(refused.stderr, /index_receiving_required/);
  assert.deepEqual(committedBytes(), before);
});

test('missing, tampered, unreceived, wrong-source and conflicting-index controls stay closed', async t => {
  const before = committedBytes();
  const dir = scratch(t);
  const empty = join(dir, 'empty');
  mkdirSync(empty);
  const missing = await run([selector, '--catalog', empty]);
  assertExit(missing, 2);
  assert.match(missing.stderr, /missing ROOT10940_CI_PACKET/);

  const raw = before.historical.toString('utf8');
  const marker = '"body":"';
  const at = raw.indexOf(marker);
  assert.ok(at > 0);
  const pos = at + marker.length;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const flipped = `${raw.slice(0, pos)}${alphabet[(alphabet.indexOf(raw[pos]) + 1) % alphabet.length]}${raw.slice(pos + 1)}`;
  const tampered = join(dir, 'tampered.json');
  writeFileSync(tampered, flipped);
  const tamperedResult = await run([
    selector, '--packet', tampered,
    '--source-sha256', HISTORICAL_SOURCE, '--host-sha256', HISTORICAL_HOST,
  ]);
  assertExit(tamperedResult, 1);
  assert.match(tamperedResult.stderr, /^tampered/m);

  const catalog = historicalOnly(join(dir, 'unreceived'));
  const built = buildUnreceivedPair({
    clientBytes: clientBytes(),
    source: {repository: 'epistemedeus/samedaydesk', commit: SOURCE_COMMIT, path: CLIENT},
    requiredProfile: {
      money: 'unfunded',
      participation: 'voluntary-artifact-v1',
      sourceSha256: measured.sourceSha256,
      hostSha256: measured.hostSha256,
    },
    descriptorRepository: 'epistemedeus/samedaydesk',
    descriptorCommit: 'unreceived',
    descriptorPath: `${proposal}/control-descriptor.json`,
  });
  const anchorPath = join(dir, 'unreceived-anchor.json');
  const descriptorPath = join(dir, 'unreceived-descriptor.json');
  writeFileSync(anchorPath, built.anchorBytes);
  writeFileSync(descriptorPath, built.descriptorBytes);
  const stored = await run([
    producer, '--anchor', anchorPath, '--client', CLIENT, '--descriptor', descriptorPath,
    '--catalog', catalog, '--allow-unreceived',
  ]);
  assertExit(stored, 0);
  const unreceived = await run([
    selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
    '--out', join(dir, 'unreceived-out.json'),
  ]);
  assertExit(unreceived, 6);
  assert.match(unreceived.stderr, /^unreceived/m);
  assert.equal(existsSync(join(dir, 'unreceived-out.json')), false);

  const changed = await run([
    selector, '--bound', join(catalogDir, historicalName),
    '--out', join(dir, 'changed.json'),
  ]);
  assertExit(changed, 5);
  assert.match(changed.stderr, new RegExp(`changed-source actual ${measured.sourceSha256} expected ${HISTORICAL_SOURCE}`));
  assert.equal(existsSync(join(dir, 'changed.json')), false);

  const conflictCatalog = join(dir, 'conflict');
  mkdirSync(conflictCatalog);
  const firstAnchor = JSON.parse(built.anchorBytes.toString('utf8'));
  firstAnchor.receiving = fixtureReceiving(FIXTURE_COMMIT);
  const secondAnchor = structuredClone(firstAnchor);
  secondAnchor.receiving = fixtureReceiving(FIXTURE_COMMIT_OTHER);
  const firstAnchorBytes = Buffer.from(`${JSON.stringify(firstAnchor, null, 2)}\n`);
  const secondAnchorBytes = Buffer.from(`${JSON.stringify(secondAnchor, null, 2)}\n`);
  const firstPacket = packetFromFiles(firstAnchorBytes, clientBytes(), built.descriptorBytes);
  const secondPacket = packetFromFiles(secondAnchorBytes, clientBytes(), built.descriptorBytes);
  const firstVerified = verifyPacket(firstPacket);
  const secondVerified = verifyPacket(secondPacket);
  assert.notEqual(sha256(firstVerified.anchorBytes), sha256(secondVerified.anchorBytes));
  writeFileSync(join(conflictCatalog, catalogFileName(measured.sourceSha256, measured.hostSha256)), `${JSON.stringify(firstPacket)}\n`);
  const secondPath = join(dir, 'second.json');
  writeFileSync(secondPath, `${JSON.stringify(secondPacket)}\n`);
  function row(verified) {
    return {
      trustAnchorSha256: sha256(verified.anchorBytes),
      sourceSha256: verified.profile.sourceSha256,
      hostSha256: verified.profile.hostSha256,
      clientSha256: verified.anchor.clientSha256,
      clientBytes: verified.anchor.clientBytes,
      descriptorSha256: verified.anchor.descriptorSha256,
      repository: verified.source.repository,
      version: '0.3.0',
      receiving: verified.anchor.receiving,
    };
  }
  const indexFile = join(dir, 'conflict-index.json');
  writeFileSync(indexFile, `${JSON.stringify({schema: 'pilot.root10940.approved-ci-packet-index.v1', packets: [row(firstVerified), row(secondVerified)]}, null, 2)}\n`);
  const conflict = await run([
    selector, '--catalog', conflictCatalog, '--index', indexFile, '--packet', secondPath,
    '--out', join(dir, 'conflict-out.json'),
  ]);
  assertExit(conflict, 1);
  assert.match(conflict.stderr, /approved_packet_disagreement/);
  assert.equal(existsSync(join(dir, 'conflict-out.json')), false);
  assert.deepEqual(committedBytes(), before);
  assert.equal(before.index.toString('utf8').includes(FIXTURE_REPLAY), false);
});

test('a disposable fixture receipt enrolls only the measured candidate', {timeout: 360000}, async t => {
  const before = committedBytes();
  const dir = scratch(t);
  const catalog = historicalOnly(join(dir, 'catalog'));
  const historicalBefore = readFileSync(join(catalog, historicalName));
  const proposed = JSON.parse(before.anchor.toString('utf8'));
  assert.equal(Object.hasOwn(proposed, 'receiving'), false);
  proposed.receiving = fixtureReceiving(FIXTURE_COMMIT);
  const anchorPath = join(dir, 'fixture-anchor.json');
  writeFileSync(anchorPath, `${JSON.stringify(proposed, null, 2)}\n`);
  const enrolled = await run([
    producer,
    '--anchor', anchorPath,
    '--client', CLIENT,
    '--descriptor', `${proposal}/proposed-descriptor.json`,
    '--catalog', catalog,
    '--index', join(catalog, 'index.json'),
  ]);
  assertExit(enrolled, 0);
  const summary = JSON.parse(enrolled.stdout);
  assert.equal(summary.received, true);
  assert.equal(summary.slot, catalogFileName(measured.sourceSha256, measured.hostSha256));
  assert.notEqual(summary.trustAnchorSha256, H142_RECEIVED_ANCHOR);
  assert.notEqual(summary.trustAnchorSha256, H142_PROPOSAL_ANCHOR);
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);
  assert.equal(sha256(historicalBefore), HISTORICAL_PACKET_SHA);

  const selectedPath = join(dir, 'selected.json');
  const selected = await run([
    selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
    '--out', selectedPath,
  ]);
  assertExit(selected, 0);
  const chosen = verifyPacket(parsePacket(readFileSync(selectedPath, 'utf8')));
  assert.equal(chosen.profile.sourceSha256, measured.sourceSha256);
  assert.equal(chosen.profile.hostSha256, measured.hostSha256);
  assert.equal(chosen.anchor.receiving.independentReplay, FIXTURE_REPLAY);
  assert.equal(chosen.anchor.receiving.qualified, false);
  assert.equal(chosen.anchor.receiving.installed, false);
  assert.equal(sha256(chosen.anchorBytes), summary.trustAnchorSha256);

  const decoded = await run([decoder, '--packet', selectedPath], {timeout: 340000});
  assertExit(decoded, 0);
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);
  assert.deepEqual(committedBytes(), before);
  assert.equal(readFileSync(join(catalogDir, 'index.json'), 'utf8').includes(FIXTURE_REPLAY), false);
});

test('the received H142 proposal does not decode as this measurement runtime', {timeout: 240000}, async t => {
  const before = committedBytes();
  const packet = join(scratch(t), 'h142-proposal.json');
  const packed = await run([
    producer,
    '--anchor', `${h142Proposal}/proposed-anchor.json`,
    '--client', CLIENT,
    '--descriptor', `${h142Proposal}/proposed-descriptor.json`,
    '--out', packet,
  ]);
  assertExit(packed, 0);
  const verified = verifyPacket(parsePacket(readFileSync(packet, 'utf8')));
  assert.equal(verified.profile.hostSha256, H142_HOST);
  assert.notEqual(verified.profile.hostSha256, measured.hostSha256);
  assert.equal(Object.hasOwn(verified.anchor, 'receiving'), false);
  const decoded = await run([decoder, '--packet', packet], {timeout: 220000});
  assertExit(decoded, 1);
  const output = `${decoded.stderr}\n${decoded.stdout}`;
  assert.match(output, new RegExp(H142_HOST));
  assert.match(output, new RegExp(measured.hostSha256));
  assert.deepEqual(committedBytes(), before);
});
