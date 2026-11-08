/**
 * Shared packet, anchor and catalog contract for source-bound acquisition CI.
 *
 * The packet schema stays pilot.participation.ci-packet.v1. This module does
 * not stamp Root receiving, rewrite requiredProfile, or select a global latest
 * packet for a different source fingerprint.
 */
import {createHash} from 'node:crypto';

export const SCHEMA = 'pilot.participation.ci-packet.v1';
export const ANCHOR_SCHEMA = 'pilot.root10940.acquisition-trust-anchor.v1';
export const DESCRIPTOR_SCHEMA = 'neomorphic.machine-participation.acquisition.v1';
export const INDEX_SCHEMA = 'pilot.root10940.approved-ci-packet-index.v1';
export const ENROLLMENT_SCHEMA = 'pilot.root10940.ci-enrollment-request.v1';
export const CLIENT_VERSION = '0.3.0';
export const CURRENT_PROPOSAL_DIR = 'docs/receiving/sds386-request-parser-20261107';
export function enrollmentCommand() {
  return [
    'node server/scripts/produce-root10940-ci-packet.mjs',
    `--anchor ${CURRENT_PROPOSAL_DIR}/proposed-anchor.json`,
    '--client vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs',
    `--descriptor ${CURRENT_PROPOSAL_DIR}/proposed-descriptor.json`,
    '--catalog server/scripts/fixtures/root10940-approved-ci-packets',
    '--index server/scripts/fixtures/root10940-approved-ci-packets/index.json',
  ].join(' \\\n  ');
}
export const PARTS = [
  ['trustAnchor', 'ROOT10940_TRUST_ANCHOR', 'trust-anchor.json'],
  ['acquiredClient', 'ROOT10940_ACQUIRED_CLIENT', 'cold-requester.mjs'],
  ['acquisitionDescriptor', 'ROOT10940_ACQUISITION_DESCRIPTOR', 'descriptor.json'],
];

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function catalogFileName(sourceSha256, hostSha256) {
  return `${sourceSha256}-${hostSha256}.json`;
}

export class PacketError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function partBytes(packet, key) {
  const item = packet[key];
  if (!item || typeof item.sha256 !== 'string' || !HEX64.test(item.sha256)
    || !Number.isInteger(item.bytes) || item.bytes < 0 || typeof item.body !== 'string') {
    throw new PacketError(`ROOT10940_CI_PACKET ${key} is incomplete`, 1);
  }
  const bytes = Buffer.from(item.body, 'base64');
  const actual = sha256(bytes);
  if (bytes.length !== item.bytes || actual !== item.sha256) {
    throw new PacketError(`${key} sha256 mismatch: expected ${item.sha256} actual ${actual} bytes ${bytes.length} expectedBytes ${item.bytes}`, 1);
  }
  return bytes;
}

export function parsePacket(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw new PacketError('packet is empty', 1);
  let packet;
  try {
    packet = JSON.parse(raw.trim());
  } catch {
    throw new PacketError('ROOT10940_CI_PACKET is not a JSON packet', 1);
  }
  if (!packet || packet.schema !== SCHEMA) {
    throw new PacketError(`ROOT10940_CI_PACKET schema must be ${SCHEMA}`, 1);
  }
  return packet;
}

export function verifyPacket(packet) {
  const clientBytes = partBytes(packet, 'acquiredClient');
  const descriptorBytes = partBytes(packet, 'acquisitionDescriptor');
  const anchorBytes = partBytes(packet, 'trustAnchor');
  let anchor;
  try {
    anchor = JSON.parse(anchorBytes.toString('utf8'));
  } catch {
    throw new PacketError('trust anchor is not JSON', 1);
  }
  if (anchor.schema !== ANCHOR_SCHEMA) throw new PacketError(`trust anchor schema must be ${ANCHOR_SCHEMA}`, 1);
  if (sha256(clientBytes) !== anchor.clientSha256 || clientBytes.length !== anchor.clientBytes) {
    throw new PacketError('decoded client does not match the trust anchor literals', 1);
  }
  if (sha256(descriptorBytes) !== anchor.descriptorSha256) {
    throw new PacketError('decoded descriptor does not match the trust anchor literals', 1);
  }
  let descriptor;
  try {
    descriptor = JSON.parse(descriptorBytes.toString('utf8'));
  } catch {
    throw new PacketError('acquisition descriptor is not JSON', 1);
  }
  if (descriptor.schema !== DESCRIPTOR_SCHEMA || descriptor.version !== CLIENT_VERSION) {
    throw new PacketError('acquisition descriptor is not the immutable 0.3.0 client binding', 1);
  }
  if (descriptor.bytes !== clientBytes.length || descriptor.sha256 !== anchor.clientSha256) {
    throw new PacketError('acquisition descriptor client pin does not match the trust anchor', 1);
  }
  if (!anchor.source || descriptor.source?.repository !== anchor.source.repository
    || descriptor.source?.commit !== anchor.source.commit || descriptor.source?.path !== anchor.source.path) {
    throw new PacketError('acquisition descriptor source does not match the trust anchor', 1);
  }
  const profile = anchor.requiredProfile;
  const descriptorProfile = descriptor.requiredProfile || {};
  if (!profile || profile.money !== 'unfunded' || profile.participation !== 'voluntary-artifact-v1'
    || !HEX64.test(profile.sourceSha256 || '') || !HEX64.test(profile.hostSha256 || '')
    || descriptorProfile.money !== profile.money || descriptorProfile.participation !== profile.participation
    || descriptorProfile.sourceSha256 !== profile.sourceSha256 || descriptorProfile.hostSha256 !== profile.hostSha256) {
    throw new PacketError('acquisition descriptor profile does not match the trust anchor', 1);
  }
  if (typeof anchor.source.repository !== 'string' || anchor.source.repository.length < 3
    || !HEX40.test(anchor.source.commit || '') || typeof anchor.source.path !== 'string') {
    throw new PacketError('trust anchor source is incomplete', 1);
  }
  return {anchor, anchorBytes, clientBytes, descriptorBytes, descriptor, profile, source: anchor.source};
}

