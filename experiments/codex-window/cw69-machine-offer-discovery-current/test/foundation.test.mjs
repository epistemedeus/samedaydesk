import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import { sha256Bytes } from '../../../wave5/m12/lib/sources.mjs';
import { selectById } from '../../../wave5/m13/src/identity.mjs';
import { listCurrentJobs } from '../../../wave5/m13/src/invoke.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const owned = fileURLToPath(new URL('../', import.meta.url));
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('all 42 imported consumer files retain their original source bytes', () => {
  const imports = json(resolve(owned, 'evidence/source-imports.json'));
  assert.equal(imports.flatMap((row) => row.files).length, 42);
  for (const row of imports.flatMap((entry) => entry.files)) {
    const bytes = readFileSync(resolve(root, row.path));
    assert.equal(bytes.length, row.bytes, row.path);
    assert.equal(sha256Bytes(bytes), row.sha256, row.path);
  }
});

test('inspected dependency bytes still match the recorded integrated base', () => {
  const pins = json(resolve(owned, 'evidence/dependency-pins.json'));
  assert.equal(pins.integratedBase, 'a9aaa0f8a3bb996948e6033f743b62c4e5417882');
  for (const row of pins.files) {
    const bytes = readFileSync(resolve(root, row.path));
    assert.equal(sha256Bytes(bytes), row.sha256, row.path);
    assert.equal(bytes.length, row.bytes, row.path);
  }
});

test('the current CLI lists ten jobs; stable identity survives an unrelated first item', () => {
  const result = listCurrentJobs({ repoRoot: root, cli: resolve(root, 'server/paid-useful-jobs/bin/cli.mjs') });
  assert.equal(result.status, 0, JSON.stringify(result));
  assert.equal(result.body.ok, true);
  assert.equal(result.body.jobs.length, 10);
  assert.equal(result.body.firstOffer, 'lockfile-pin-delta');
  const rows = [{ id: 'unrelated-first-item' }, ...result.body.jobs.map((id) => ({ id }))];
  assert.equal(selectById(rows, 'lockfile-pin-delta').id, 'lockfile-pin-delta');
  assert.equal(selectById(rows, 'unknown-job'), null);
});

test('recorded merchant 1.23.49 and unpaid challenge remain separate from local execution', () => {
  const dir = resolve(owned, 'evidence/remote');
  const captures = json(resolve(dir, 'capture.json'));
  for (const row of captures.filter((entry) => entry.sha256)) {
    const bytes = readFileSync(resolve(dir, `${row.name}.json`));
    assert.equal(bytes.length, row.bytes);
    assert.equal(sha256Bytes(bytes), row.sha256);
  }
  const registry = json(resolve(dir, 'mcp-version.json'));
  assert.equal(registry.server.name, 'io.github.epistemedeus/x402-data-gateway');
  assert.equal(registry.server.version, '1.23.49');
  const openapi = json(resolve(dir, 'openapi.json'));
  assert.equal(openapi.info.version, '1.23.49');
  const route = openapi.paths['/lockfile-pin-delta'];
  assert.equal(route.get, undefined);
  assert.equal(route.post.operationId, 'compareLockfilePinDelta');
  assert.deepEqual(route.post['x-payment-info'].protocols.map((row) => Object.keys(row)), [['x402']]);
  const capture = captures.find((row) => row.name === 'lockfile-challenge');
  assert.equal(capture.status, 402);
  assert.equal(capture.authorizationSent, false);
  assert.equal(capture.paymentSent, false);
  assert.equal(sha256Bytes(readFileSync(resolve(dir, 'lockfile-request.json'))), capture.requestSha256);
  const challenge = json(resolve(dir, 'lockfile-challenge.json'));
  assert.equal(challenge.accepts[0].amount, '5000');
});
