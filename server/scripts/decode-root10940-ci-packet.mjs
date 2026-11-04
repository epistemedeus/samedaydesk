#!/usr/bin/env node
/**
 * Decode one nonsecret acquisition packet and forward its three files to
 * receive-root10940-acquisition.mjs.
 *
 * Schema: pilot.participation.ci-packet.v1
 * --packet FILE reads that file. An explicit file wins over
 * ROOT10940_CI_PACKET and does not write or clear the variable. The profile
 * assertion in the participation test stays strict: this script does not
 * compare the SDS tree and does not rewrite a trusted expected hash.
 *
 * Exit 2: ROOT10940_CI_PACKET is missing or empty and --packet was not passed.
 * Exit 1: the packet is present but does not decode and match.
 */
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PARTS, parsePacket, verifyPacket} from './root10940-ci-packet.mjs';

function fail(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function packetRaw() {
  const index = process.argv.indexOf('--packet');
  if (index < 0) return {kind: 'env', raw: process.env.ROOT10940_CI_PACKET};
  const file = process.argv[index + 1];
  if (typeof file !== 'string' || file.length === 0 || file.startsWith('-')) fail('--packet requires a file', 1);
  try {
    return {kind: 'file', raw: readFileSync(file, 'utf8')};
  } catch {
    fail('--packet file is unreadable', 1);
  }
}

const source = packetRaw();
if (source.kind === 'env' && (typeof source.raw !== 'string' || source.raw.trim() === '')) {
  fail('ROOT10940_CI_PACKET is required', 2);
}

let verified;
try {
  verified = verifyPacket(parsePacket(source.raw));
} catch (error) {
  fail(error.message || 'packet refused', error.code || 1);
}

const directory = mkdtempSync(join(tmpdir(), 'root10940-ci-packet-'));
const env = {...process.env};
// A regression may call this decoder from inside node --test. The participation
// test must start its own runner; the parent channel is not its packet.
delete env.NODE_TEST_CONTEXT;
delete env.NODE_CHANNEL_FD;
const files = [verified.anchorBytes, verified.clientBytes, verified.descriptorBytes];
PARTS.forEach(([, envName, filename], index) => {
  const path = join(directory, filename);
  writeFileSync(path, files[index], {mode: 0o600});
  env[envName] = path;
});
if (source.kind === 'file') delete env.ROOT10940_CI_PACKET;

const root = fileURLToPath(new URL('../..', import.meta.url));
const child = spawn(process.execPath, ['server/scripts/receive-root10940-acquisition.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env,
});
const [code, signal] = await once(child, 'exit');
if (signal !== null) process.exit(1);
process.exit(code ?? 1);
