import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {
  buildUnreceivedPair,
  catalogFileName,
  measureCandidate,
  packetFromFiles,
  parsePacket,
  readIndex,
  rootReceivingAccepted,
  rowAgrees,
  sha256,
  verifyPacket,
} from './root10940-ci-packet.mjs';

const root = resolve(import.meta.dirname, '../..');
const CURRENT_SOURCE = '2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82';
const CURRENT_HOST = 'b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255';
const HISTORICAL_SOURCE = '5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2';
const HISTORICAL_HOST = '1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c';
const CLIENT_SHA = '38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4';
const ANCHOR_SHA = '71e880413d2fa6711494886b7023064dea55814bd89ae0010d19b8597c5dd923';
const HISTORICAL_PACKET_SHA = 'a3fc0037802ad15c17507eda04da42490d4e1ac8470c5305aac0ad3267d28296';
const PROPOSAL_ANCHOR_SHA = 'e01d2a0216540ff8a7dde315b39435b6bf31516758a5ead8cbd1bc1b1d676cc8';
const PROPOSAL_DESCRIPTOR_SHA = '946fceedf7af5827b49e9e9bf434fefb0186b62d3498f84b48bcc84e1adcca1a';
const ENROLLMENT_SHA = 'dcdf009200a6204ef1fb4799d579b95df88f17bc174a55c351ac359d38dd9221';
const CLIENT = 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs';
const SOURCE_COMMIT = 'e54f91e9d93f02cde6d2b281f0cc9b29ea87dfd9';
const BASE_COMMIT = '3445fa1624e8d2a2cc06556cea45730687aa79d1';
const proposal = 'docs/receiving/h147010-source-bound-ci-input-20261104';
const producer = 'server/scripts/produce-root10940-ci-packet.mjs';
const selector = 'server/scripts/select-root10940-ci-packet.mjs';
const decoder = 'server/scripts/decode-root10940-ci-packet.mjs';
const OTHER_HOST = 'ab'.repeat(32);
const FIXTURE_REPLAY = 'h147010-fixture-not-a-receipt';
const FIXTURE_OBSERVED_AT = '2026-11-04T00:00:00.000Z';
const FIXTURE_COMMIT_CURRENT = 'f17a010000000000000000000000000000000001';
const FIXTURE_COMMIT_OTHER = 'f17a010000000000000000000000000000000002';
const HISTORICAL_CANDIDATE_COMMIT = 'cafd88c9026688359773d9c027944bff959d7777';

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value;
}

const historicalName = catalogFileName(HISTORICAL_SOURCE, HISTORICAL_HOST);
const committedCatalog = join(root, 'server/scripts/fixtures/root10940-approved-ci-packets');
const configuredCatalog = resolve(root, requireEnv('ROOT10940_CI_CATALOG'));
const committedHistoricalPath = join(committedCatalog, historicalName);
const committedIndexPath = join(committedCatalog, 'index.json');
const historicalPath = join(configuredCatalog, historicalName);
const indexPath = join(configuredCatalog, 'index.json');

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'h147010-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function envClean(extra = {}) {
  const pgBin = extra.AE14_PG_BIN || process.env.AE14_PG_BIN;
  if (typeof pgBin !== 'string' || !pgBin.startsWith('/')) {
    throw new Error('AE14_PG_BIN must be an absolute directory from the caller');
  }
  const env = {...process.env, ...extra, AE14_PG_BIN: pgBin};
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_CHANNEL_FD;
  return env;
}

function run(args, {timeout = 30000, env, drop = []} = {}) {
  const childEnv = envClean(env);
  for (const key of drop) delete childEnv[key];
  return new Promise(done => {
    execFile(process.execPath, args, {
      cwd: root,
      env: childEnv,
      encoding: 'utf8',
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const code = !error ? 0
        : typeof error.status === 'number' ? error.status
        : typeof error.code === 'number' ? error.code
        : 1;
      done({
        code,
        signal: error?.signal ?? null,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
      });
    });
  });
}

function assertExit(result, code) {
  const detail = `${result.stderr}\n${result.stdout}`.slice(-2500);
  assert.equal(result.signal, null, detail);
  assert.equal(result.code, code, detail);
}

function clientBytes() {
  return readFileSync(join(root, CLIENT));
}

function unreceivedPair({
  sourceSha256,
  hostSha256,
  repository = 'epistemedeus/samedaydesk',
  descriptorPath = `${proposal}/proposed-descriptor.json`,
}) {
  return buildUnreceivedPair({
    clientBytes: clientBytes(),
    source: {repository, commit: SOURCE_COMMIT, path: CLIENT},
    requiredProfile: {
      money: 'unfunded',
      participation: 'voluntary-artifact-v1',
      sourceSha256,
      hostSha256,
    },
    descriptorRepository: repository,
    descriptorCommit: 'unreceived',
    descriptorPath,
  });
}

function writePair(dir, options) {
  const built = unreceivedPair(options);
  const tag = options.descriptorPath.split('/').pop().replace(/\.json$/, '');
  const anchorPath = join(dir, `anchor-${tag}.json`);
  const descriptorPath = join(dir, `descriptor-${tag}.json`);
  writeFileSync(anchorPath, built.anchorBytes);
  writeFileSync(descriptorPath, built.descriptorBytes);
  return {built, anchorPath, descriptorPath};
}

