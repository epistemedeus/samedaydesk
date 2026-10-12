import { TEST_NOW } from "./constants.ts";

export function nowIso(now?: string | Date | number): string {
  if (now == null) return TEST_NOW;
  if (typeof now === "number") return new Date(now).toISOString();
  if (now instanceof Date) return now.toISOString();
  const parsed = Date.parse(now);
  if (Number.isNaN(parsed)) return TEST_NOW;
  return new Date(parsed).toISOString();
}

export function deadlineExpired(deadlineAt: string | null | undefined, now?: string | Date | number): boolean {
  if (typeof deadlineAt !== "string" || !deadlineAt) return false;
  const end = Date.parse(deadlineAt);
  if (Number.isNaN(end)) return false;
  const at = Date.parse(nowIso(now));
  return at >= end;
}

export function isOpenStatus(status: string | null | undefined): boolean {
  const u = String(status || "").toUpperCase();
  return u === "OPEN" || u === "BIDDING";
}

export function listedAccess(card: {
  listing?: { agentAccess?: string };
  claim?: { agentAccess?: string };
}): string {
  return String(card.listing?.agentAccess || card.claim?.agentAccess || "").toUpperCase();
}

export function purposeRaw(card: {
  listing?: { purpose?: string; classificationKind?: string };
}): string {
  return String(card.listing?.purpose || card.listing?.classificationKind || "");
}

export function isReferralOrMarketing(card: {
  listing?: { purpose?: string; classificationKind?: string };
}): boolean {
  const p = purposeRaw(card).toUpperCase();
  return (
    p.includes("REFERRAL") ||
    p.includes("MARKETING") ||
    p === "FORUM_MARKETING" ||
    p === "FORUM_LINKED" ||
    p === "REFERRAL_CAMPAIGN"
  );
}

export function isDirectory(card: {
  source?: { sourceKind?: string; presentedAsJobApi?: boolean; name?: string };
}): boolean {
  const kind = String(card.source?.sourceKind || "").toLowerCase();
  const name = String(card.source?.name || "").toLowerCase();
  return kind === "directory" || name === "gigs.sh" || card.source?.presentedAsJobApi === true && kind === "directory";
}

export function isPausedOrDead(card: {
  source?: {
    paused?: boolean;
    sourceKind?: string;
    inaccessible?: boolean;
    claimRouteStatus?: number | null;
    publicGetStatus?: number | null;
  };
  listing?: { status?: string };
}): boolean {
  const kind = String(card.source?.sourceKind || "").toLowerCase();
  if (card.source?.paused === true) return true;
  if (kind === "paused" || kind === "closed" || kind === "paid_disabled" || kind === "no_public_get") {
    return true;
  }
  if (card.source?.inaccessible === true) return true;
  const status = String(card.listing?.status || "").toUpperCase();
  if (status === "PAUSED" || status === "CLOSED" || status === "CANCELLED" || status === "CANCELED") {
    return true;
  }
  return false;
}

/** Real on-chain hashes are 0x + 64 hex. Stubs like 0xabc are not escrow evidence. */
export function isEscrowTxHash(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function nominalReward(gross: string | number | null | undefined): string {
  if (gross == null || gross === "") return "unknown";
  return String(gross);
}
