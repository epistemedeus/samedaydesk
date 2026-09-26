import { BaselineTrial, CohortManifest, clone, digest, jsonBounded, requireThat as need, sameRef, schemaId, validate } from './contracts.mjs';

function costs(rows) {
  const byCurrency = {}; let unknown = 0;
  for (const r of rows) {
    if (r.cost === null) { unknown++; continue; }
    byCurrency[r.cost.currency] = (BigInt(byCurrency[r.cost.currency] ?? '0') + BigInt(r.cost.units)).toString();
  }
  return { knownUnitsByCurrency: byCurrency, unknownCount: unknown, complete: unknown === 0 };
}
function activeObservations(snapshot) {
  return Object.values(snapshot.observations).filter(o => !o.supersededBy && !snapshot.retractedObservations[o.observation.id]);
}
/** Takes only a host-owned snapshot. A JSON copy is an offline projection, never authority. */
export function projectReuse(snapshot) {
  const groups = new Map(); const excluded = [];
  for (const row of activeObservations(snapshot)) {
    const o = row.observation; const c = snapshot.candidates[o.candidateId];
    if (!c?.active || c.acceptance !== 'accepted') { excluded.push({ observationId: o.id, reason: 'candidate_invalidated' }); continue; }
    const key = digest({ capability: o.capability, environmentDigest: o.environmentDigest, taskClass: o.cohort.taskClass, purpose: o.purpose, relationship: o.relationship, mode: row.mode });
    if (!groups.has(key)) groups.set(key, { key, capability: clone(o.capability), environmentDigest: o.environmentDigest, taskClass: o.cohort.taskClass, purpose: o.purpose, declaredRelationship: o.relationship, mode: row.mode, rows: [] });
    groups.get(key).rows.push(row);
  }
  const cohorts = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map(({ rows, ...group }) => {
    const useful = rows.filter(r => r.observation.outcome === 'useful');
    const authenticated = rows.filter(r => {
      const a = snapshot.attestations[r.observation.id];
      return a && a.mode === 'trusted_runner' && a.attestation.observationDigest === r.digest;
    });
    const established = authenticated.filter(r => snapshot.attestations[r.observation.id].attestation.independence === 'established');
    const usefulExternal = authenticated.filter(r => r.observation.purpose === 'external_task' && r.observation.relationship === 'independent' && r.observation.outcome === 'useful' && snapshot.attestations[r.observation.id].attestation.outcome === 'useful' && snapshot.attestations[r.observation.id].attestation.independence === 'established');
    const byContribution = {};
    for (const r of rows) {
      const id = r.observation.candidateId;
      byContribution[id] ??= { laterTasks: 0, declaredUsefulTasks: 0, establishedUsefulExternalTasks: 0 };
      byContribution[id].laterTasks++;
      if (r.observation.outcome === 'useful') byContribution[id].declaredUsefulTasks++;
      if (usefulExternal.includes(r)) byContribution[id].establishedUsefulExternalTasks++;
    }
    const evidenceRefs = rows.map(r => ({ observationId: r.observation.id, digest: r.digest, taskId: r.observation.taskId, source: r.observation.outcomeSource }));
    const efforts = rows.map(r => r.observation.effortMs);
    const timeToReuseMs = rows.map(r => Date.parse(r.observation.occurredAt) - Date.parse(snapshot.candidates[r.observation.candidateId].acceptedAt));
    return { ...group, distinctLaterTasks: rows.length, declaredUsefulTasks: useful.length, establishedUsefulExternalTasks: usefulExternal.length,
      independence: { established: established.length, notIndependent: authenticated.filter(r => snapshot.attestations[r.observation.id].attestation.independence === 'not_independent').length, unknown: rows.length - authenticated.filter(r => snapshot.attestations[r.observation.id].attestation.independence !== 'unknown').length },
      observedEnvironmentCoveredByVerification: rows.every(r => snapshot.receipts[snapshot.candidates[r.observation.candidateId].receiptId]?.receipt.environmentDigest === r.observation.environmentDigest),
      effort: { knownMs: efforts.reduce((n, x) => n + (x ?? 0), 0), unknownCount: efforts.filter(x => x === null).length },
      costs: costs(rows.map(r => r.observation)), timeToReuseMs, byContribution, evidenceRefs,
      settledPayment: { status: 'unestablished', reason: 'reuse_is_not_settlement_evidence' },
    };
  });
  const acceptedContributionInventory = Object.values(snapshot.candidates).filter(c => c.active && c.acceptance === 'accepted').map(c => {
    const matching = activeObservations(snapshot).filter(r => r.observation.candidateId === c.candidate.id);
    return { candidateId: c.candidate.id, capability: clone(c.candidate.capability), verifiedEnvironmentDigest: snapshot.receipts[c.receiptId].receipt.environmentDigest, acceptedAt: c.acceptedAt,
      distinctLaterTasks: matching.length, declaredUsefulTasks: matching.filter(r => r.observation.outcome === 'useful').length };
  });
  const receipts = Object.values(snapshot.receipts);
  const runnerAttempts = Object.values(snapshot.candidates).reduce((n, c) => n + c.attempts, 0);
  const unmeteredAttempts = runnerAttempts - receipts.length;
  const actualValidationCost = { ...costs([
    ...receipts.map(r => ({ cost: r.receipt.usage.cost })),
    ...Array.from({ length: unmeteredAttempts + snapshot.charged.reviews }, () => ({ cost: null })),
  ]), runnerAttempts, unmeteredAttempts, reviewDecisions: snapshot.charged.reviews };
  return { schema: schemaId('reuse_projection'), snapshotRevision: snapshot.revision, mode: snapshot.mode, cohorts, excluded, acceptedContributionInventory,
    validationCapacityCharged: clone(snapshot.charged), actualValidationCost,
    note: 'Declared relationships, wallets, downloaded artifacts and fixture attestations do not prove independent demand. Reserved capacity is not measured spend.' };
}

