import {
  deadlineExpired,
  isDirectory,
  isEscrowTxHash,
  isReferralOrMarketing,
} from "./inspect.ts";
import type { Funding, FundingClass, FundingPurpose, JobCard, ScoreOptions } from "./types.ts";

function fundingClass(card: JobCard): FundingClass {
  const listing = card.listing || {};
  const payout = String(listing.payoutStatus || "").toLowerCase();
  const payment = String(
    listing.bountyHubPaymentStatus || listing.paymentStatus || "",
  ).toUpperCase();
  const explicit = String(listing.fundingClass || "").toLowerCase();

  if (card.walletlessIou === true) return "unfunded";
  if (payout === "none" && listing.funded === false) return "unfunded";
  if (payout === "none") return "promised";
  if (payment === "PROMISED" || explicit === "promised") return "promised";
  if (isEscrowTxHash(listing.escrowTxHash)) return "escrowed";
  // Platform "escrow" / "reserved" / funded=true without a real hash is not escrowed.
  if (explicit === "escrow" || explicit === "reserved" || listing.funded === true || payment === "PAID") {
    return "promised";
  }
  if (explicit === "unfunded" || listing.funded === false) return "unfunded";
  return "unknown";
}

function purpose(card: JobCard): FundingPurpose {
  if (isDirectory(card)) return "directory";
  if (isReferralOrMarketing(card)) return "referral_marketing";
  if (card.competition?.winnerOnly === true) return "contest";
  return "actionable";
}

/**
 * Funding is a different type from eligibility. Escrow requires a real hash.
 * OPEN after deadlineAt is still deadlineExpired=true.
 */
export function scoreFunding(card: JobCard, opts: ScoreOptions = {}): Funding {
  return {
    class: fundingClass(card),
    deadlineExpired: deadlineExpired(card.listing?.deadlineAt, opts.now),
    purpose: purpose(card),
  };
}