function proposeArgs(outDir) {
  return [
    producer, '--propose', '--measure', '--out-dir', outDir,
    '--client', CLIENT,
    '--source-repository', 'epistemedeus/samedaydesk',
    '--source-commit', SOURCE_COMMIT,
    '--source-path', CLIENT,
    '--source-sha256', CURRENT_SOURCE,
    '--host-sha256', CURRENT_HOST,
    '--descriptor-repository', 'epistemedeus/samedaydesk',
    '--descriptor-commit', 'unreceived',
    '--descriptor-path', `${proposal}/proposed-descriptor.json`,
    '--measured-commit', BASE_COMMIT,
  ];
}

function committedSnapshot() {
  return {
    historical: readFileSync(committedHistoricalPath),
    index: readFileSync(committedIndexPath),
    anchor: readFileSync(join(root, proposal, 'proposed-anchor.json')),
    descriptor: readFileSync(join(root, proposal, 'proposed-descriptor.json')),
    enrollment: readFileSync(join(root, proposal, 'ENROLLMENT.json')),
  };
}

function assertCommittedUnchanged(before) {
  const after = committedSnapshot();
  assert.deepEqual(after.historical, before.historical);
  assert.deepEqual(after.index, before.index);
  assert.deepEqual(after.anchor, before.anchor);
  assert.deepEqual(after.descriptor, before.descriptor);
  assert.deepEqual(after.enrollment, before.enrollment);
}

function historicalIndex() {
  const index = readIndex(readFileSync(committedIndexPath, 'utf8'));
  const row = index.packets.find(item => item.trustAnchorSha256 === ANCHOR_SHA
    && item.sourceSha256 === HISTORICAL_SOURCE
    && item.hostSha256 === HISTORICAL_HOST);
  assert.ok(row, 'committed index is missing the historical cafd row');
  return {schema: index.schema, packets: [row]};
}

