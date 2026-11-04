#!/usr/bin/env node
/**
 * Select the one approved packet whose requiredProfile is this candidate.
 *
 * A legacy ROOT10940_CI_PACKET value is one historical input. It is not the
 * current packet for every source fingerprint, and this script never writes
 * that variable or rewrites an expected hash.
 *
 * Exit 0 selected.
 * Exit 1 tampered or approved packets disagree.
 * Exit 2 missing.
 * Exit 3 stale.
 * Exit 4 wrong-repository.
 * Exit 5 changed-source.
 * Exit 6 unreceived.
 */
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  ENROLLMENT_SCHEMA,
  catalogFileName,
  enrollmentCommand,
  indexRowFor,
  measureCandidate,
  parsePacket,
  readIndex,
  rootReceivingAccepted,
  rowAgrees,
  sha256,
  verifyPacket,
} from './root10940-ci-packet.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const has = name => args.includes(`--${name}`);

function fail(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

const measured = flag('source-sha256') && flag('host-sha256')
  ? {
    repository: flag('repository') || 'epistemedeus/samedaydesk',
    sourceSha256: flag('source-sha256'),
    hostSha256: flag('host-sha256'),
  }
  : await measureCandidate(root);
if (flag('repository')) measured.repository = flag('repository');

const inputs = [];
function add(label, raw) {
  inputs.push({label, raw});
}
if (flag('catalog')) {
  const catalog = resolve(root, flag('catalog'));
  for (const name of readdirSync(catalog).sort()) {
    if (!/^[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(name)) continue;
    add(join(catalog, name), readText(join(catalog, name)));
  }
}
if (flag('bound')) add(`bound:${flag('bound')}`, readText(resolve(root, flag('bound'))));
const extra = args.flatMap((item, index) => item === '--packet' ? [args[index + 1]] : []);
for (const path of extra) add(`packet:${path}`, readText(resolve(root, path)));
if (has('legacy-env')) {
  if (typeof process.env.ROOT10940_CI_PACKET === 'string' && process.env.ROOT10940_CI_PACKET.trim() !== '') {
    add('ROOT10940_CI_PACKET', process.env.ROOT10940_CI_PACKET);
  }
}

let index = {schema: 'pilot.root10940.approved-ci-packet-index.v1', packets: []};
if (flag('index')) index = readIndex(readText(resolve(root, flag('index'))));

const boundLabel = flag('bound') ? `bound:${flag('bound')}` : null;
const records = [];
for (const input of inputs) {
  try {
    const packet = parsePacket(input.raw);
    const verified = verifyPacket(packet);
    const anchorSha256 = sha256(verified.anchorBytes);
    const row = indexRowFor(index, anchorSha256);
    let cls = 'stale';
    if (verified.source.repository !== measured.repository) cls = 'wrong-repository';
    else if (verified.profile.sourceSha256 !== measured.sourceSha256 || verified.profile.hostSha256 !== measured.hostSha256) {
      cls = input.label === boundLabel ? 'changed-source' : 'stale';
    } else if (!row || !rowAgrees(row, verified) || !rootReceivingAccepted(verified.anchor.receiving, verified.source.repository)) cls = 'unreceived';
    else cls = 'eligible';
    if (row && !rowAgrees(row, verified)) cls = 'tampered';
    if (!input.label.startsWith('bound:') && !input.label.startsWith('packet:') && input.label !== 'ROOT10940_CI_PACKET') {
      const base = input.label.split('/').pop();
      if (base !== catalogFileName(verified.profile.sourceSha256, verified.profile.hostSha256)) cls = 'tampered';
    }
    records.push({...input, packet, verified, anchorSha256, cls});
  } catch (error) {
    records.push({...input, cls: 'tampered', message: error.message});
  }
}

function writeEnrollment(selectedClass) {
  if (!flag('enrollment-out')) return;
  const kept = records.filter(item => item.verified).map(item => ({
    label: item.label,
    class: item.cls,
    sourceSha256: item.verified.profile.sourceSha256,
    hostSha256: item.verified.profile.hostSha256,
    trustAnchorSha256: item.anchorSha256,
    clientSha256: item.verified.anchor.clientSha256,
  }));
  const body = {
    schema: ENROLLMENT_SCHEMA,
    received: false,
    independentReleaseAuthority: false,
    class: selectedClass,
    measured,
    kept,
    command: enrollmentCommand(),
  };
  const path = resolve(root, flag('enrollment-out'));
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

function finish(code, message) {
  if (code !== 0) writeEnrollment(message.split(' ')[0]);
  fail(message, code);
}

if (boundLabel) {
  const bound = records.find(item => item.label === boundLabel);
  if (!bound) finish(2, 'missing bound packet');
  if (bound.cls === 'tampered') finish(1, bound.message || 'tampered');
  if (bound.cls === 'wrong-repository') finish(4, `wrong-repository ${bound.verified.source.repository}`);
  if (bound.cls === 'changed-source' || bound.cls === 'stale') {
    finish(5, `changed-source actual ${measured.sourceSha256} expected ${bound.verified.profile.sourceSha256}`);
  }
  if (bound.cls === 'unreceived') finish(6, `unreceived ${bound.anchorSha256}`);
}

const eligible = records.filter(item => item.cls === 'eligible');
const distinct = [...new Map(eligible.map(item => [item.anchorSha256, item])).values()];
if (distinct.length > 1) finish(1, 'approved_packet_disagreement');
if (distinct.length === 1) {
  if (!flag('out')) fail('--out is required', 2);
  const path = resolve(root, flag('out'));
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(distinct[0].packet)}\n`, {mode: 0o600});
  process.stdout.write(`${JSON.stringify({
    selected: catalogFileName(measured.sourceSha256, measured.hostSha256),
    trustAnchorSha256: distinct[0].anchorSha256,
    sourceSha256: measured.sourceSha256,
    hostSha256: measured.hostSha256,
  })}\n`);
  process.exit(0);
}

if (records.length === 0) finish(2, 'missing ROOT10940_CI_PACKET');
if (records.some(item => item.cls === 'wrong-repository' && item.verified
  && item.verified.profile.sourceSha256 === measured.sourceSha256
  && item.verified.profile.hostSha256 === measured.hostSha256)) {
  finish(4, 'wrong-repository');
}
if (records.some(item => item.cls === 'unreceived')) finish(6, 'unreceived');
if (records.every(item => item.cls === 'tampered')) finish(1, `tampered ${records.map(item => item.message).filter(Boolean).join('; ') || 'packet'}`);
if (records.some(item => item.cls === 'stale' || item.cls === 'changed-source')) {
  const stale = records.find(item => item.verified);
  finish(3, `stale actual ${measured.sourceSha256} expected ${stale.verified.profile.sourceSha256}`);
}
finish(2, 'missing ROOT10940_CI_PACKET');
