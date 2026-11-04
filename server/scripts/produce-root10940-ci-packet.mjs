#!/usr/bin/env node
/**
 * Pack an existing trust anchor, immutable client and descriptor.
 *
 * Writes one catalog slot named by the packet's own requiredProfile.
 * Refuses to overwrite a different packet, edit requiredProfile, or add a
 * Root receiving block. --propose writes an unreceived enrollment request
 * and does not touch the approved catalog or index.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CLIENT_VERSION,
  ENROLLMENT_SCHEMA,
  catalogFileName,
  enrollmentCommand,
  measureCandidate,
  packetFromFiles,
  readIndex,
  rootReceivingAccepted,
  sha256,
  verifyPacket,
  buildUnreceivedPair,
} from './root10940-ci-packet.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const has = name => args.includes(`--${name}`);

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readBytes(path, label) {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('-')) fail(`${label} requires a file`);
  try {
    return readFileSync(path);
  } catch {
    fail(`${label} is unreadable`);
  }
}

function atomicWrite(path, bytes) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, bytes, {flag: 'wx', mode: 0o644});
}

function sameBytes(path, bytes) {
  try {
    return readFileSync(path).equals(Buffer.from(bytes));
  } catch {
    return false;
  }
}

function writeExclusive(path, bytes) {
  if (sameBytes(path, bytes)) return 'identical';
  try {
    atomicWrite(path, bytes);
    return 'created';
  } catch (error) {
    if (error.code === 'EEXIST') fail(`catalog_slot_occupied ${path}`);
    throw error;
  }
}

const HISTORICAL = {
  trustAnchorSha256: '71e880413d2fa6711494886b7023064dea55814bd89ae0010d19b8597c5dd923',
  sourceSha256: '5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2',
  hostSha256: '1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c',
  clientSha256: '38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4',
  descriptorSha256: '59bfca8be525503917c546f586b7c8724cc5f90fd29052cce8cfce019185148e',
  version: CLIENT_VERSION,
  binding: 'cafd88c9',
};

function indexRow(verified) {
  return {
    trustAnchorSha256: sha256(verified.anchorBytes),
    sourceSha256: verified.profile.sourceSha256,
    hostSha256: verified.profile.hostSha256,
    clientSha256: verified.anchor.clientSha256,
    clientBytes: verified.anchor.clientBytes,
    descriptorSha256: verified.anchor.descriptorSha256,
    repository: verified.source.repository,
    version: CLIENT_VERSION,
    receiving: verified.anchor.receiving,
  };
}

function enrollIndex(indexPath, verified) {
  if (!rootReceivingAccepted(verified.anchor.receiving, verified.source.repository)) {
    fail('index_receiving_required');
  }
  const index = readIndex(readFileSync(indexPath, 'utf8'));
  const fingerprint = `${verified.profile.sourceSha256}-${verified.profile.hostSha256}`;
  const row = indexRow(verified);
  const byFingerprint = index.packets.find(item => `${item.sourceSha256}-${item.hostSha256}` === fingerprint);
  const byAnchor = index.packets.find(item => item.trustAnchorSha256 === row.trustAnchorSha256);
  if (byFingerprint && JSON.stringify(byFingerprint) !== JSON.stringify(row)) fail(`index_slot_occupied ${fingerprint}`);
  if (byAnchor && JSON.stringify(byAnchor) !== JSON.stringify(row)) fail(`index_anchor_occupied ${row.trustAnchorSha256}`);
  if (!byFingerprint) {
    index.packets.push(row);
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }
}

async function propose() {
  if (has('catalog') || has('index') || flag('anchor') || flag('descriptor')) {
    fail('propose does not accept an approved catalog, index, or a pre-stamped anchor');
  }
  const outDir = resolve(root, flag('out-dir') || '');
  if (!flag('out-dir')) fail('--out-dir is required');
  const clientBytes = readBytes(resolve(root, flag('client') || ''), '--client');
  const source = {
    repository: flag('source-repository'),
    commit: flag('source-commit'),
    path: flag('source-path'),
  };
  const requiredProfile = {
    money: 'unfunded',
    participation: 'voluntary-artifact-v1',
    sourceSha256: flag('source-sha256'),
    hostSha256: flag('host-sha256'),
  };
  if (has('measure')) {
    const measured = await measureCandidate(root);
    if (measured.sourceSha256 !== requiredProfile.sourceSha256 || measured.hostSha256 !== requiredProfile.hostSha256) {
      fail(`propose_measurement_mismatch actual ${measured.sourceSha256} ${measured.hostSha256} expected ${requiredProfile.sourceSha256} ${requiredProfile.hostSha256}`);
    }
  }
  let built;
  try {
    built = buildUnreceivedPair({
      clientBytes,
      source,
      requiredProfile,
      descriptorRepository: flag('descriptor-repository'),
      descriptorCommit: flag('descriptor-commit'),
      descriptorPath: flag('descriptor-path'),
    });
  } catch (error) {
    fail(error.message || 'propose_refused');
  }
  if (built.anchor.receiving) fail('propose_refused_receiving');
  const request = {
    schema: ENROLLMENT_SCHEMA,
    received: false,
    independentReleaseAuthority: false,
    qualified: false,
    installed: false,
    measured: {
      repository: source.repository,
      sourceSha256: requiredProfile.sourceSha256,
      hostSha256: requiredProfile.hostSha256,
      baseCommit: flag('measured-commit'),
    },
    keptHistorical: HISTORICAL,
    keptReceived: {
      trustAnchorSha256: 'b4a08b92f214e277550495a44a5e1e599d537922751d666f994d6aed1b92a557',
      sourceSha256: '2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82',
      hostSha256: 'b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255',
      binding: 'h142',
      note: 'Root receiving for this pair stays on its own slot. It is not receiving for a different host fingerprint.',
    },
    packet: built.packet,
    command: enrollmentCommand(),
    note: 'Root adds receiving on a copy of this proposed anchor only after an independent replay. This command refuses until that receipt exists. It must not overwrite the historical cafd slot, the received H142 slot, or set ROOT10940_CI_PACKET.',
  };
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, 'proposed-anchor.json'), built.anchorBytes);
  writeFileSync(join(outDir, 'proposed-descriptor.json'), built.descriptorBytes);
  writeFileSync(join(outDir, 'ENROLLMENT.json'), `${JSON.stringify(request, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    received: false,
    sourceSha256: requiredProfile.sourceSha256,
    hostSha256: requiredProfile.hostSha256,
    trustAnchorSha256: sha256(built.anchorBytes),
    clientSha256: built.anchor.clientSha256,
    descriptorSha256: built.anchor.descriptorSha256,
  })}\n`);
}

function packApproved() {
  const anchorBytes = readBytes(resolve(root, flag('anchor') || ''), '--anchor');
  const clientBytes = readBytes(resolve(root, flag('client') || ''), '--client');
  const descriptorBytes = readBytes(resolve(root, flag('descriptor') || ''), '--descriptor');
  let verified;
  let packet;
  try {
    packet = packetFromFiles(anchorBytes, clientBytes, descriptorBytes);
    verified = verifyPacket(packet);
  } catch (error) {
    fail(error.message || 'packet_refused');
  }
  const slot = catalogFileName(verified.profile.sourceSha256, verified.profile.hostSha256);
  const received = rootReceivingAccepted(verified.anchor.receiving, verified.source.repository);
  if ((flag('catalog') || flag('index')) && !received && !has('allow-unreceived')) fail('index_receiving_required');
  if (flag('index') && !received) fail('index_receiving_required');
  if (flag('out')) writeFileSync(resolve(root, flag('out')), `${JSON.stringify(packet)}\n`);
  if (flag('catalog')) {
    const catalog = resolve(root, flag('catalog'));
    mkdirSync(catalog, {recursive: true});
    writeExclusive(join(catalog, slot), `${JSON.stringify(packet)}\n`);
  }
  if (flag('index')) enrollIndex(resolve(root, flag('index')), verified);
  if (!flag('catalog') && !flag('out') && !flag('index')) fail('catalog, index, or out is required', 2);
  process.stdout.write(`${JSON.stringify({slot, trustAnchorSha256: sha256(verified.anchorBytes), received})}\n`);
}

if (has('propose')) await propose();
else packApproved();
