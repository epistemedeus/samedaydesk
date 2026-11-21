import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareMachineEnvironment } from '../deploy/environment-packet.mjs';
import { EXTRACTION_SCHEMA } from '../extraction.mjs';
import { SCHEMAS } from '../postgres.mjs';

const deploy = fileURLToPath(new URL('../deploy/', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));

function names(text) {
  return text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

test('active deploy inputs match env.keys, install archives, and the extraction contract', async () => {
  const inputs = JSON.parse(await readFile(path.join(deploy, 'inputs/inputs.json'), 'utf8'));
  const historical = JSON.parse(await readFile(path.join(deploy, 'inputs/inputs.historical.json'), 'utf8'));
  const pins = JSON.parse(await readFile(path.join(deploy, '../PINS.json'), 'utf8'));
  const pin = JSON.parse(await readFile(path.join(repo, 'server/foundry/activation/private-control-pin.json'), 'utf8'));
  const packetNames = names(await readFile(path.join(deploy, 'env.keys'), 'utf8'));
  const gatewayNames = names(await readFile(path.join(deploy, 'inputs/gateway.env.names'), 'utf8'));
  const monitorNames = names(await readFile(path.join(deploy, 'inputs/monitor.env.names'), 'utf8'));

  assert.equal(inputs.active, true);
  assert.equal(inputs.schema, 'sds.machine-services.deploy-inputs.v2');
  assert.equal(inputs.historicalSnapshot, 'inputs.historical.json');
  assert.equal(historical.schema, 'pilot.ae14.sds-deploy-inputs.v1');
  assert.equal(historical.gateway.storage.postgres, 'none');
  assert.equal(historical.gateway.storage.kind.includes('SQLite'), true);
  assert.notEqual(historical.host.base, inputs.host.base);

  assert.deepEqual(gatewayNames, inputs.names.gateway);
  assert.deepEqual(monitorNames, inputs.names.monitor);
  const listed = [...inputs.names.gateway, ...inputs.names.monitor, ...inputs.names.installerOnly, ...inputs.names.discovery];
  assert.deepEqual([...new Set(listed)].sort(), [...packetNames].sort());
  for (const name of listed) assert.match(name, /^[A-Z_][A-Z0-9_]*$/);
  assert.equal(listed.includes('MACHINE_GATEWAY_STATE_FILE'), false);
  assert.equal(listed.includes('MONITOR_STATE_FILE'), false);
  for (const name of inputs.names.installerOnly.concat(inputs.names.discovery)) {
    assert.equal(gatewayNames.includes(name), false);
    assert.equal(monitorNames.includes(name), false);
  }

  assert.equal(inputs.host.base, pins.hostBase);
  assert.equal(inputs.host.start, 'node server/index.js');
  assert.equal(inputs.host.deployed, false);
  assert.equal(inputs.environment.retainedBaselineCount, 59);
  assert.equal(inputs.environment.preservesExistingValues, true);
  assert.equal(inputs.environment.productionStores, 'postgres');
  assert.equal(inputs.environment.paymentsEnabled, '0');
  assert.equal(inputs.environment.sqliteProduction, false);
  assert.equal(inputs.closure.replacesPriors, false);
  assert.equal(inputs.closure.preserved, true);
  assert.equal(pin.receivedCallerClosures.length, pins.sourceQualification.priorCallerDescriptorsAccepted);
  assert.ok(pin.receivedCallerClosures.length >= 1);

  assert.equal(inputs.gateway.mountPrefix, '/api/machine-gateway');
  assert.equal(inputs.gateway.paymentsEnabled, '0');
  assert.equal(inputs.gateway.storage.kind, 'postgres');
  assert.equal(inputs.gateway.storage.schema, SCHEMAS.gateway);
  assert.equal(inputs.gateway.storage.sqliteProduction, false);
  assert.equal(inputs.monitor.mountPrefix, '/api/monitor');
  assert.equal(inputs.monitor.proposed, false);
  assert.equal(inputs.monitor.storage.kind, 'postgres');
  assert.equal(inputs.monitor.storage.schema, SCHEMAS.monitor);
  assert.equal(inputs.monitor.storage.sqliteProduction, false);
  assert.deepEqual(inputs.monitor.runtime.ignoredStandaloneKeys, ['database', 'host', 'port']);
  assert.equal(inputs.extraction.schema, EXTRACTION_SCHEMA);
  assert.equal(EXTRACTION_SCHEMA, 'ae19_paid_continuation');
  assert.equal(inputs.extraction.servingMigrates, false);
  assert.deepEqual(inputs.install.schemas, [SCHEMAS.gateway, SCHEMAS.monitor, EXTRACTION_SCHEMA]);

  const selected = inputs.gateway.archives.filter(archive => archive.selected);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].version, '0.1.2');
  assert.equal(selected[0].sha256, pins.urlExtract.u1.sha256);
  assert.deepEqual(inputs.gateway.archives.map(archive => archive.sha256), pins.gatewayArchives.map(archive => archive.sha256));
  for (const archive of inputs.gateway.archives) {
    const bytes = await readFile(path.join(repo, archive.path));
    assert.equal(bytes.length, archive.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), archive.sha256);
  }

  const existing = Array.from({ length: 59 }, (_, index) => ({ key: `RETAINED_FIXTURE_${index}`, value: `synthetic-${index}` }));
  const packet = prepareMachineEnvironment({
    existing,
    listed: existing.map(({ key }) => ({ key })),
    overlay: [
      { key: 'MACHINE_GATEWAY_STORE', value: 'postgres' },
      { key: 'MONITOR_STORE', value: 'postgres' },
      { key: 'MACHINE_GATEWAY_PAYMENTS_ENABLED', value: '0' },
    ],
  });
  assert.equal(packet.receipt.existingKeys, 59);
  assert.equal(packet.receipt.preservesExistingValues, true);
  assert.equal(packet.rollback.env_vars.length, 59);
  for (const row of existing) {
    assert.equal(packet.install.env_vars.find(item => item.key === row.key).value, row.value);
    assert.equal(packet.rollback.env_vars.find(item => item.key === row.key).value, row.value);
  }
});
