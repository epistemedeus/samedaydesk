// Read the owning ledgers in place. Opportunity obligations are never cloned
// into earned_work_obligations. Cancellation/retirement of a task cannot erase
// an already accepted obligation.
const fail = (code = 'disposition_hold') => { throw Object.assign(new Error(code), {http: 409, codeName: code}); };
function decimalUsdcAtomic(value) {
  if(typeof value!=='string'||!/^\d+(?:\.\d{1,6})?$/.test(value)) fail();
  const [whole,part='']=value.split('.');return (BigInt(whole)*1000000n+BigInt(part.padEnd(6,'0'))).toString();
}
export async function storedDebt(tx, obligationId, {readAcceptedSource} = {}) {
  const [earned, opportunity] = await Promise.all([
    tx.query(`SELECT to_jsonb(o) AS obligation, to_jsonb(t) AS terms, to_jsonb(r) AS reservation,
      to_jsonb(s) AS submission, to_jsonb(v) AS verdict
      FROM earned_work_obligations o
      JOIN earned_work_terms t ON t.task_id=o.task_id AND t.version=o.terms_version
      JOIN earned_work_reservations r ON r.id=o.reservation_id
      JOIN earned_work_submissions s ON s.id=o.submission_id
      JOIN earned_work_verdicts v ON v.id=o.verdict_id WHERE o.id=$1`, [obligationId]),
    tx.query(`SELECT to_jsonb(o) AS obligation, to_jsonb(c) AS claim, to_jsonb(r) AS round,
      to_jsonb(f) AS offer, to_jsonb(s) AS submission, to_jsonb(p) AS principal,
      o.reward_atomic::text AS obligation_amount, c.reward_atomic::text AS claim_amount, f.reward_atomic::text AS offer_amount
      FROM opportunity_obligations o JOIN opportunity_claims c ON c.id=o.claim_id AND c.round_id=o.round_id
      JOIN opportunity_rounds r ON r.id=o.round_id JOIN opportunity_offers f ON f.id=c.offer_id AND f.round_id=r.id
      JOIN opportunity_submissions s ON s.claim_id=c.id AND s.round_id=r.id
      JOIN earned_work_contributor_tokens p ON p.id=c.contributor_token_id WHERE o.id=$1`, [obligationId]),
  ]);
  if (earned.rows.length + opportunity.rows.length !== 1) fail();
  if (earned.rows[0]) {
    const {obligation: o, terms: t, reservation: r, submission: s, verdict: v} = earned.rows[0];
    if (o.payout_state !== 'owed' || o.reward_asset !== 'USDC' || r.status !== 'completed' || v.outcome !== 'pass' ||
        [t.reward_amount, o.reward_amount].some(x => x !== o.reward_amount) || t.reward_asset !== o.reward_asset || t.reward_network !== o.reward_network ||
        r.task_id !== o.task_id || s.task_id !== o.task_id || s.reservation_id !== r.id || v.task_id !== o.task_id || v.reservation_id !== r.id || v.submission_id !== s.id ||
        [r.terms_version, s.terms_version, v.terms_version].some(x => x !== o.terms_version) || v.artifact_digest_sha256 !== s.artifact_digest_sha256 ||
        r.contributor_public_id !== o.contributor_public_id) fail();
    return {family: 'earned', obligationId, taskId: o.task_id, claimId: r.id, submissionId: s.id, verdictId: v.id,
      termsVersion: o.terms_version, amountAtomic: decimalUsdcAtomic(o.reward_amount), network: ['base','eip155:8453'].includes(o.reward_network)?'eip155:8453':o.reward_network, recipient: o.payout_destination,
      artifactDigestSha256: s.artifact_digest_sha256, createdAt: o.created_at, payoutState: o.payout_state};
  }
  const {obligation: o, claim: c, round: r, offer: f, submission: s, principal: p} = opportunity.rows[0];
  const taskId = `${r.round_key}:${f.offer_key}`;
  if (typeof readAcceptedSource !== 'function') fail('discharge_consumer_unbound');
  // This is the existing installed adapter, which verifies canonical terms,
  // frozen submission and authenticated correspondence verdict history.
  const accepted = await readAcceptedSource({taskId, reservationId: c.id});
  const aggregate = accepted?.aggregate;
  const a = aggregate?.obligation, v = aggregate?.verdict;
  if (!a || a.id !== o.id || a.payoutState !== 'owed' || a.verdictId !== v?.id || v.outcome !== 'pass' ||
      a.taskId !== taskId || a.reservationId !== c.id || a.submissionId !== s.id || a.termsVersion !== o.terms_version ||
      aggregate.submission?.artifact.digestSha256 !== s.artifact_digest_sha256 ||
      c.status !== 'owed' || o.payout_state !== 'owed' || o.paid !== false || o.transfer !== null || o.settled !== false || o.revenue !== false ||
      o.settlement_key !== c.settlement_key || o.terms_version !== c.terms_version || c.terms_version !== r.terms_version || s.terms_version !== r.terms_version ||
      opportunity.rows[0].obligation_amount !== opportunity.rows[0].claim_amount || opportunity.rows[0].claim_amount !== opportunity.rows[0].offer_amount ||
      o.asset !== 'USDC' || o.asset !== r.asset || o.network !== r.network || o.chain_id !== 8453 || r.chain_id !== 8453 || r.atomic_scale !== 6 ||
      !['base', 'eip155:8453'].includes(o.network)) fail();
  return {family: 'opportunity', obligationId, taskId, claimId: c.id, submissionId: s.id, verdictId: v.id,
    roundId: r.id, termsVersion: o.terms_version, amountAtomic: opportunity.rows[0].obligation_amount, network: 'eip155:8453',
    recipient: p.payout_destination, artifactDigestSha256: s.artifact_digest_sha256, createdAt: o.created_at, payoutState: o.payout_state};
}
export function matchDebt(source, receipt) {
  for (const key of ['obligationId', 'taskId', 'claimId', 'submissionId', 'verdictId', 'termsVersion', 'amountAtomic', 'network', 'artifactDigestSha256']) {
    if (source[key] !== receipt[key]) fail();
  }
  if (source.roundId && source.roundId !== receipt.roundId) fail();
  // Old opportunity destinations can live only in Root's verified destination
  // record. A present stored destination must agree; no retrospective signup.
  if (source.recipient && source.recipient.toLowerCase() !== receipt.recipient) fail();
  if (Date.parse(receipt.blockTimestamp) < Date.parse(source.createdAt)) fail();
}
