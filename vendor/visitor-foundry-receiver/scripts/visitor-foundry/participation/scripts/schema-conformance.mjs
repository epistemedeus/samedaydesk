import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { negotiate, decline } from '../src/index.mjs';
import { disclosure, negotiation, preflightHost, tasks } from '../examples/hosts.mjs';
const ajv = new Ajv({ strict: true });
const read = name => JSON.parse(readFileSync(new URL(`../schema/${name}.v1.json`, import.meta.url), 'utf8'));
const envelope = ajv.compile(read('participation')), negotiationSchema = ajv.compile(read('negotiation'));
assert.equal(negotiationSchema(negotiation), true);
let validated = 0;
for (const condition of ['resolved', 'unknown', 'auth-failure', 'temporary-outage', 'quota-pressure']) {
  const value = negotiate(negotiation, { disclosure, condition, assessment: preflightHost().invoke(tasks.preflight.original).assessment });
  assert.equal(envelope(value), true, JSON.stringify(envelope.errors)); validated++;
  assert.equal(envelope(decline(null, value).participation), true);
  assert.equal(envelope({ ...value, privateInput: 'forbidden' }), false);
  assert.equal(envelope({ ...value, cost: { units: 1.2, currency: 'USD' } }), false);
}
console.log(JSON.stringify({ schema: 'neomorphic.foundry.participation-schema-check.v1', validatedEnvelopes: validated, validatedDeclinedEnvelopes: validated, closedFieldAndIntegerCostRejections: 10, negotiationValidated: true }));
