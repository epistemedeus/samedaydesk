// Optional independent JSON Schema check using the repository's locked Ajv devDependency.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from '../../../../node_modules/ajv/dist/2020.js';
import addFormats from '../../../../node_modules/ajv-formats/dist/index.js';
import { baseline, candidate, defaultLimits, defaultPolicy, harness, manifest, observation } from '../fixtures/example-config.mjs';
import { schemaId } from '../src/index.mjs';
const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
const h = harness(); const accepted = h.accept();
const examples = { candidate: candidate(), verification_assignment: accepted.assignment, verification_receipt: accepted.receipt, reuse_observation: observation(), validation_policy: defaultPolicy, validation_limits: defaultLimits, cohort_manifest: manifest(), baseline_trial: baseline(), validation_command: { schema: schemaId('validation_command'), id: 'command:example', expectedRevision: 0, type: 'submit', payload: candidate() } };
for (const [name, value] of Object.entries(examples)) {
  const schema = JSON.parse(readFileSync(new URL(`../schema/${name}.v1.json`, import.meta.url), 'utf8'));
  const validate = ajv.compile(schema); assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...value, inventedAuthority: true }), false);
}
const command = ajv.getSchema(schemaId('validation_command'));
assert.equal(command({ ...examples.validation_command, type: 'receipt' }), false);
const receipt = ajv.getSchema(schemaId('verification_receipt'));
assert.equal(receipt({ ...accepted.receipt, observedAt: '2026-09-26T12:00:00+00:00' }), false);
assert.equal(receipt({ ...accepted.receipt, usage: { ...accepted.receipt.usage, cost: { currency: 'USD_MICROS', units: 1.2 } } }), false);
console.log(JSON.stringify({ schemasValidated: Object.keys(examples), closedFieldsRejected: true, commandPayloadMismatchRejected: true, nonUtcTimestampRejected: true, floatCostRejected: true }));
