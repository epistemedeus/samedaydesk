// Hostinger runs this as the body of the allowlisted build:managed-foundry script.
// It checks the already consumed client/dist. It does not run Vite or write dist.
import {createHash} from 'node:crypto';
import {lstatSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const RECEIPT = 'publication/PRESERVED-PUBLICATION.json';
const DIST = 'client/dist';
const FILE_CAP = 16 * 1024 * 1024;
const ROOT_CAP = 80_000_000;

function fail(reason) {
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
}

function safeRelative(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 4096 && !name.startsWith('/') &&
    !name.includes('\\') && !/[\x00-\x1f\x7f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function walk(dir) {
  const out = new Map();
  let total = 0;
  function rec(prefix) {
    let names;
    try {
      names = readdirSync(prefix ? path.join(dir, prefix) : dir);
    } catch {
      fail('dist_required');
      return;
    }
    for (const name of names) {
      if (process.exitCode) return;
      const relative = prefix ? `${prefix}/${name}` : name;
      if (!safeRelative(relative)) {
        fail('path_refused');
        return;
      }
      const absolute = path.join(dir, relative);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        fail('link_refused');
        return;
      }
      if (stat.isDirectory()) {
        rec(relative);
        if (process.exitCode) return;
      } else if (!stat.isFile()) {
        fail('special_refused');
        return;
      } else if (stat.size > FILE_CAP) {
        fail('member_too_large');
        return;
      } else {
        const body = readFileSync(absolute);
        if (body.length !== stat.size) {
          fail('member_changed');
          return;
        }
        total += body.length;
        if (total > ROOT_CAP) {
          fail('root_too_large');
          return;
        }
        out.set(relative, {bytes: body.length, sha256: sha256(body)});
      }
    }
  }
  rec('');
  return process.exitCode ? null : {out, total};
}

function inventorySha256(rows) {
  const pairs = rows.map(([file, digest]) => [file, digest]);
  pairs.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  return sha256(Buffer.from(JSON.stringify(pairs)));
}

const receiptPath = path.resolve(RECEIPT);
let receiptStat;
try {
  receiptStat = lstatSync(receiptPath);
} catch {
  fail('publication_receipt_required');
}
if (process.exitCode) process.exit(process.exitCode);
if (receiptStat.isSymbolicLink() || !receiptStat.isFile()) {
  fail('publication_receipt_required');
  process.exit(process.exitCode);
}
let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch {
  fail('publication_receipt_refused');
  process.exit(process.exitCode);
}
if (receipt?.schema !== 'pilot.root22900.preserved-publication.v1' || receipt.consumedBeforeServe !== true) {
  fail('publication_unconsumed');
  process.exit(process.exitCode);
}
if (!Array.isArray(receipt.members) || receipt.members.length === 0 || receipt.completeRoot !== true) {
  fail('subset_receipt_refused');
  process.exit(process.exitCode);
}
let distStat;
try {
  distStat = lstatSync(path.resolve(DIST));
} catch {
  fail('dist_required');
  process.exit(process.exitCode);
}
if (distStat.isSymbolicLink() || !distStat.isDirectory()) {
  fail('dist_required');
  process.exit(process.exitCode);
}
const walked = walk(path.resolve(DIST));
if (!walked) process.exit(process.exitCode);
const expected = new Map();
for (const row of receipt.members) {
  if (!Array.isArray(row) || row.length < 3 || !safeRelative(row[0]) || expected.has(row[0])) {
    fail('subset_receipt_refused');
    process.exit(process.exitCode);
  }
  if (!Number.isSafeInteger(row[1]) || row[1] < 0 || !/^[a-f0-9]{64}$/.test(row[2])) {
    fail('publication_receipt_refused');
    process.exit(process.exitCode);
  }
  expected.set(row[0], {bytes: row[1], sha256: row[2]});
}
if (walked.out.size !== expected.size) {
  fail(walked.out.size < expected.size ? 'full_root_required' : 'extra_member_refused');
  process.exit(process.exitCode);
}
for (const [file, row] of expected) {
  const got = walked.out.get(file);
  if (!got) {
    fail('full_root_required');
    process.exit(process.exitCode);
  }
  if (got.bytes !== row.bytes || got.sha256 !== row.sha256) {
    fail('baseline_mismatch');
    process.exit(process.exitCode);
  }
}
const pairs = [...walked.out].map(([file, row]) => [file, row.sha256]);
const digest = inventorySha256(pairs);
if (receipt.expected?.files !== walked.out.size || receipt.expected?.bytes !== walked.total ||
    receipt.expected?.inventorySha256 !== digest) {
  fail('whole_inventory_digest_refused');
  process.exit(process.exitCode);
}
process.stdout.write(`${JSON.stringify({ok: true, viteInvoked: false, files: walked.out.size, bytes: walked.total, inventorySha256: digest})}\n`);
