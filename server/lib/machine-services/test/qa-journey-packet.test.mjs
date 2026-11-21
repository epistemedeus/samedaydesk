import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, chmod, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { prepareMachineEnvironment } from '../deploy/environment-packet.mjs';
import { QA_FREE_URL_ROUTES, QA_TENANT_ID, QA_URL_BINDING, qaJourneyInstall } from '../deploy/qa-journey-packet.mjs';

const hash = 'a'.repeat(64);

function baseline59() {
  return Array.from({ length: 59 }, (_, index) => ({
    key: `RETAINED_${String(index).padStart(2, '0')}`,
    value: `fixture-retained-${index}`,
  }));
}

function packet(routes = [...QA_FREE_URL_ROUTES], binding = { ...QA_URL_BINDING }, extra = {}) {
  return qaJourneyInstall({ tenantId: QA_TENANT_ID, tokenSha256: hash, routes, binding, ...extra });
}

test('the QA install packet supplies the URL binding and the explicit free URL routes', () => {
  const existing = baseline59();
  const built = packet();
  assert.deepEqual(built.tenants.tenants[0].routes, [...QA_FREE_URL_ROUTES]);
  assert.equal(built.tenants.tenants[0].id, QA_TENANT_ID);
  assert.equal(built.tenants.tenants[0].maxUnits, 0);
  assert.equal(built.tenants.tenants[0].routes.includes('lockfile.delta'), false);
  assert.equal(built.tenants.tenants[0].routes.includes('http.capture'), false);
  assert.deepEqual(built.binding, QA_URL_BINDING);
  assert.equal(JSON.stringify(built).includes('http://'), false);
  assert.equal(JSON.stringify(built).includes('https://'), false);
  const prepared = prepareMachineEnvironment({
    existing,
    listed: existing.map(({ key }) => ({ key, value: '********' })),
    overlay: built.overlay,
  });
  assert.equal(prepared.receipt.existingKeys, 59);
  assert.equal(prepared.receipt.machineKeys, 2);
  assert.equal(prepared.receipt.sent, false);
  assert.deepEqual(prepared.rollback.env_vars, existing);
  const tenants = JSON.parse(prepared.install.env_vars.find(row => row.key === 'MACHINE_GATEWAY_TENANTS_JSON').value);
  const binding = JSON.parse(prepared.install.env_vars.find(row => row.key === 'MACHINE_GATEWAY_URL_EXTRACT_JSON').value);
  assert.deepEqual(tenants, built.tenants);
  assert.deepEqual(binding, QA_URL_BINDING);
  for (const retained of existing) assert.deepEqual(prepared.install.env_vars.find(row => row.key === retained.key), retained);
});

test('lockfile.delta plus http.capture is refused and is not expanded into URL routes', () => {
  assert.throws(() => packet(['lockfile.delta', 'http.capture']), error => error.code === 'qa_url_routes_refused');
  assert.throws(() => packet(['http.capture']), error => error.code === 'qa_url_routes_refused');
  assert.throws(() => packet([...QA_FREE_URL_ROUTES, 'http.capture']), error => error.code === 'qa_url_routes_refused');
  assert.throws(() => packet(['url.extract.submit', 'url.extract.poll']), error => error.code === 'qa_url_routes_refused');
});

test('a missing or stand-in URL binding is refused', () => {
  assert.throws(() => qaJourneyInstall({
    tenantId: QA_TENANT_ID, tokenSha256: hash, routes: [...QA_FREE_URL_ROUTES],
  }), error => error.code === 'url_extract_binding_missing');
  assert.throws(() => packet([...QA_FREE_URL_ROUTES], { fixture: 'extract' }), error => error.code === 'qa_url_binding_refused');
  assert.throws(() => packet([...QA_FREE_URL_ROUTES], {
    schema: QA_URL_BINDING.schema, tenantId: QA_URL_BINDING.tenantId, actorId: 'other-actor',
  }), error => error.code === 'qa_url_binding_refused');
  assert.throws(() => packet([...QA_FREE_URL_ROUTES], { ...QA_URL_BINDING, url: 'https://example.test/private' }), error => error.code === 'qa_url_binding_refused');
});

test('a paid grant or a different tenant is refused', () => {
  assert.throws(() => packet([...QA_FREE_URL_ROUTES], { ...QA_URL_BINDING }, { maxUnits: 1 }), error => error.code === 'qa_free_route_refused');
  assert.throws(() => qaJourneyInstall({
    tenantId: 'other-tenant', tokenSha256: hash, routes: [...QA_FREE_URL_ROUTES], binding: { ...QA_URL_BINDING },
  }), error => error.code === 'qa_tenant_refused');
  assert.throws(() => packet([...QA_FREE_URL_ROUTES], { ...QA_URL_BINDING }, { tokenSha256: 'not-a-hash' }), error => error.code === 'qa_credential_hash_refused');
});

test('the packet CLI reads the binding and credential hash from files and prints neither', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sds-qa-journey-'));
  const binding = path.join(directory, 'binding.json');
  const token = path.join(directory, 'token-sha.json');
  const overlay = path.join(directory, 'overlay.json');
  await writeFile(binding, `${JSON.stringify(QA_URL_BINDING)}\n`, { mode: 0o600 });
  await writeFile(token, `${JSON.stringify({ tokenSha256: hash })}\n`, { mode: 0o600 });
  await chmod(binding, 0o600);
  await chmod(token, 0o600);
  const child = spawn(process.execPath, [
    'server/lib/machine-services/deploy/qa-journey-packet.mjs',
    '--binding', binding, '--token-sha-file', token, '--overlay', overlay,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.on('close', resolve));
  try {
    assert.equal(code, 0, stderr);
    assert.equal(stdout.includes(hash), false);
    assert.equal(stderr.includes(hash), false);
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.schema, 'sds.qa-journey-install.v1');
    assert.equal(receipt.bindingSupplied, true);
    assert.equal(receipt.sent, false);
    assert.deepEqual(receipt.routes, [...QA_FREE_URL_ROUTES]);
    const written = JSON.parse(await readFile(overlay, 'utf8'));
    assert.equal(written.env_vars.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
