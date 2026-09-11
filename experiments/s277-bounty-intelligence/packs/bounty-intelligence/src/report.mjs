import { SCHEMA_REPORT } from "./constants.mjs";
import { mergePolicy } from "./policy.mjs";
import { rank } from "./rank.mjs";
import { selectOne } from "./select.mjs";
import { compactEvents } from "./events.mjs";
import { interopFromReport } from "./interop.mjs";
import { nowIso } from "./clock.mjs";

export function buildReport({
  ingest,
  policy,
  now,
  experienceLog = [],
  overlays = [],
} = {}) {
  const at = nowIso(now);
  const pol = mergePolicy(policy);
  const records = ingest.records || [];
  const ranked = rank(records, pol, { now: at });
  const selected = selectOne(records, pol, { now: at });
  const events = compactEvents({
    records: ranked.annotated,
    experienceLog,
    now: at,
  });
  const interop = interopFromReport(ranked.annotated, overlays);
  return {
    schema: SCHEMA_REPORT,
    dataLabel: ingest.mode === "live" ? "live-capture" : "fixture",
    generatedAt: at,
    policy: pol,
    adapters: ingest.adapterResults,
    reconcile: ingest.reconcile,
    counts: {
      records: records.length,
      availablePaidJobs: ranked.annotated.filter((r) => r.status.availablePaidJob).length,
      ranked: ranked.ranked.length,
      selected: selected.match ? 1 : 0,
    },
    selected: selected.match
      ? {
          match: true,
          taskId: selected.selected.taskId,
          title: selected.selected.title,
          sourceUrl: selected.selected.sourceUrl,
          adapter: selected.selected.adapter,
          nativeId: selected.selected.nativeId,
          expectedUsefulNetReturn: selected.selected.expectedUsefulNetReturn,
          uncertainty: selected.selected.uncertainty,
          prerequisites: selected.selected.prerequisites,
          why: selected.selected.why,
          claimAuthority: "none",
        }
      : {
          match: false,
          reason: selected.reason,
          hint: selected.hint,
        },
    ranked: ranked.ranked.map((s) => ({
      taskId: s.record.taskId,
      title: s.record.title,
      adapter: s.record.source.adapter,
      nativeId: s.record.source.nativeId,
      url: s.record.source.url,
      expectedUsefulNetReturn: s.expectedUsefulNetReturn,
      uncertainty: s.uncertainty,
      funding: s.record.funding.status,
      claimability: s.record.claimability.state,
      reward: s.record.reward,
      why: s.why,
    })),
    excludedSample: ranked.excluded.slice(0, 20).map((s) => ({
      taskId: s.record.taskId,
      title: s.record.title,
      adapter: s.record.source.adapter,
      exclusionReasons: s.record.status.exclusionReasons,
      availablePaidJob: false,
    })),
    records: ranked.annotated,
    events,
    interop,
    disclaimers: [
      "Not a marketplace. claimAuthority is none. This pack never bids, claims, or pays.",
      "Closed, stale, and unfunded tasks are never ranked as available paid jobs.",
      "Board marketing counts and GitHub reactions are not demand.",
      "Neomorphic /api/bounties.json is a lab schedule, not paid agent jobs.",
      "api.moltbook.com is inaccessible (NXDOMAIN); no listings invented.",
      "Self-reported experience is not verified completion or payout.",
    ],
  };
}