/**
 * Preserve the pinned evidence join unchanged beside new reuse facts. No amount
 * parsing/reconciliation here. A caller-supplied result is still unverified JSON.
 */
export function attachEvidenceJoin(reuse, rawJoin) {
  const join = jsonBounded(rawJoin, 256000);
  need(join.schema === 'pilot.three-site-settlement-join.result.v2', 'unsupported_evidence_join');
  need(join.money?.authority === 'unverified_record_projection' && join.money?.combinedTotalForbidden === true, 'evidence_join_authority_mismatch');
  need(join.claims?.settledPayment === false && join.claims?.organicRepeatDemand === false && join.claims?.buyerAttestedUsefulness === false, 'evidence_join_authority_mismatch', 'Use the pinned join semantics; a caller-written true flag is not an authority upgrade.');
  return { schema: schemaId('reuse_evidence_join'), reuse: clone(reuse), originalJoin: join, originalJoinDigest: digest(join), sourceAuthority: 'unverified_record_projection', accountingModified: false };
}

/**
 * A frozen manifest defines the full holdout denominator BEFORE collecting trials.
 * Baseline measurements are supplied separately because no-network baseline is not reuse.
 * This offline comparison reports declared measurements, never causal/production savings.
 */
export function compareCohorts(snapshot, rawManifest, rawBaseline) {
  const manifest = jsonBounded(rawManifest); const baseline = jsonBounded(rawBaseline, 256000);
  validate(CohortManifest, manifest);
  need(manifest.schema === schemaId('cohort_manifest') && typeof manifest.baselineSource?.revision === 'string' && typeof manifest.baselineSource?.ref === 'string', 'invalid_cohort_manifest');
  const caseIds = manifest.cases.map(c => c.id);
  need(caseIds.length > 0 && new Set(caseIds).size === caseIds.length, 'invalid_cohort_denominator');
  need(Array.isArray(manifest.arms) && manifest.arms.includes('baseline') && manifest.arms.length >= 2 && new Set(manifest.arms).size === manifest.arms.length && manifest.arms.every(x => ['baseline', 'reuse_only', 'contribution'].includes(x)), 'invalid_cohort_arms');
  need(Array.isArray(baseline) && baseline.length <= 256, 'baseline_bounds');
  const rows = activeObservations(snapshot).filter(r => snapshot.candidates[r.observation.candidateId]?.active && r.observation.cohort.experimentId === manifest.experimentId).map(r => ({ ...r.observation, evidenceLevel: 'admitted_declaration' }));
  const mismatches = []; const seen = new Set(); const tasks = new Set();
  for (const b of baseline) {
    validate(BaselineTrial, b);
    need(b.cohort?.arm === 'baseline' && typeof b.id === 'string' && typeof b.taskId === 'string' && typeof b.outcomeSource?.ref === 'string' && typeof b.outcomeSource?.revision === 'string', 'invalid_baseline');
    need(['useful', 'not_useful', 'failed', 'unknown'].includes(b.outcome) && (b.effortMs === null || Number.isSafeInteger(b.effortMs) && b.effortMs >= 0), 'invalid_baseline_metric');
    need(b.cost === null || typeof b.cost?.currency === 'string' && typeof b.cost?.units === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(b.cost.units), 'invalid_baseline_cost');
    rows.push({ ...b, evidenceLevel: 'supplied_baseline_declaration' });
  }
  const byArm = Object.fromEntries(manifest.arms.map(a => [a, []]));
  for (const r of rows) {
    const match = r.scope === manifest.scope && r.capability && sameRef(r.capability, manifest.capability) && r.environmentDigest === manifest.environmentDigest && r.purpose === manifest.purpose && r.relationship === manifest.relationship && ['experimentId', 'holdoutRevision', 'taskClass', 'metricVersion'].every(k => r.cohort?.[k] === manifest[k]) && manifest.arms.includes(r.cohort?.arm) && manifest.cases.some(c => c.id === r.cohort?.caseId && c.taskInputDigest === r.taskInputDigest);
    if (!match) { mismatches.push({ id: r.id, reason: 'incompatible_cohort' }); continue; }
    const key = `${r.cohort.arm}|${r.cohort.caseId}`;
    if (seen.has(key) || tasks.has(r.taskId)) { mismatches.push({ id: r.id, reason: 'duplicate_trial_or_task' }); continue; }
    seen.add(key); tasks.add(r.taskId); byArm[r.cohort.arm].push(r);
  }
  const complete = mismatches.length === 0 && manifest.arms.every(a => caseIds.every(c => seen.has(`${a}|${c}`)));
  const arms = Object.fromEntries(Object.entries(byArm).map(([arm, rs]) => [arm, {
    expected: caseIds.length, observed: rs.length, knownOutcomeCount: rs.filter(r => r.outcome !== 'unknown').length,
    declaredUseful: rs.filter(r => r.outcome === 'useful').length,
    successRate: complete && rs.every(r => r.outcome !== 'unknown') ? rs.filter(r => r.outcome === 'useful').length / caseIds.length : null,
    meanEffortMs: complete && rs.every(r => r.effortMs !== null) ? rs.reduce((n, r) => n + r.effortMs, 0) / rs.length : null,
    costs: costs(rs), evidenceRefs: rs.map(r => ({ id: r.id, source: r.outcomeSource, evidenceLevel: r.evidenceLevel })),
  }]));
  const comparison = complete ? Object.fromEntries(manifest.arms.filter(a => a !== 'baseline').map(a => [a, {
    declaredSuccessRateDelta: arms[a].successRate === null || arms.baseline.successRate === null ? null : arms[a].successRate - arms.baseline.successRate,
    declaredEffortDeltaMs: arms[a].meanEffortMs === null || arms.baseline.meanEffortMs === null ? null : arms[a].meanEffortMs - arms.baseline.meanEffortMs,
  }])) : null;
  return { schema: schemaId('cohort_projection'), manifestDigest: digest(manifest), status: complete ? 'matching_complete' : 'incomparable', denominator: caseIds.length, arms, mismatches, comparison, causalSavingsEstablished: false, note: 'Compare only identical frozen holdout input digests, task class, capability revision, environment, purpose, relationship and metric version. Missing costs stay unknown; fixture results are not demand.' };
}
