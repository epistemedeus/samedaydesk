import test from 'node:test';
import assert from 'node:assert/strict';
import { baseline, candidate, harness, manifest, observation } from '../fixtures/example-config.mjs';
import { attachEvidenceJoin, compareCohorts, digest, projectReuse } from '../src/index.mjs';
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.result; };
function prepared(options) { const h = harness(options); h.accept(); h.advance(60000); return h; }
const observe = (h, o = observation()) => ok(h.command('beneficiary', 'observe', o));
const attest = (h, o = observation(), overrides = {}) => h.command('evidence', 'attest', { observationId: o.id, observationDigest: digest(o), evidence: { ref: 'fixture:authenticated-source-adapter', revision: 'fixture:v1' }, outcome: 'useful', independence: 'established', ...overrides });

test('unknown relationship/cost stay unknown; owner QA and sponsored evaluation never become independent useful external outcomes', () => {
  const h = prepared();
  observe(h, observation({ relationship: 'unknown' }));
  observe(h, observation({ id: 'reuse:sponsored', taskId: 'task:sponsored', relationship: 'sponsored', purpose: 'sponsored_evaluation' }));
  const p = projectReuse(h.service.snapshot()); assert.equal(p.cohorts.length, 2);
  for (const c of p.cohorts) { assert.equal(c.independence.unknown, 1); assert.equal(c.establishedUsefulExternalTasks, 0); assert.equal(c.costs.unknownCount, 1); assert.deepEqual(c.costs.knownUnitsByCurrency, {}); assert.equal(c.settledPayment.status, 'unestablished'); }
  assert.equal(p.actualValidationCost.unknownCount, 1);
});

test('independent label alone and fixture attestations never establish independent demand', () => {
  const h = prepared(); const o = observation({ relationship: 'independent', purpose: 'external_task' }); observe(h, o); ok(attest(h, o));
  const c = projectReuse(h.service.snapshot()).cohorts[0]; assert.equal(c.establishedUsefulExternalTasks, 0); assert.equal(c.independence.unknown, 1);
});

test('trusted evidence port can bind useful external outcome; settlement remains disjoint (host simulation)', () => {
  const h = prepared({ mode: 'trusted_runner' }); const o = observation({ relationship: 'independent', purpose: 'external_task' }); observe(h, o);
  assert.equal(projectReuse(h.service.snapshot()).cohorts[0].establishedUsefulExternalTasks, 0);
  const body = { observationId: o.id, observationDigest: digest(o), evidence: { ref: 'fixture:source', revision: 'fixture:1' }, outcome: 'useful', independence: 'established' };
  assert.equal(h.command('beneficiary', 'attest', body).code, 'forbidden');
  assert.equal(attest(h, o, { observationDigest: digest('forged') }).code, 'stale_attestation');
  ok(attest(h, o));
  const c = projectReuse(h.service.snapshot()).cohorts[0]; assert.equal(c.establishedUsefulExternalTasks, 1); assert.equal(c.settledPayment.status, 'unestablished');
  assert.equal(attest(h, o, { outcome: 'failed' }).code, 'attestation_conflict');
});

test('a fixture observation cannot add paid/wallet fields to gain independence', () => {
  const h = prepared(); assert.equal(h.command('beneficiary', 'observe', { ...observation(), wallet: '0xnotidentity', paid: true }).code, 'unknown_field:$');
});

test('later task must be distinct, after acceptance and bound to the exact capability revision', () => {
  const h = prepared();
  for (const change of [{ taskId: candidate().taskId }, { occurredAt: '2026-09-26T12:00:00.000Z' }, { occurredAt: '2026-09-27T12:00:00.000Z' }]) assert.equal(h.command('beneficiary', 'observe', observation(change)).code, 'not_later_task');
  assert.equal(h.command('beneficiary', 'observe', observation({ capability: { ...candidate().capability, revision: 'wrong' } })).code, 'reuse_binding');
  assert.equal(h.command('beneficiary', 'observe', observation({ cohort: { ...observation().cohort, arm: 'baseline' } })).code, 'baseline_is_not_reuse');
});

test('duplicate and renamed repeated reuse cannot enlarge the denominator; correction replaces rather than adds', () => {
  const h = prepared(); observe(h); assert.equal(ok(h.command('beneficiary', 'observe', observation())).code, 'duplicate_observation');
  assert.equal(h.command('beneficiary', 'observe', observation({ id: 'reuse:rename' })).code, 'repeated_task');
  const corrected = observation({ id: 'reuse:correction', outcome: 'failed', supersedes: 'reuse:b' }); observe(h, corrected);
  const c = projectReuse(h.service.snapshot()).cohorts[0]; assert.equal(c.distinctLaterTasks, 1); assert.equal(c.declaredUsefulTasks, 0);
  assert.equal(h.service.snapshot().observations['reuse:b'].supersededBy, corrected.id);
  assert.equal(attest(h).code, 'stale_attestation');
  observe(h, observation({ id: 'reuse:distinct', taskId: 'task:later-c' })); assert.equal(projectReuse(h.service.snapshot()).cohorts[0].distinctLaterTasks, 2);
});

