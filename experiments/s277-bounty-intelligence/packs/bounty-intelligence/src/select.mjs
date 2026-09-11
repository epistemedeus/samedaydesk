import { CLAIM_STATE } from "./constants.mjs";
import { rank } from "./rank.mjs";

export function selectOne(records, policyInput, { now } = {}) {
  const result = rank(records, policyInput, { now });
  const claimable = result.ranked.filter(
    (s) => s.record.claimability?.state === CLAIM_STATE.CLAIMABLE_WITH_PREREQS,
  );
  if (!claimable.length) {
    return {
      match: false,
      reason: "no_genuinely_claimable_paid_job",
      hint:
        "No open, fresh, funded, positive-reward row with a source-stated claim path. Closed, stale, unfunded, lab-schedule, GitHub, and forum-referral rows are excluded. This is not a failure of ranking weights.",
      selected: null,
      rankedClaimable: [],
      rank: result,
    };
  }
  const top = claimable[0];
  return {
    match: true,
    reason: "top_expected_useful_net_return_among_claimable",
    selected: {
      taskId: top.record.taskId,
      title: top.record.title,
      sourceUrl: top.record.source.url,
      nativeId: top.record.source.nativeId,
      adapter: top.record.source.adapter,
      expectedUsefulNetReturn: top.expectedUsefulNetReturn,
      uncertainty: top.uncertainty,
      prerequisites: top.record.claimability.prerequisites,
      why: top.why,
      termsVersion: top.record.termsVersion,
      claimAuthority: "none",
      record: top.record,
    },
    rankedClaimable: claimable.map((s) => ({
      taskId: s.record.taskId,
      title: s.record.title,
      expectedUsefulNetReturn: s.expectedUsefulNetReturn,
      uncertainty: s.uncertainty,
    })),
    rank: result,
  };
}
