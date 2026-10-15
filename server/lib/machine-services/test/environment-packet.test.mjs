import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMachineEnvironment } from '../deploy/environment-packet.mjs';

const journey = 'j'.repeat(32);
const qa = 'q'.repeat(32);
const dir = '/private/discovery-log';

function baseline59() {
  const rows = Array.from({ length: 59 }, (_, index) => ({
    key: `RETAINED_${String(index).padStart(2, '0')}`,
    value: `fixture-retained-${index}`,
  }));
  assert.equal(rows.length, 59);
  return rows;
}
function listed(rows) {
  return rows.map(({ key }) => ({ key, value: '********' }));
}
function packet(overlay, existing = baseline59()) {
  return prepareMachineEnvironment({ existing, listed: listed(existing), overlay });
}
function row(packetValue, key) {
  return packetValue.install.env_vars.find(candidate => candidate.key === key);
}

test('discovery keys add to a 59-value baseline and leave every retained row unchanged', () => {
  const existing = baseline59();
  const result = packet([
    { key: 'MACHINE_GATEWAY_ENABLED', value: '1' },
    { key: 'DISCOVERY_LOG_DIR', value: dir },
    { key: 'DISCOVERY_LOG_QA_SECRET', value: qa },
    { key: 'DISCOVERY_LOG_JOURNEY_SECRET', value: journey },
  ], existing);
  assert.equal(result.receipt.existingKeys, 59);
  assert.equal(result.receipt.machineKeys, 1);
  assert.equal(result.receipt.discoveryKeys, 3);
  assert.equal(result.install.env_vars.length, 63);
  assert.deepEqual(result.rollback.env_vars, existing);
  for (const retained of existing) assert.deepEqual(row(result, retained.key), retained);
  assert.equal(row(result, 'DISCOVERY_LOG_JOURNEY_SECRET').value.length, 32);
  assert.equal(row(result, 'DISCOVERY_LOG_QA_SECRET').value, qa);
  assert.equal(row(result, 'DISCOVERY_LOG_DIR').value, dir);
});

test('an unknown key is refused and the baseline is not returned as an install', () => {
  assert.throws(() => packet([{ key: 'DISCOVERY_LOG_OTHER', value: journey }]), /unrelated_environment_change_refused/);
  assert.throws(() => packet([{ key: 'CORRESPONDENCE_DATABASE_URL', value: 'fixture-replacement' }]), /unrelated_environment_change_refused/);
});

test('an existing allowed key is not overwritten', () => {
  const existing = [...baseline59(), { key: 'MONITOR_ENABLED', value: '1' }, { key: 'DISCOVERY_LOG_DIR', value: dir }];
  assert.throws(() => packet([{ key: 'MONITOR_ENABLED', value: '1' }], existing), /existing_environment_key_not_overwritten/);
  assert.throws(() => packet([{ key: 'MONITOR_ENABLED', value: '0' }], existing), /existing_environment_key_not_overwritten/);
  assert.throws(() => packet([{ key: 'DISCOVERY_LOG_DIR', value: '/private/other-discovery-log' }], existing), /existing_environment_key_not_overwritten/);
  assert.throws(() => packet([{ key: 'DISCOVERY_LOG_JOURNEY_SECRET', value: journey }], [
    ...baseline59(),
    { key: 'DISCOVERY_LOG_JOURNEY_SECRET', value: 'k'.repeat(32) },
  ]), /existing_environment_key_not_overwritten/);
});

test('a discovery secret shorter than 32 characters is refused', () => {
  for (const key of ['DISCOVERY_LOG_JOURNEY_SECRET', 'DISCOVERY_LOG_QA_SECRET']) {
    assert.throws(() => packet([{ key, value: 'j'.repeat(31) }]), /discovery_secret_refused/);
    assert.throws(() => packet([{ key, value: '' }]), /discovery_secret_refused/);
  }
  const accepted = packet([{ key: 'DISCOVERY_LOG_JOURNEY_SECRET', value: journey }]);
  assert.equal(row(accepted, 'DISCOVERY_LOG_JOURNEY_SECRET').value.length, 32);
});

test('a discovery directory must be absolute and must not contain a parent segment', () => {
  assert.throws(() => packet([{ key: 'DISCOVERY_LOG_DIR', value: 'discovery-log' }]), /discovery_dir_refused/);
  assert.throws(() => packet([{ key: 'DISCOVERY_LOG_DIR', value: '/private/../discovery-log' }]), /discovery_dir_refused/);
});
