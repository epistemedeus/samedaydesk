import { CLOCK_ISO, EARNED_WORK, NULL_PAYOUT_ADAPTER, REWARD_HYPOTHESIS } from "./constants.mjs";
import { hashTerms } from "./hash-terms.mjs";
export { publicTaskView, publicCatalog, publicBrowserProjection } from "./public-view.mjs";

const MEDIA = ["application/json", "text/plain"];

function terms({ summary, ttl = 86400, bytes = 65536, slots = 1 }) {
  return {
    summary,
    reward: { ...REWARD_HYPOTHESIS },
    claimTtlSeconds: ttl,
    maxArtifactBytes: bytes,
    allowedMediaTypes: [...MEDIA],
    slotLimit: slots,
  };
}

function stamp(now, termsDoc) {
  const version = hashTerms(termsDoc);
  return { ...termsDoc, version };
}

/**
 * In-memory S275-shaped fixture seed. Provenance is fixture.
 * Budget stays on the internal record and is stripped from public browse.
 */
export function buildFixtureSeed({ now = CLOCK_ISO } = {}) {
  const openTerms = stamp(now, terms({ summary: "Label a public digest on a bounded fixture note." }));
  const claimedTerms = stamp(now, terms({ summary: "Already reserved to another contributor." }));
  const rejectedTerms = stamp(now, terms({ summary: "Failed digest bound; appeal is the remaining path." }));
  const owedTerms = stamp(now, terms({ summary: "Accepted work. Obligation is owed, not paid." }));
  const unfundedTerms = stamp(now, terms({ summary: "Open copy, no reserve. Not claimable." }));

  const tasks = [
    {
      id: "tsk_open_alpha",
      title: "Label a public fixture digest",
      summary: "Walletless claim of one reserved fixture slot. Artifact metadata only.",
      provenance: "fixture",
      lifecycle: "open",
      fundingState: "reserved",
      payoutState: "none",
      termsVersion: openTerms.version,
      terms: openTerms,
      reward: { ...REWARD_HYPOTHESIS },
      budget: { amount: "1.00", asset: "USDC", network: "base" },
      claimable: true,
      reservation: null,
      submission: null,
      verdict: null,
      obligation: null,
      appeal: null,
      paid: false,
      settled: false,
      transfer: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tsk_claimed_beta",
      title: "Exclusive slot already held",
      summary: "Public status only. A second contributor cannot take this reservation.",
      provenance: "fixture",
      lifecycle: "claimed",
      fundingState: "reserved",
      payoutState: "none",
      termsVersion: claimedTerms.version,
      terms: claimedTerms,
      reward: { ...REWARD_HYPOTHESIS },
      budget: { amount: "1.00", asset: "USDC", network: "base" },
      claimable: false,
      reservation: {
        id: "rsv_claimed_beta",
        taskId: "tsk_claimed_beta",
        termsVersion: claimedTerms.version,
        contributorPublicId: "ctr_other",
        status: "active",
        expiresAt: "2026-09-18T15:00:00.000Z",
        createdAt: now,
      },
      submission: null,
      verdict: null,
      obligation: null,
      appeal: null,
      paid: false,
      settled: false,
      transfer: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tsk_rejected_gamma",
      title: "Failed bound digest",
      summary: "Owner rejected the bound artifact. Contributor may file an appeal. Appeal is not accept.",
      provenance: "fixture",
      lifecycle: "rejected",
      fundingState: "reserved",
      payoutState: "none",
      termsVersion: rejectedTerms.version,
      terms: rejectedTerms,
      reward: { ...REWARD_HYPOTHESIS },
      budget: { amount: "1.00", asset: "USDC", network: "base" },
      claimable: false,
      reservation: {
        id: "rsv_rejected_gamma",
        taskId: "tsk_rejected_gamma",
        termsVersion: rejectedTerms.version,
        contributorPublicId: "ctr_gamma",
        status: "released",
        expiresAt: "2026-09-18T15:00:00.000Z",
        createdAt: now,
      },
      submission: {
        id: "sub_rejected_gamma",
        reservationId: "rsv_rejected_gamma",
        termsVersion: rejectedTerms.version,
        artifact: {
          ref: "fixture://gamma/note.txt",
          digestSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          mediaType: "text/plain",
          bytes: 12,
        },
        createdAt: now,
      },
      verdict: {
        id: "ver_rejected_gamma",
        outcome: "fail",
        reasons: ["digest outside the bound fixture"],
        createdAt: now,
      },
      obligation: null,
      appeal: null,
      paid: false,
      settled: false,
      transfer: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tsk_owed_delta",
      title: "Accepted; obligation owed",
      summary: "Owner accepted. Null/nonpaying adapter records owed, not paid, not settled.",
      provenance: "fixture",
      lifecycle: "accepted",
      fundingState: "released",
      payoutState: "owed",
      termsVersion: owedTerms.version,
      terms: owedTerms,
      reward: { ...REWARD_HYPOTHESIS },
      budget: { amount: "1.00", asset: "USDC", network: "base" },
      claimable: false,
      reservation: {
        id: "rsv_owed_delta",
        taskId: "tsk_owed_delta",
        termsVersion: owedTerms.version,
        contributorPublicId: "ctr_delta",
        status: "completed",
        expiresAt: "2026-09-18T15:00:00.000Z",
        createdAt: now,
      },
      submission: {
        id: "sub_owed_delta",
        reservationId: "rsv_owed_delta",
        termsVersion: owedTerms.version,
        artifact: {
          ref: "fixture://delta/note.txt",
          digestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          mediaType: "text/plain",
          bytes: 16,
        },
        createdAt: now,
      },
      verdict: {
        id: "ver_owed_delta",
        outcome: "pass",
        reasons: ["digest and media bounds"],
        createdAt: now,
      },
      obligation: {
        id: "obl_owed_delta",
        kind: "owed_record",
        adapter: "typed_owed_record_v0",
        payoutState: "owed",
        transfer: null,
        reward: { ...REWARD_HYPOTHESIS },
        contributorPublicId: "ctr_delta",
        payoutDestination: null,
        createdAt: now,
      },
      appeal: null,
      paid: false,
      settled: false,
      transfer: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tsk_unfunded_epsilon",
      title: "Unfunded open copy",
      summary: "Visible on the public list. Not reserved, so not claimable.",
      provenance: "fixture",
      lifecycle: "open",
      fundingState: "unfunded",
      payoutState: "none",
      termsVersion: unfundedTerms.version,
      terms: unfundedTerms,
      reward: { ...REWARD_HYPOTHESIS },
      budget: { amount: "0.00", asset: "USDC", network: "base" },
      claimable: false,
      reservation: null,
      submission: null,
      verdict: null,
      obligation: null,
      appeal: null,
      paid: false,
      settled: false,
      transfer: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    schema: "neomorphic.contributor_desk.fixture_seed.v1",
    provenance: "fixture",
    earnedWork: EARNED_WORK,
    payoutAdapter: NULL_PAYOUT_ADAPTER,
    clock: now,
    walletless: true,
    tasks,
  };
}