test('retractions and revoked dependencies remove current reuse projection but preserve historical observations', () => {
  const h = prepared(); observe(h);
  ok(h.command('beneficiary', 'retractObservation', { observationId: 'reuse:b', reason: 'Bad outcome source', evidence: { ref: 'fixture:correction', revision: 'fixture:2' } }));
  assert.equal(projectReuse(h.service.snapshot()).cohorts.length, 0);
  observe(h, observation({ id: 'reuse:new', taskId: 'task:new' }));
  ok(h.command('operator', 'invalidate', { scope: 'scope:demo', target: 'candidate', candidateId: 'candidate:a', receiptId: null, dependency: null, reason: 'Correction', evidence: { ref: 'fixture:correction', revision: 'fixture:2' } }));
  const p = projectReuse(h.service.snapshot()); assert.equal(p.cohorts.length, 0); assert.equal(p.excluded.length, 1); assert.equal(Object.keys(h.service.snapshot().observations).length, 2);
});

test('other environments remain separate and do not silently extend verification coverage', () => {
  const h = prepared(); observe(h); observe(h, observation({ id: 'reuse:other-environment', taskId: 'task:other-env', environmentDigest: digest('other-env') }));
  const p = projectReuse(h.service.snapshot()); assert.equal(p.cohorts.length, 2);
  assert.deepEqual(p.cohorts.map(c => c.observedEnvironmentCoveredByVerification).sort(), [false, true]);
});

test('exact integer costs keep currencies separate without invented token estimates', () => {
  const h = prepared(); observe(h, observation({ cost: { currency: 'USD_MICROS', units: '999999999999999999999999999999' } }));
  observe(h, observation({ id: 'reuse:c', taskId: 'task:c', cost: { currency: 'USD_MICROS', units: '1' } }));
  observe(h, observation({ id: 'reuse:d', taskId: 'task:d', cost: { currency: 'USDC_ATOMIC', units: '7' } }));
  const c = projectReuse(h.service.snapshot()).cohorts[0]; assert.equal(c.costs.knownUnitsByCurrency.USD_MICROS, '1000000000000000000000000000000'); assert.equal(c.costs.knownUnitsByCurrency.USDC_ATOMIC, '7');
  assert.equal(h.command('beneficiary', 'observe', observation({ id: 'reuse:e', taskId: 'task:e', cost: { currency: 'USD_MICROS', units: 0.1 } })).ok, false);
});

test('frozen no-network denominator compares matching rows and leaves missing effort/cost unknown', () => {
  const h = prepared(); observe(h);
  const report = compareCohorts(h.service.snapshot(), manifest(), [baseline()]);
  assert.equal(report.status, 'matching_complete'); assert.equal(report.arms.reuse_only.successRate, 1); assert.equal(report.arms.baseline.successRate, 0);
  assert.equal(report.comparison.reuse_only.declaredSuccessRateDelta, 1); assert.equal(report.comparison.reuse_only.declaredEffortDeltaMs, null); assert.equal(report.causalSavingsEstablished, false);
});

for (const [field, wrong] of [['holdoutRevision', 'fixture:wrong'], ['taskClass', 'class:wrong'], ['metricVersion', 'metric:wrong'], ['experimentId', 'experiment:wrong']]) test(`cohort ${field} mismatch refuses comparison`, () => {
  const h = prepared(); observe(h); const b = baseline(); b.cohort[field] = wrong;
  const p = compareCohorts(h.service.snapshot(), manifest(), [b]); assert.equal(p.status, 'incomparable'); assert.equal(p.comparison, null); assert.equal(p.arms.reuse_only.successRate, null);
});

for (const change of [{ capability: { ...candidate().capability, revision: 'wrong' } }, { environmentDigest: digest('wrong') }, { relationship: 'independent' }, { purpose: 'sponsored_evaluation' }]) test(`incompatible cohort binding ${Object.keys(change)[0]} has no pooled denominator`, () => {
  const h = prepared(); observe(h); const p = compareCohorts(h.service.snapshot(), manifest(), [{ ...baseline(), ...change }]); assert.equal(p.status, 'incomparable'); assert.equal(p.comparison, null);
});

