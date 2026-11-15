import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { QUERY_KEY_CONSUMER as entry } from '../lib/query-key-caller.mjs';
import { digest } from '../../experiments/agl-seed-loop-20261104/digest.mjs';

const origin = 'https://samedaydesk.com';
const calls = [];
const live = process.argv.includes('--live');
async function get(href) {
  const url = new URL(href);
  // Require the whole fallback to work without reaching Neomorphic, even via redirect.
  assert.ok(url.origin === origin || url.href === entry.runner.alternateArchive, url.href);
  calls.push(`${url.origin}${url.pathname}`);
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12_000) });
  assert.equal(res.status, 200, url.pathname);
  return Buffer.from(await res.arrayBuffer());
}
const rights = { license: entry.reuse.license, scope: 'synthetic' };
const input = { schema: entry.schema, left: { method: 'GET', path: '/fallback-check-42', pairs: [{ key: 'mode', form: 'bare' }] }, right: { method: 'GET', path: '/fallback-check-42', pairs: [{ key: 'mode', form: 'blank' }] } };
const control = { ok: true, value: { taskId: 'isolated-fallback-control', rights, rightsDigest: digest(rights), publicArtifact: input, publicArtifactDigest: digest(input) } };

function verifyReceipts(item, detail, artifact) {
  assert.ok(detail.ok && artifact.ok);
  for (const key of ['taskId', 'rightsDigest', 'publicArtifactDigest']) {
    assert.ok(item[key]);
    assert.equal(detail.value[key], item[key]);
    assert.equal(artifact.value[key], item[key]);
  }
  assert.equal(artifact.value.rights.license, entry.reuse.license);
  assert.equal(artifact.value.publicArtifact.schema, entry.schema);
  assert.equal(digest(artifact.value.rights), item.rightsDigest);
  assert.equal(digest(artifact.value.publicArtifact), item.publicArtifactDigest);
}

test('the alternate delivers the old pinned runner for a real caller, not the bundled sample', async () => {
  let artifact = control;
  let archive;
  if (live) {
    const catalog = JSON.parse(await get(`${origin}/.well-known/api-catalog`));
    const links = catalog.linkset.find(group => new URL(group.anchor).origin === origin);
    assert.ok(links.describedby.some(link => link.href === entry.acceptedWork));
    const list = JSON.parse(await get(entry.acceptedWork));
    assert.equal(list.ok, true);
    const item = list.value.items.find(row => row.rights?.license === entry.reuse.license && row.publicArtifactDigest);
    assert.ok(item && /^market-[0-9a-f]{64}$/.test(item.taskId));
    const detailUrl = `${entry.acceptedWork}/${item.taskId}`;
    const artifactUrl = `${entry.acceptedWork}${entry.reuse.artifactPathSuffix.replace('{taskId}', item.taskId)}`;
    artifact = JSON.parse(await get(artifactUrl));
    verifyReceipts(item, JSON.parse(await get(detailUrl)), artifact);
    archive = await get(entry.runner.alternateArchive);
  } else {
    archive = readFileSync(new URL('../../experiments/agl-seed-loop-20261104/fixtures/query-key-1.1.0.tar.gz', import.meta.url));
    verifyReceipts(control.value, control, artifact);
  }
  assert.equal(archive.length, entry.runner.bytes);
  assert.equal(createHash('sha256').update(archive).digest('hex'), entry.runner.sha256);
  const dir = mkdtempSync(join(tmpdir(), 'sds-query-key-fallback-'));
  try {
    writeFileSync(join(dir, 'query-key.tar.gz'), archive);
    writeFileSync(join(dir, 'caller.json'), JSON.stringify(artifact.value.publicArtifact));
    const extracted = spawnSync('tar', ['-xzf', 'query-key.tar.gz'], { cwd: dir, encoding: 'utf8', timeout: 5_000 });
    assert.equal(extracted.status, 0, extracted.stderr);
    const [binary, ...args] = entry.reuse.applyCaller.split(' ');
    assert.equal(binary, 'node');
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 5_000 });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.executed, false);
    // The runner exposes query wires and the chosen paths separately.
    assert.equal(body.input.left.path, artifact.value.publicArtifact.left.path);
    assert.equal(body.input.right.path, artifact.value.publicArtifact.right.path);
    assert.equal(body.input.left.raw, body.wire.left);
    assert.equal(body.input.right.raw, body.wire.right);
    assert.notEqual(body.wire.left, body.wire.right);
    if (live) console.log(JSON.stringify({ calls, archiveBytes: archive.length, wire: body.wire, executed: body.executed }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('different artifact bytes, rights or schema cannot qualify', () => {
  const changed = structuredClone(control);
  changed.value.publicArtifact.right.path = '/different';
  assert.throws(() => verifyReceipts(control.value, control, changed));
  changed.value.publicArtifact = control.value.publicArtifact;
  changed.value.rights.license = 'unknown';
  assert.throws(() => verifyReceipts(control.value, control, changed));
  changed.value.rights = control.value.rights;
  changed.value.publicArtifact = { ...control.value.publicArtifact, schema: 'other' };
  assert.throws(() => verifyReceipts(control.value, control, changed));
});