export function packetFromFiles(anchorBytes, clientBytes, descriptorBytes) {
  const packet = {
    schema: SCHEMA,
    trustAnchor: {sha256: sha256(anchorBytes), bytes: anchorBytes.length, body: Buffer.from(anchorBytes).toString('base64')},
    acquiredClient: {sha256: sha256(clientBytes), bytes: clientBytes.length, body: Buffer.from(clientBytes).toString('base64')},
    acquisitionDescriptor: {sha256: sha256(descriptorBytes), bytes: descriptorBytes.length, body: Buffer.from(descriptorBytes).toString('base64')},
  };
  verifyPacket(packet);
  return packet;
}

export function rootReceivingAccepted(receiving, repository) {
  if (!receiving || typeof receiving !== 'object') return false;
  return receiving.owner === 'Root'
    && Number.isInteger(receiving.passed) && receiving.passed > 0
    && receiving.failed === 0
    && typeof receiving.qualified === 'boolean'
    && receiving.installed === false
    && receiving.candidateRepository === repository
    && HEX40.test(receiving.candidateCommit || '')
    && receiving.originalWriterUnchanged === true;
}

export function readIndex(raw) {
  const index = JSON.parse(raw);
  if (!index || index.schema !== INDEX_SCHEMA || !Array.isArray(index.packets)) {
    throw new PacketError(`approved index schema must be ${INDEX_SCHEMA}`, 1);
  }
  return index;
}

export function indexRowFor(index, anchorSha256) {
  return index.packets.find(row => row.trustAnchorSha256 === anchorSha256) || null;
}

export function rowAgrees(row, verified) {
  return row
    && row.sourceSha256 === verified.profile.sourceSha256
    && row.hostSha256 === verified.profile.hostSha256
    && row.clientSha256 === verified.anchor.clientSha256
    && row.clientBytes === verified.anchor.clientBytes
    && row.descriptorSha256 === verified.anchor.descriptorSha256
    && row.repository === verified.source.repository
    && row.version === CLIENT_VERSION
    && JSON.stringify(row.receiving) === JSON.stringify(verified.anchor.receiving);
}

export async function measureCandidate(sdsRoot) {
  const {installedSourceSha256, hostSourceSha256} = await import('../../vendor/hosted-wallet-market/src/native-debt.mjs');
  return {
    repository: 'epistemedeus/samedaydesk',
    sourceSha256: installedSourceSha256(),
    hostSha256: hostSourceSha256(sdsRoot),
  };
}

export function buildUnreceivedPair({
  clientBytes,
  source,
  requiredProfile,
  descriptorRepository,
  descriptorCommit,
  descriptorPath,
}) {
  if (requiredProfile.money !== 'unfunded' || requiredProfile.participation !== 'voluntary-artifact-v1') {
    throw new PacketError('unreceived profile must stay unfunded voluntary-artifact-v1', 1);
  }
  const descriptor = {
    schema: DESCRIPTOR_SCHEMA,
    version: CLIENT_VERSION,
    node: '>=22',
    license: 'none',
    binary: 'cold-requester.mjs',
    bytes: clientBytes.length,
    sha256: sha256(clientBytes),
    source,
    publicationStatus: 'unreceived',
    hostedAcquisitionVerified: false,
    apiActivation: false,
    fundingOrPaymentActivation: false,
    humanPage: false,
    requiredProfile,
  };
  const descriptorBytes = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
  const anchor = {
    schema: ANCHOR_SCHEMA,
    descriptorRepository,
    descriptorCommit,
    descriptorPath,
    descriptorSha256: sha256(descriptorBytes),
    clientSha256: sha256(clientBytes),
    clientBytes: clientBytes.length,
    source,
    requiredProfile,
  };
  if ('receiving' in anchor) throw new PacketError('unreceived anchor cannot carry Root receiving', 1);
  const anchorBytes = Buffer.from(`${JSON.stringify(anchor, null, 2)}\n`);
  const packet = packetFromFiles(anchorBytes, clientBytes, descriptorBytes);
  return {anchor, anchorBytes, descriptor, descriptorBytes, packet};
}
