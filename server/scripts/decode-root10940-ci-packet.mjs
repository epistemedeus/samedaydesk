#!/usr/bin/env node
/**
 * Decode the nonsecret repo variable ROOT10940_CI_PACKET and forward the
 * three acquisition files to receive-root10940-acquisition.mjs.
 *
 * Schema: pilot.participation.ci-packet.v1
 * The variable is one JSON object. Each member carries its own sha256, byte
 * length, and base64 body. This script checks those metadata values, then
 * checks that the decoded client and descriptor match the literals inside
 * the decoded trust anchor. It does not hash this SDS tree, invent a path,
 * or continue when the variable is absent.
 *
 * Exit 2: ROOT10940_CI_PACKET is missing or empty.
 * Exit 1: the packet is present but does not decode and match.
 */
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const SCHEMA = 'pilot.participation.ci-packet.v1';
const ANCHOR_SCHEMA = 'pilot.root10940.acquisition-trust-anchor.v1';
const PARTS = [
  ['trustAnchor', 'ROOT10940_TRUST_ANCHOR', 'trust-anchor.json'],
  ['acquiredClient', 'ROOT10940_ACQUIRED_CLIENT', 'cold-requester.mjs'],
  ['acquisitionDescriptor', 'ROOT10940_ACQUISITION_DESCRIPTOR', 'descriptor.json'],
];

function fail(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const raw = process.env.ROOT10940_CI_PACKET;
if (typeof raw !== 'string' || raw.trim() === '') {
  fail('ROOT10940_CI_PACKET is required', 2);
}

let packet;
try {
  packet = JSON.parse(raw.trim());
} catch {
  fail('ROOT10940_CI_PACKET is not a JSON packet', 1);
}
if (!packet || packet.schema !== SCHEMA) {
  fail(`ROOT10940_CI_PACKET schema must be ${SCHEMA}`, 1);
}

const directory = mkdtempSync(join(tmpdir(), 'root10940-ci-packet-'));
const env = {...process.env};
for (const [key, envName, filename] of PARTS) {
  const item = packet[key];
  if (!item || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
    || !Number.isInteger(item.bytes) || item.bytes < 0 || typeof item.body !== 'string') {
    fail(`ROOT10940_CI_PACKET ${key} is incomplete`, 1);
  }
  const bytes = Buffer.from(item.body, 'base64');
  const actual = sha256(bytes);
  if (bytes.length !== item.bytes || actual !== item.sha256) {
    process.stderr.write(`${key} sha256 mismatch: expected ${item.sha256} actual ${actual} bytes ${bytes.length} expectedBytes ${item.bytes}\n`);
    process.exit(1);
  }
  const path = join(directory, filename);
  writeFileSync(path, bytes, {mode: 0o600});
  env[envName] = path;
}

let anchor;
try {
  anchor = JSON.parse(readFileSync(env.ROOT10940_TRUST_ANCHOR, 'utf8'));
} catch {
  fail('trust anchor is not JSON', 1);
}
if (anchor.schema !== ANCHOR_SCHEMA) fail(`trust anchor schema must be ${ANCHOR_SCHEMA}`, 1);
const clientBytes = readFileSync(env.ROOT10940_ACQUIRED_CLIENT);
const descriptorBytes = readFileSync(env.ROOT10940_ACQUISITION_DESCRIPTOR);
if (sha256(clientBytes) !== anchor.clientSha256 || clientBytes.length !== anchor.clientBytes) {
  fail('decoded client does not match the trust anchor literals', 1);
}
if (sha256(descriptorBytes) !== anchor.descriptorSha256) {
  fail('decoded descriptor does not match the trust anchor literals', 1);
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const child = spawn(process.execPath, ['server/scripts/receive-root10940-acquisition.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env,
});
const [code, signal] = await once(child, 'exit');
if (signal !== null) process.exit(1);
process.exit(code ?? 1);