test('missing, duplicate, extra holdout cases and reused task IDs never shrink denominator to a favorable intersection', () => {
  const h = prepared(); observe(h);
  for (const rows of [[], [baseline(), baseline()], [{ ...baseline(), taskId: observation().taskId }], [{ ...baseline(), cohort: { ...baseline().cohort, caseId: 'case:unexpected' } }]]) {
    const p = compareCohorts(h.service.snapshot(), manifest(), rows); assert.equal(p.status, 'incomparable'); assert.equal(p.comparison, null);
  }
  const p = compareCohorts(h.service.snapshot(), { ...manifest(), cases: [...manifest().cases, { id: 'case:missing', taskInputDigest: digest('missing-case') }] }, [baseline()]); assert.equal(p.denominator, 2); assert.equal(p.status, 'incomparable');
});

test('separate contribution and reuse-only arms with unknown outcomes keep unknown success rates', () => {
  const h = prepared(); observe(h);
  observe(h, observation({ id: 'reuse:contribution', taskId: 'task:contribution', outcome: 'unknown', cohort: { ...observation().cohort, arm: 'contribution' } }));
  const report = compareCohorts(h.service.snapshot(), { ...manifest(), arms: ['baseline', 'reuse_only', 'contribution'] }, [baseline()]);
  assert.equal(report.status, 'matching_complete'); assert.equal(report.arms.contribution.successRate, null); assert.equal(report.comparison.contribution.declaredSuccessRateDelta, null);
});

test('evidence join is preserved byte-for-byte in canonical content; reuse cannot alter accounting or upgrade flags', () => {
  const h = prepared(); observe(h);
  // Minimal contract fixture, not an actual merchant result or settlement.
  const join = { schema: 'pilot.three-site-settlement-join.result.v2', money: { authority: 'unverified_record_projection', combinedTotalForbidden: true, recognizedRevenueAtomic: '0', recordAmountsByClassAtomic: { validation: '200000' } }, claims: { settledPayment: false, organicRepeatDemand: false, buyerAttestedUsefulness: false } };
  const original = structuredClone(join); const joined = attachEvidenceJoin(projectReuse(h.service.snapshot()), join);
  assert.deepEqual(joined.originalJoin, original); assert.equal(joined.originalJoinDigest, digest(original)); assert.equal(joined.accountingModified, false);
  join.money.recognizedRevenueAtomic = '900'; assert.deepEqual(joined.originalJoin, original);
  assert.throws(() => attachEvidenceJoin(joined.reuse, { ...original, claims: { ...original.claims, settledPayment: true } }), /evidence_join_authority_mismatch/);
});

test('accepted contributions with zero subsequent reuse remain in the inventory denominator', () => {
  const h = prepared(); h.accept(candidate('never-used')); observe(h);
  const p = projectReuse(h.service.snapshot()); assert.equal(p.acceptedContributionInventory.length, 2);
  assert.equal(p.acceptedContributionInventory.find(c => c.candidateId === 'candidate:never-used').distinctLaterTasks, 0);
});

test('declared owner/affiliation cannot be silently overridden into independent evidence', () => {
  const h = prepared({ mode: 'trusted_runner' }); observe(h);
  assert.equal(attest(h).code, 'relationship_evidence_conflict');
});

test('same case name with a different task input digest cannot pass the frozen denominator', () => {
  const h = prepared(); observe(h);
  const result = compareCohorts(h.service.snapshot(), manifest(), [{ ...baseline(), taskInputDigest: digest('easier-input') }]);
  assert.equal(result.status, 'incomparable'); assert.equal(result.comparison, null);
});

test('timed-out attempts and unmetered reviews remain unknown actual validation costs', () => {
  const h = harness(); ok(h.command('contributor', 'submit', candidate())); ok(h.command('operator', 'assign', {}));
  h.advance(10000); ok(h.command('operator', 'expire', {}));
  const cost = projectReuse(h.service.snapshot()).actualValidationCost;
  assert.equal(cost.runnerAttempts, 1); assert.equal(cost.unmeteredAttempts, 1); assert.equal(cost.unknownCount, 1); assert.equal(cost.complete, false);
  const reviewed = harness({ policy: { risk: 'high' } }); const a = reviewed.accept();
  ok(reviewed.command('reviewer', 'review', { candidateId: a.candidate.id, receiptId: a.receipt.id, decision: 'accept', evidence: { ref: 'fixture:review', revision: 'fixture:1' } }));
  const reviewCost = projectReuse(reviewed.service.snapshot()).actualValidationCost;
  assert.equal(reviewCost.unknownCount, 2); assert.equal(reviewCost.reviewDecisions, 1);
});
