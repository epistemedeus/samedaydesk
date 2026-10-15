// AE22 traffic -> paid continuity (Growth half). Joins stage-1 discovery lines (SDS J9-LOG, schema samedaydesk.discovery-log.v1,
// or J1 emitter discovery events carrying journeyDigest) to gateway paid rows (quote/mandate/capture carrying journeyDigest,
// x402 patch patches/ae22-x402/0001). Output rows use the RL JOIN-SPEC key names (pilot codex/ae21-journey-economics@93eb82eb).
// No join is reported as 'unobserved', never inferred from time, IP or payer proximity.
const DIGEST = /^hmac-sha256:[0-9a-f]{64}$/;
const PAID_STAGES = ['quote', 'mandate', 'capture'];

export function continuity(discoveries, paid) {
  const errors = [];
  const byDigest = new Map();
  for (const d of discoveries) {
    if (d.callerClass === 'owner-qa') continue; // QA never joins to revenue
    if (!d.journeyDigest) continue;
    if (!DIGEST.test(d.journeyDigest)) { errors.push('JOURNEY-DIGEST-INVALID'); continue; }
    if (!byDigest.has(d.journeyDigest)) byDigest.set(d.journeyDigest, d); // earliest wins; later visits are not new discoveries
  }
  const rows = [];
  const journeys = new Map();
  for (const p of paid) {
    if (!PAID_STAGES.includes(p.stage)) { errors.push(`PAID-STAGE-UNKNOWN:${p.stage}`); continue; }
    const key = p.journeyDigest && DIGEST.test(p.journeyDigest) ? p.journeyDigest : `none:${p.quoteId ?? p.captureTx ?? rows.length}`;
    const j = journeys.get(key) ?? { journeyDigest: p.journeyDigest ?? null, requesterIds: new Set(), stages: {} };
    if (j.stages[p.stage] && JSON.stringify(j.stages[p.stage]) !== JSON.stringify(p)) errors.push(`PAID-DUPLICATE-CONFLICT:${p.stage}`);
    j.stages[p.stage] = p; if (p.requesterId) j.requesterIds.add(p.requesterId);
    journeys.set(key, j);
  }
  for (const j of journeys.values()) {
    const d = j.journeyDigest ? byDigest.get(j.journeyDigest) : undefined;
    if (j.requesterIds.size > 1) errors.push('JOIN-REQUESTER-MISMATCH');
    const qids = new Set(Object.values(j.stages).map((s) => s.quoteId).filter(Boolean));
    if (qids.size > 1) errors.push('QUOTE-ID-MISMATCH');
    rows.push({
      journeyDigest: j.journeyDigest, requesterId: [...j.requesterIds][0] ?? null,
      continuity: d ? 'joined' : 'unobserved',
      discoveryRef: d ? d.discoveryRef ?? null : 'unobserved', discoveryReferrer: d ? d.discoveryReferrer ?? null : 'unobserved',
      declaredSource: d ? d.declaredSource ?? null : 'unobserved',
      quoteId: j.stages.quote?.quoteId ?? j.stages.capture?.quoteId ?? null, mandateId: j.stages.mandate?.mandateId ?? null,
      captureTx: j.stages.capture?.captureTx ?? null,
    });
  }
  return { rows, errors };
}
