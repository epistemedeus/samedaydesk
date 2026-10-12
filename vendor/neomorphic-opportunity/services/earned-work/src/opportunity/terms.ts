import { hashTermsVersion } from "../terms-version.js";

export const OPPORTUNITY_TERMS_SCHEMA = "neomorphic.opportunity-round.terms.v1";
export const OPPORTUNITY_SCHEMA_VERSION = 1;

export type OfferTerms = {
  offerKey: string;
  title: string;
  summary: string;
  slotCount: number;
  ownerReservedSlots?: number;
  rewardAtomic: number;
  maxEffortSeconds: number;
  publicClaimable: boolean;
  acceptance: string;
  evidenceKind: "discovery_trace" | "workflow_witness";
  rank: number;
};

export type AlternativeTerms = {
  alternativeKey: string;
  rank: number;
  title: string;
  summary: string;
  funded: false;
  paidSlot: false;
};

export type RoundTermsInput = {
  roundKey: string;
  principalCapAtomic: number;
  atomicScale: number;
  asset: string;
  network: string;
  chainId: number;
  submissionDeadline: string;
  claimTtlSeconds: number;
  reviewWithinDays: number;
  maxClarifications: number;
  maxEvidenceBytes: number;
  transferFeeCap: { amountAtomic: string; asset: string; note: string };
  offers: OfferTerms[];
  alternatives: AlternativeTerms[];
};

export function canonicalRoundTerms(input: RoundTermsInput) {
  const offers = [...input.offers]
    .map((offer) => ({
      acceptance: offer.acceptance,
      evidenceKind: offer.evidenceKind,
      maxEffortSeconds: offer.maxEffortSeconds,
      offerKey: offer.offerKey,
      publicClaimable: offer.publicClaimable,
      rank: offer.rank,
      rewardAtomic: offer.rewardAtomic,
      slotCount: offer.slotCount,
      ownerReservedSlots: offer.ownerReservedSlots ?? 0,
      summary: offer.summary,
      title: offer.title,
    }))
    .sort((a, b) => (a.offerKey < b.offerKey ? -1 : a.offerKey > b.offerKey ? 1 : 0));
  const alternatives = [...input.alternatives]
    .map((item) => ({
      alternativeKey: item.alternativeKey,
      funded: false as const,
      paidSlot: false as const,
      rank: item.rank,
      summary: item.summary,
      title: item.title,
    }))
    .sort((a, b) => a.rank - b.rank || (a.alternativeKey < b.alternativeKey ? -1 : 1));
  return {
    schema: OPPORTUNITY_TERMS_SCHEMA,
    schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
    roundKey: input.roundKey,
    principalCapAtomic: input.principalCapAtomic,
    atomicScale: input.atomicScale,
    asset: input.asset,
    network: input.network,
    chainId: input.chainId,
    submissionDeadline: input.submissionDeadline,
    claimTtlSeconds: input.claimTtlSeconds,
    reviewWithinDays: input.reviewWithinDays,
    maxClarifications: input.maxClarifications,
    maxEvidenceBytes: input.maxEvidenceBytes,
    transferFeeCap: {
      amountAtomic: input.transferFeeCap.amountAtomic,
      asset: input.transferFeeCap.asset,
      note: input.transferFeeCap.note,
    },
    offers,
    alternatives,
    rules: {
      owedIsNotPaid: true,
      waitlistIsNotAPaidSlot: true,
      unknownIsNotReconstructed: true,
      fixtureIsNotProduction: true,
      payoutAdapter: "null_nonpaying_v0",
      rewardDoesNotDependOnEndorsement: true,
      noArtifactFetch: true,
    },
  };
}

export function hashRoundTerms(input: RoundTermsInput): string {
  return hashTermsVersion(canonicalRoundTerms(input));
}