function writeHistoricalOnlyCatalog(dir) {
  mkdirSync(dir, {recursive: true});
  copyFileSync(committedHistoricalPath, join(dir, historicalName));
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(historicalIndex(), null, 2)}\n`);
  return dir;
}

function copyCatalog(t) {
  return writeHistoricalOnlyCatalog(join(scratch(t), 'catalog'));
}

function assertHistoricalSlot(catalog) {
  const packetPath = join(catalog, historicalName);
  const bytes = readFileSync(packetPath);
  assert.equal(bytes.length, 43432);
  assert.equal(sha256(bytes), HISTORICAL_PACKET_SHA);
  assert.deepEqual(bytes, readFileSync(committedHistoricalPath));
  const verified = verifyPacket(parsePacket(bytes.toString('utf8')));
  assert.equal(sha256(verified.anchorBytes), ANCHOR_SHA);
  assert.equal(verified.profile.sourceSha256, HISTORICAL_SOURCE);
  assert.equal(verified.profile.hostSha256, HISTORICAL_HOST);
  assert.equal(verified.anchor.clientSha256, CLIENT_SHA);
  assert.equal(verified.anchor.clientBytes, 28081);
  assert.equal(verified.descriptor.version, '0.3.0');
  assert.equal(verified.anchor.receiving.owner, 'Root');
  assert.equal(verified.anchor.receiving.installed, false);
  assert.equal(verified.anchor.receiving.candidateCommit, HISTORICAL_CANDIDATE_COMMIT);
  const index = readIndex(readFileSync(join(catalog, 'index.json'), 'utf8'));
  const rows = index.packets.filter(row => row.trustAnchorSha256 === ANCHOR_SHA
    || (row.sourceSha256 === HISTORICAL_SOURCE && row.hostSha256 === HISTORICAL_HOST));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].trustAnchorSha256, ANCHOR_SHA);
  assert.equal(JSON.stringify(rows[0].receiving), JSON.stringify(verified.anchor.receiving));
  for (const row of index.packets) {
    if (row === rows[0]) continue;
    assert.notEqual(`${row.sourceSha256}-${row.hostSha256}`, `${HISTORICAL_SOURCE}-${HISTORICAL_HOST}`);
    assert.notEqual(row.trustAnchorSha256, ANCHOR_SHA);
  }
  return verified;
}

function approvedCurrentSelection() {
  const slot = join(configuredCatalog, catalogFileName(CURRENT_SOURCE, CURRENT_HOST));
  if (!existsSync(slot)) return null;
  let verified;
  try {
    verified = verifyPacket(parsePacket(readFileSync(slot, 'utf8')));
  } catch {
    return null;
  }
  if (verified.profile.sourceSha256 !== CURRENT_SOURCE || verified.profile.hostSha256 !== CURRENT_HOST) return null;
  const index = readIndex(readFileSync(indexPath, 'utf8'));
  const row = index.packets.find(item => item.trustAnchorSha256 === sha256(verified.anchorBytes));
  if (!row || !rowAgrees(row, verified) || !rootReceivingAccepted(verified.anchor.receiving, verified.source.repository)) {
    return null;
  }
  return verified;
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

function writeReceivedPair(dir, {sourceSha256, hostSha256, descriptorPath, candidateCommit}) {
  const built = unreceivedPair({sourceSha256, hostSha256, descriptorPath});
  const anchor = JSON.parse(built.anchorBytes.toString('utf8'));
  anchor.receiving = fixtureReceiving(candidateCommit);
  const anchorBytes = Buffer.from(`${JSON.stringify(anchor, null, 2)}\n`);
  const tag = descriptorPath.split('/').pop().replace(/\.json$/, '');
  const anchorPath = join(dir, `anchor-${tag}.json`);
  const descriptorFile = join(dir, `descriptor-${tag}.json`);
  writeFileSync(anchorPath, anchorBytes);
  writeFileSync(descriptorFile, built.descriptorBytes);
  return {anchorPath, descriptorFile, anchorBytes};
}

test('candidate measurement is the admitted source and host', async () => {
  const measured = await measureCandidate(root);
  assert.equal(measured.repository, 'epistemedeus/samedaydesk');
  assert.equal(measured.sourceSha256, CURRENT_SOURCE);
  assert.equal(measured.hostSha256, CURRENT_HOST);
});

test('historical cafd packet remains identifiable beside later approved rows', () => {
  assertHistoricalSlot(configuredCatalog);
  assert.equal(sha256(readFileSync(committedHistoricalPath)), HISTORICAL_PACKET_SHA);
  assertHistoricalSlot(committedCatalog);
});

test('missing packet is refused', async t => {
  const result = await run([
    selector, '--catalog', scratch(t),
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
  ]);
  assertExit(result, 2);
  assert.match(result.stderr, /missing ROOT10940_CI_PACKET/);
  const absent = await run([decoder], {drop: ['ROOT10940_CI_PACKET']});
  assertExit(absent, 2);
  assert.match(absent.stderr, /ROOT10940_CI_PACKET is required/);
});

test('tampered packet is refused before the participation journey', async t => {
  const dir = scratch(t);
  const raw = readFileSync(committedHistoricalPath, 'utf8');
  const marker = '"body":"';
  const at = raw.indexOf(marker);
  assert.ok(at > 0);
  const pos = at + marker.length;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const flipped = `${raw.slice(0, pos)}${alphabet[(alphabet.indexOf(raw[pos]) + 1) % alphabet.length]}${raw.slice(pos + 1)}`;
  const packet = join(dir, 'tampered.json');
  writeFileSync(packet, flipped);
  const selected = await run([
    selector, '--packet', packet,
    '--source-sha256', HISTORICAL_SOURCE, '--host-sha256', HISTORICAL_HOST,
  ]);
  assertExit(selected, 1);
  assert.match(selected.stderr, /^tampered/m);
  const decoded = await run([decoder, '--packet', packet], {timeout: 20000});
  assertExit(decoded, 1);
  assert.doesNotMatch(`${decoded.stderr}\n${decoded.stdout}`, /cold independent account roles/);
  const misnamed = join(scratch(t), 'catalog');
  mkdirSync(misnamed);
  writeFileSync(join(misnamed, `${'a'.repeat(64)}-${'b'.repeat(64)}.json`), raw);
  const named = await run([
    selector, '--catalog', misnamed,
    '--source-sha256', HISTORICAL_SOURCE, '--host-sha256', HISTORICAL_HOST,
  ]);
  assertExit(named, 1);
  assert.match(named.stderr, /^tampered/m);
});

test('wrong repository is refused for this fingerprint', async t => {
  const dir = scratch(t);
  const {built} = writePair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: CURRENT_HOST,
    repository: 'example/other',
    descriptorPath: `${proposal}/other-descriptor.json`,
  });
  const packet = join(dir, 'wrong-repo.json');
  writeFileSync(packet, `${JSON.stringify(built.packet)}\n`);
  const result = await run([
    selector, '--packet', packet,
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
  ]);
  assertExit(result, 4);
  assert.match(result.stderr, /wrong-repository/);
});

test('current tree treats the cafd packet as stale and does not rewrite it', async t => {
  const committedBefore = committedSnapshot();
  const configuredHistoricalBefore = readFileSync(historicalPath);
  const configuredIndexBefore = readFileSync(indexPath);
  const dir = scratch(t);
  const isolated = writeHistoricalOnlyCatalog(join(dir, 'isolated'));
  const isolatedHistoricalBefore = readFileSync(join(isolated, historicalName));
  const isolatedIndexBefore = readFileSync(join(isolated, 'index.json'));
  const enrollment = join(dir, 'enrollment.json');
  const out = join(dir, 'out.json');
  const result = await run([
    selector, '--catalog', isolated, '--index', join(isolated, 'index.json'),
    '--enrollment-out', enrollment, '--out', out,
  ]);
  assertExit(result, 3);
  assert.match(result.stderr, new RegExp(`stale actual ${CURRENT_SOURCE} expected ${HISTORICAL_SOURCE}`));
  assert.equal(existsSync(out), false);
  assert.deepEqual(readFileSync(join(isolated, historicalName)), isolatedHistoricalBefore);
  assert.deepEqual(readFileSync(join(isolated, 'index.json')), isolatedIndexBefore);
  const body = JSON.parse(readFileSync(enrollment, 'utf8'));
  assert.equal(body.received, false);
  assert.equal(body.class, 'stale');
  assert.equal(body.measured.sourceSha256, CURRENT_SOURCE);
  assert.equal(body.measured.hostSha256, CURRENT_HOST);

  const configuredOut = join(dir, 'configured-out.json');
  const configured = await run([
    selector, '--catalog', configuredCatalog, '--index', indexPath,
    '--out', configuredOut,
  ]);
  const approved = approvedCurrentSelection();
  if (approved) {
    assertExit(configured, 0);
    const selected = verifyPacket(parsePacket(readFileSync(configuredOut, 'utf8')));
    assert.equal(selected.profile.sourceSha256, CURRENT_SOURCE);
    assert.equal(selected.profile.hostSha256, CURRENT_HOST);
    assert.equal(selected.profile.money, 'unfunded');
    assert.equal(selected.profile.participation, 'voluntary-artifact-v1');
    assert.notEqual(sha256(selected.anchorBytes), ANCHOR_SHA);
  } else {
    assertExit(configured, 3);
    assert.match(configured.stderr, new RegExp(`stale actual ${CURRENT_SOURCE} expected ${HISTORICAL_SOURCE}`));
    assert.equal(existsSync(configuredOut), false);
  }
  assert.deepEqual(readFileSync(historicalPath), configuredHistoricalBefore);
  assert.deepEqual(readFileSync(indexPath), configuredIndexBefore);
  assertCommittedUnchanged(committedBefore);
});

test('a bound historical packet reports changed-source and keeps its expected hash', async () => {
  const before = readFileSync(committedHistoricalPath);
  const result = await run([
    selector, '--bound', committedHistoricalPath,
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
  ]);
  assertExit(result, 5);
  assert.match(result.stderr, new RegExp(`changed-source actual ${CURRENT_SOURCE} expected ${HISTORICAL_SOURCE}`));
  assert.deepEqual(readFileSync(committedHistoricalPath), before);
  const profile = verifyPacket(parsePacket(before.toString('utf8'))).profile;
  assert.equal(profile.sourceSha256, HISTORICAL_SOURCE);
  assert.equal(profile.hostSha256, HISTORICAL_HOST);
});

test('an unreceived or self-stamped packet cannot select over the historical row', async t => {
  const catalog = copyCatalog(t);
  const dir = scratch(t);
  const {anchorPath, descriptorPath, built} = writePair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: CURRENT_HOST,
    descriptorPath: `${proposal}/self-bless.json`,
  });
  const indexBefore = readFileSync(join(catalog, 'index.json'));
  const historicalBefore = readFileSync(join(catalog, historicalName));
  const refused = await run([
    producer, '--anchor', anchorPath, '--client', CLIENT, '--descriptor', descriptorPath,
    '--catalog', catalog, '--index', join(catalog, 'index.json'),
  ]);
  assertExit(refused, 1);
  assert.match(refused.stderr, /index_receiving_required/);
  assert.equal(existsSync(join(catalog, catalogFileName(CURRENT_SOURCE, CURRENT_HOST))), false);
  const allowed = await run([
    producer, '--anchor', anchorPath, '--client', CLIENT, '--descriptor', descriptorPath,
    '--catalog', catalog, '--index', join(catalog, 'index.json'), '--allow-unreceived',
  ]);
  assertExit(allowed, 1);
  assert.match(allowed.stderr, /index_receiving_required/);
  assert.equal(existsSync(join(catalog, catalogFileName(CURRENT_SOURCE, CURRENT_HOST))), false);
  const stored = await run([
    producer, '--anchor', anchorPath, '--client', CLIENT, '--descriptor', descriptorPath,
    '--catalog', catalog, '--allow-unreceived',
  ]);
  assertExit(stored, 0);
  const out = join(dir, 'out.json');
  const selected = await run([
    selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST, '--out', out,
  ]);
  assertExit(selected, 6);
  assert.match(selected.stderr, /^unreceived/m);
  assert.equal(existsSync(out), false);
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);
  assert.deepEqual(readFileSync(join(catalog, 'index.json')), indexBefore);

  const historical = verifyPacket(parsePacket(historicalBefore.toString('utf8')));
  const anchor = JSON.parse(built.anchorBytes.toString('utf8'));
  anchor.receiving = historical.anchor.receiving;
  const anchorBytes = Buffer.from(`${JSON.stringify(anchor, null, 2)}\n`);
  const forged = packetFromFiles(anchorBytes, clientBytes(), built.descriptorBytes);
  const forgedName = catalogFileName(CURRENT_SOURCE, CURRENT_HOST);
  writeFileSync(join(catalog, forgedName), `${JSON.stringify(forged)}\n`);
  const forgedOut = join(dir, 'forged-out.json');
  const forgedResult = await run([
    selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST, '--out', forgedOut,
  ]);
  assertExit(forgedResult, 6);
  assert.equal(existsSync(forgedOut), false);
  assert.deepEqual(readFileSync(join(catalog, 'index.json')), indexBefore);
});

test('producer refuses a different packet in an occupied slot', async t => {
  const dir = scratch(t);
  const catalog = join(dir, 'catalog');
  mkdirSync(catalog);
  const first = writePair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: CURRENT_HOST,
    descriptorPath: `${proposal}/slot-a.json`,
  });
  const created = await run([
    producer, '--anchor', first.anchorPath, '--client', CLIENT, '--descriptor', first.descriptorPath,
    '--catalog', catalog, '--allow-unreceived',
  ]);
  assertExit(created, 0);
  const slot = join(catalog, catalogFileName(CURRENT_SOURCE, CURRENT_HOST));
  const original = readFileSync(slot);
  const same = await run([
    producer, '--anchor', first.anchorPath, '--client', CLIENT, '--descriptor', first.descriptorPath,
    '--catalog', catalog, '--allow-unreceived',
  ]);
  assertExit(same, 0);
  assert.deepEqual(readFileSync(slot), original);
  const second = writePair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: CURRENT_HOST,
    descriptorPath: `${proposal}/slot-b.json`,
  });
  const occupied = await run([
    producer, '--anchor', second.anchorPath, '--client', CLIENT, '--descriptor', second.descriptorPath,
    '--catalog', catalog, '--allow-unreceived',
  ]);
  assertExit(occupied, 1);
  assert.match(occupied.stderr, /catalog_slot_occupied/);
  assert.deepEqual(readFileSync(slot), original);
});

test('two candidate slots are written and selected without a shared overwrite', async t => {
  const dir = scratch(t);
  const catalog = join(dir, 'catalog');
  writeHistoricalOnlyCatalog(catalog);
  const current = writePair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: CURRENT_HOST,
    descriptorPath: `${proposal}/simultaneous-current.json`,
  });
  const other = writePair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: OTHER_HOST,
    descriptorPath: `${proposal}/simultaneous-other.json`,
  });
  const wrote = await Promise.all([
    run([
      producer, '--anchor', current.anchorPath, '--client', CLIENT, '--descriptor', current.descriptorPath,
      '--catalog', catalog, '--allow-unreceived',
    ]),
    run([
      producer, '--anchor', other.anchorPath, '--client', CLIENT, '--descriptor', other.descriptorPath,
      '--catalog', catalog, '--allow-unreceived',
    ]),
  ]);
  assertExit(wrote[0], 0);
  assertExit(wrote[1], 0);
  const currentSlot = join(catalog, catalogFileName(CURRENT_SOURCE, CURRENT_HOST));
  const otherSlot = join(catalog, catalogFileName(CURRENT_SOURCE, OTHER_HOST));
  const historicalSlot = join(catalog, historicalName);
  const currentBytes = readFileSync(currentSlot);
  const otherBytes = readFileSync(otherSlot);
  const historicalBytes = readFileSync(historicalSlot);
  assert.notDeepEqual(currentBytes, otherBytes);
  const outHistorical = join(dir, 'historical.json');
  const outCurrent = join(dir, 'current.json');
  const selected = await Promise.all([
    run([
      selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
      '--source-sha256', HISTORICAL_SOURCE, '--host-sha256', HISTORICAL_HOST,
      '--out', outHistorical,
    ]),
    run([
      selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
      '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
      '--out', outCurrent,
    ]),
  ]);
  assertExit(selected[0], 0);
  assertExit(selected[1], 6);
  assert.equal(existsSync(outCurrent), false);
  const chosen = verifyPacket(parsePacket(readFileSync(outHistorical, 'utf8')));
  assert.equal(sha256(chosen.anchorBytes), ANCHOR_SHA);
  assert.equal(chosen.anchor.clientSha256, CLIENT_SHA);
  assert.deepEqual(readFileSync(currentSlot), currentBytes);
  assert.deepEqual(readFileSync(otherSlot), otherBytes);
  assert.deepEqual(readFileSync(historicalSlot), historicalBytes);
});

test('historical fingerprint still selects the immutable 0.3.0 client', async t => {
  const committedBefore = committedSnapshot();
  const configuredHistoricalBefore = readFileSync(historicalPath);
  const configuredIndexBefore = readFileSync(indexPath);
  const dir = scratch(t);
  const out = join(dir, 'selected.json');
  const selected = await run([
    selector, '--catalog', configuredCatalog, '--index', indexPath,
    '--source-sha256', HISTORICAL_SOURCE, '--host-sha256', HISTORICAL_HOST,
    '--out', out,
  ]);
  assertExit(selected, 0);
  const verified = verifyPacket(parsePacket(readFileSync(out, 'utf8')));
  assert.equal(verified.anchor.clientSha256, CLIENT_SHA);
  assert.equal(verified.anchor.clientBytes, 28081);
  assert.equal(verified.clientBytes.length, 28081);
  assert.equal(sha256(verified.clientBytes), CLIENT_SHA);
  assert.equal(verified.descriptor.version, '0.3.0');
  assert.equal(verified.profile.sourceSha256, HISTORICAL_SOURCE);
  assert.equal(sha256(verified.anchorBytes), ANCHOR_SHA);

  const isolated = writeHistoricalOnlyCatalog(join(dir, 'isolated'));
  const isolatedHistoricalBefore = readFileSync(join(isolated, historicalName));
  const current = await run([
    selector, '--catalog', isolated, '--index', join(isolated, 'index.json'),
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
    '--out', join(dir, 'current.json'),
  ]);
  assertExit(current, 3);
  assert.equal(existsSync(join(dir, 'current.json')), false);
  const legacyOut = join(dir, 'legacy.json');
  const legacy = await run([
    selector, '--catalog', isolated, '--index', join(isolated, 'index.json'), '--legacy-env',
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
    '--out', legacyOut,
  ], {env: {ROOT10940_CI_PACKET: isolatedHistoricalBefore.toString('utf8')}});
  assertExit(legacy, 3);
  assert.equal(existsSync(legacyOut), false);
  assert.doesNotMatch(legacy.stdout, /ROOT10940_CI_PACKET=/);
  assert.deepEqual(readFileSync(join(isolated, historicalName)), isolatedHistoricalBefore);

  const approved = approvedCurrentSelection();
  const configuredCurrentOut = join(dir, 'configured-current.json');
  const configuredCurrent = await run([
    selector, '--catalog', configuredCatalog, '--index', indexPath,
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
    '--out', configuredCurrentOut,
  ]);
  const configuredLegacyOut = join(dir, 'configured-legacy.json');
  const configuredLegacy = await run([
    selector, '--catalog', configuredCatalog, '--index', indexPath, '--legacy-env',
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
    '--out', configuredLegacyOut,
  ], {env: {ROOT10940_CI_PACKET: readFileSync(committedHistoricalPath, 'utf8')}});
  if (approved) {
    assertExit(configuredCurrent, 0);
    assertExit(configuredLegacy, 0);
    for (const file of [configuredCurrentOut, configuredLegacyOut]) {
      const chosen = verifyPacket(parsePacket(readFileSync(file, 'utf8')));
      assert.equal(chosen.profile.sourceSha256, CURRENT_SOURCE);
      assert.equal(chosen.profile.hostSha256, CURRENT_HOST);
      assert.equal(chosen.profile.money, 'unfunded');
      assert.equal(chosen.profile.participation, 'voluntary-artifact-v1');
      assert.notEqual(sha256(chosen.anchorBytes), ANCHOR_SHA);
    }
    assert.doesNotMatch(configuredLegacy.stdout, /ROOT10940_CI_PACKET=/);
  } else {
    assertExit(configuredCurrent, 3);
    assertExit(configuredLegacy, 3);
    assert.equal(existsSync(configuredCurrentOut), false);
    assert.equal(existsSync(configuredLegacyOut), false);
    assert.doesNotMatch(configuredLegacy.stdout, /ROOT10940_CI_PACKET=/);
  }
  assert.deepEqual(readFileSync(historicalPath), configuredHistoricalBefore);
  assert.deepEqual(readFileSync(indexPath), configuredIndexBefore);
  assertCommittedUnchanged(committedBefore);
});

test('approved packets for one fingerprint cannot disagree', async t => {
  const committedBefore = committedSnapshot();
  const configuredIndexBefore = readFileSync(indexPath);
  const dir = scratch(t);
  const catalog = join(dir, 'catalog');
  mkdirSync(catalog);
  copyFileSync(committedHistoricalPath, join(catalog, historicalName));
  const historical = verifyPacket(parsePacket(readFileSync(committedHistoricalPath, 'utf8')));
  const built = unreceivedPair({
    sourceSha256: HISTORICAL_SOURCE,
    hostSha256: HISTORICAL_HOST,
    descriptorPath: `${proposal}/disagreement.json`,
  });
  const anchor = JSON.parse(built.anchorBytes.toString('utf8'));
  anchor.receiving = historical.anchor.receiving;
  const anchorBytes = Buffer.from(`${JSON.stringify(anchor, null, 2)}\n`);
  const packet = packetFromFiles(anchorBytes, clientBytes(), built.descriptorBytes);
  const packetPath = join(dir, 'second.json');
  writeFileSync(packetPath, `${JSON.stringify(packet)}\n`);
  const verified = verifyPacket(packet);
  const index = historicalIndex();
  index.packets.push({
    trustAnchorSha256: sha256(verified.anchorBytes),
    sourceSha256: verified.profile.sourceSha256,
    hostSha256: verified.profile.hostSha256,
    clientSha256: verified.anchor.clientSha256,
    clientBytes: verified.anchor.clientBytes,
    descriptorSha256: verified.anchor.descriptorSha256,
    repository: verified.source.repository,
    version: '0.3.0',
    receiving: verified.anchor.receiving,
  });
  const indexFile = join(dir, 'index.json');
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  const out = join(dir, 'out.json');
  const result = await run([
    selector, '--catalog', catalog, '--index', indexFile, '--packet', packetPath,
    '--source-sha256', HISTORICAL_SOURCE, '--host-sha256', HISTORICAL_HOST,
    '--out', out,
  ]);
  assertExit(result, 1);
  assert.match(result.stderr, /approved_packet_disagreement/);
  assert.equal(existsSync(out), false);
  assert.deepEqual(readFileSync(indexPath), configuredIndexBefore);
  assertCommittedUnchanged(committedBefore);
});

test('proposal matches a fresh measurement and enrollment refuses without Root receiving', async t => {
  const committedBefore = committedSnapshot();
  const configuredIndexBefore = readFileSync(indexPath);
  const configuredHistoricalBefore = readFileSync(historicalPath);
  const dir = scratch(t);
  const proposed = await run(proposeArgs(dir));
  assertExit(proposed, 0);
  const anchor = JSON.parse(readFileSync(join(dir, 'proposed-anchor.json'), 'utf8'));
  const descriptor = JSON.parse(readFileSync(join(dir, 'proposed-descriptor.json'), 'utf8'));
  const enrollment = JSON.parse(readFileSync(join(dir, 'ENROLLMENT.json'), 'utf8'));
  assert.equal(Object.hasOwn(anchor, 'receiving'), false);
  assert.equal(anchor.clientSha256, CLIENT_SHA);
  assert.equal(anchor.clientBytes, 28081);
  assert.equal(anchor.descriptorCommit, 'unreceived');
  assert.equal(anchor.descriptorRepository, 'epistemedeus/samedaydesk');
  assert.deepEqual(anchor.requiredProfile, {
    money: 'unfunded',
    participation: 'voluntary-artifact-v1',
    sourceSha256: CURRENT_SOURCE,
    hostSha256: CURRENT_HOST,
  });
  assert.equal(descriptor.version, '0.3.0');
  assert.equal(descriptor.publicationStatus, 'unreceived');
  assert.equal(descriptor.hostedAcquisitionVerified, false);
  assert.equal(descriptor.fundingOrPaymentActivation, false);
  assert.equal(descriptor.sha256, CLIENT_SHA);
  assert.equal(enrollment.received, false);
  assert.equal(enrollment.independentReleaseAuthority, false);
  assert.equal(enrollment.qualified, false);
  assert.equal(enrollment.installed, false);
  assert.equal(enrollment.packet.acquiredClient.sha256, CLIENT_SHA);
  assert.match(enrollment.command, /proposed-anchor\.json/);
  assert.deepEqual(readFileSync(join(dir, 'proposed-anchor.json')), readFileSync(join(root, proposal, 'proposed-anchor.json')));
  assert.deepEqual(readFileSync(join(dir, 'proposed-descriptor.json')), readFileSync(join(root, proposal, 'proposed-descriptor.json')));
  assert.deepEqual(readFileSync(join(dir, 'ENROLLMENT.json')), readFileSync(join(root, proposal, 'ENROLLMENT.json')));
  const refused = await run([
    producer,
    '--anchor', `${proposal}/proposed-anchor.json`,
    '--client', CLIENT,
    '--descriptor', `${proposal}/proposed-descriptor.json`,
    '--catalog', configuredCatalog,
    '--index', indexPath,
  ]);
  assertExit(refused, 1);
  assert.match(refused.stderr, /index_receiving_required/);
  assert.deepEqual(readFileSync(indexPath), configuredIndexBefore);
  assert.deepEqual(readFileSync(historicalPath), configuredHistoricalBefore);
  assertCommittedUnchanged(committedBefore);
  const mismatch = await run([
    producer, '--propose', '--measure', '--out-dir', join(dir, 'mismatch'),
    '--client', CLIENT,
    '--source-repository', 'epistemedeus/samedaydesk',
    '--source-commit', SOURCE_COMMIT,
    '--source-path', CLIENT,
    '--source-sha256', HISTORICAL_SOURCE,
    '--host-sha256', HISTORICAL_HOST,
    '--descriptor-repository', 'epistemedeus/samedaydesk',
    '--descriptor-commit', 'unreceived',
    '--descriptor-path', `${proposal}/proposed-descriptor.json`,
    '--measured-commit', BASE_COMMIT,
  ]);
  assertExit(mismatch, 1);
  assert.match(mismatch.stderr, /propose_measurement_mismatch/);
  const workflow = readFileSync(join(root, '.github/workflows/runtime-startup.yml'), 'utf8');
  assert.match(workflow, /select-root10940-ci-packet\.mjs/);
  assert.match(workflow, /--legacy-env/);
  assert.match(workflow, /decode-root10940-ci-packet\.mjs --packet/);
  assert.match(workflow, /ROOT10940_CI_CATALOG=/);
  assert.match(workflow, /AE14_PG_BIN=/);
  assert.match(workflow, /vars\.ROOT10940_CI_PACKET/);
  assert.match(workflow, /set -euo pipefail/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test('explicit packet file wins over a stale ROOT10940_CI_PACKET value', async t => {
  const packet = join(scratch(t), 'bad.json');
  writeFileSync(packet, '{');
  const result = await run([decoder, '--packet', packet], {
    timeout: 15000,
    env: {ROOT10940_CI_PACKET: readFileSync(committedHistoricalPath, 'utf8')},
  });
  assertExit(result, 1);
  assert.match(result.stderr, /not a JSON packet/);
  assert.doesNotMatch(`${result.stderr}\n${result.stdout}`, /cold independent account roles/);
});

test('kept historical packet still fails closed on the profile comparison', {timeout: 240000}, async () => {
  const result = await run([decoder, '--packet', committedHistoricalPath], {timeout: 220000});
  assertExit(result, 1);
  const output = `${result.stderr}\n${result.stdout}`;
  assert.match(output, new RegExp(CURRENT_SOURCE));
  assert.match(output, new RegExp(HISTORICAL_SOURCE));
});

test('positive current packet decodes into the configured participation test', {timeout: 360000}, async t => {
  const dir = scratch(t);
  const packet = join(dir, 'packet.json');
  const packed = await run([
    producer,
    '--anchor', `${proposal}/proposed-anchor.json`,
    '--client', CLIENT,
    '--descriptor', `${proposal}/proposed-descriptor.json`,
    '--out', packet,
  ]);
  assertExit(packed, 0);
  const verified = verifyPacket(parsePacket(readFileSync(packet, 'utf8')));
  assert.equal(verified.profile.sourceSha256, CURRENT_SOURCE);
  assert.equal(verified.profile.hostSha256, CURRENT_HOST);
  assert.equal(Object.hasOwn(verified.anchor, 'receiving'), false);
  const index = readIndex(readFileSync(indexPath, 'utf8'));
  assert.equal(index.packets.some(row => row.trustAnchorSha256 === sha256(verified.anchorBytes)), false);
  const unselected = await run([
    selector, '--packet', packet,
    '--source-sha256', CURRENT_SOURCE, '--host-sha256', CURRENT_HOST,
    '--out', join(dir, 'selected.json'),
  ]);
  assertExit(unselected, 6);
  assert.equal(existsSync(join(dir, 'selected.json')), false);
  const decoded = await run([decoder, '--packet', packet], {timeout: 340000});
  assertExit(decoded, 0);
});

test('ordinary producer enrollment selects and decodes the current source beside the historical slot', {timeout: 360000}, async t => {
  const committedBefore = committedSnapshot();
  const dir = scratch(t);
  const catalog = writeHistoricalOnlyCatalog(join(dir, 'catalog'));
  const historicalBefore = readFileSync(join(catalog, historicalName));
  const proposedAnchor = JSON.parse(readFileSync(join(root, proposal, 'proposed-anchor.json'), 'utf8'));
  assert.equal(Object.hasOwn(proposedAnchor, 'receiving'), false);
  proposedAnchor.receiving = fixtureReceiving(FIXTURE_COMMIT_CURRENT);
  assert.equal(proposedAnchor.receiving.independentReplay, FIXTURE_REPLAY);
  assert.equal(proposedAnchor.receiving.qualified, false);
  assert.equal(proposedAnchor.receiving.installed, false);
  assert.notEqual(proposedAnchor.receiving.candidateCommit, HISTORICAL_CANDIDATE_COMMIT);
  const anchorPath = join(dir, 'received-current-anchor.json');
  writeFileSync(anchorPath, `${JSON.stringify(proposedAnchor, null, 2)}\n`);
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
  assert.equal(summary.slot, catalogFileName(CURRENT_SOURCE, CURRENT_HOST));
  assert.notEqual(summary.trustAnchorSha256, ANCHOR_SHA);
  assert.notEqual(summary.trustAnchorSha256, PROPOSAL_ANCHOR_SHA);
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);
  assertHistoricalSlot(catalog);

  const selectedPath = join(dir, 'selected.json');
  const selected = await run([
    selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
    '--out', selectedPath,
  ]);
  assertExit(selected, 0);
  const chosen = verifyPacket(parsePacket(readFileSync(selectedPath, 'utf8')));
  assert.equal(chosen.profile.sourceSha256, CURRENT_SOURCE);
  assert.equal(chosen.profile.hostSha256, CURRENT_HOST);
  assert.equal(chosen.profile.money, 'unfunded');
  assert.equal(chosen.profile.participation, 'voluntary-artifact-v1');
  assert.equal(sha256(chosen.anchorBytes), summary.trustAnchorSha256);
  assert.equal(chosen.anchor.receiving.independentReplay, FIXTURE_REPLAY);
  const decoded = await run([decoder, '--packet', selectedPath], {timeout: 340000});
  assertExit(decoded, 0);
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);

  const other = writeReceivedPair(dir, {
    sourceSha256: CURRENT_SOURCE,
    hostSha256: OTHER_HOST,
    descriptorPath: `${proposal}/fixture-independent-host.json`,
    candidateCommit: FIXTURE_COMMIT_OTHER,
  });
  const otherEnrolled = await run([
    producer,
    '--anchor', other.anchorPath,
    '--client', CLIENT,
    '--descriptor', other.descriptorFile,
    '--catalog', catalog,
    '--index', join(catalog, 'index.json'),
  ]);
  assertExit(otherEnrolled, 0);
  const otherSummary = JSON.parse(otherEnrolled.stdout);
  assert.equal(otherSummary.received, true);
  assert.equal(otherSummary.slot, catalogFileName(CURRENT_SOURCE, OTHER_HOST));
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);
  assertHistoricalSlot(catalog);

  async function selectFingerprint(sourceSha256, hostSha256, file) {
    const result = await run([
      selector, '--catalog', catalog, '--index', join(catalog, 'index.json'),
      '--source-sha256', sourceSha256, '--host-sha256', hostSha256,
      '--out', join(dir, file),
    ]);
    assertExit(result, 0);
    return verifyPacket(parsePacket(readFileSync(join(dir, file), 'utf8')));
  }
  const historicalSelected = await selectFingerprint(HISTORICAL_SOURCE, HISTORICAL_HOST, 'life-historical.json');
  const currentSelected = await selectFingerprint(CURRENT_SOURCE, CURRENT_HOST, 'life-current.json');
  const otherSelected = await selectFingerprint(CURRENT_SOURCE, OTHER_HOST, 'life-other.json');
  assert.equal(sha256(historicalSelected.anchorBytes), ANCHOR_SHA);
  assert.equal(historicalSelected.descriptor.version, '0.3.0');
  assert.equal(sha256(historicalSelected.clientBytes), CLIENT_SHA);
  assert.equal(sha256(currentSelected.anchorBytes), summary.trustAnchorSha256);
  assert.equal(currentSelected.profile.hostSha256, CURRENT_HOST);
  assert.equal(sha256(otherSelected.anchorBytes), otherSummary.trustAnchorSha256);
  assert.equal(otherSelected.profile.hostSha256, OTHER_HOST);
  assert.equal(new Set([
    sha256(historicalSelected.anchorBytes),
    sha256(currentSelected.anchorBytes),
    sha256(otherSelected.anchorBytes),
  ]).size, 3);

  const unrelated = writeHistoricalOnlyCatalog(join(dir, 'unrelated-old-fixture'));
  assertHistoricalSlot(unrelated);
  const unrelatedIndex = readIndex(readFileSync(join(unrelated, 'index.json'), 'utf8'));
  assert.equal(unrelatedIndex.packets.length, 1);
  assert.equal(unrelatedIndex.packets[0].trustAnchorSha256, ANCHOR_SHA);
  const unrelatedOut = join(dir, 'unrelated-out.json');
  const unrelatedSelect = await run([
    selector, '--catalog', unrelated, '--index', join(unrelated, 'index.json'),
    '--out', unrelatedOut,
  ]);
  assertExit(unrelatedSelect, 3);
  assert.equal(existsSync(unrelatedOut), false);
  assert.deepEqual(readFileSync(join(catalog, historicalName)), historicalBefore);
  assert.equal(readFileSync(committedIndexPath, 'utf8').includes(FIXTURE_REPLAY), false);
  assertCommittedUnchanged(committedBefore);
});

test('committed catalog retains history and the separate proposal stays unreceived', () => {
  const historical = readFileSync(committedHistoricalPath);
  const index = readFileSync(committedIndexPath);
  const anchor = readFileSync(join(root, proposal, 'proposed-anchor.json'));
  const descriptor = readFileSync(join(root, proposal, 'proposed-descriptor.json'));
  const enrollment = readFileSync(join(root, proposal, 'ENROLLMENT.json'));
  assert.equal(sha256(historical), HISTORICAL_PACKET_SHA);
  assert.equal(historical.length, 43432);
  assertHistoricalSlot(committedCatalog);
  assert.equal(sha256(anchor), PROPOSAL_ANCHOR_SHA);
  assert.equal(sha256(descriptor), PROPOSAL_DESCRIPTOR_SHA);
  assert.equal(sha256(enrollment), ENROLLMENT_SHA);
  assert.equal(Object.hasOwn(JSON.parse(anchor.toString('utf8')), 'receiving'), false);
  assert.equal(index.toString('utf8').includes(FIXTURE_REPLAY), false);
  readIndex(index.toString('utf8'));
});
