import { isOpenStatus } from "./inspect.ts";
import type { JobCard, MixedScore, Packet } from "./types.ts";

/**
 * Optional display sugar. Deliberately naive: a list GET 200 + OPEN + funded +
 * stated reward can look "high" while the three dimensions refuse work.
 * Never a gate.
 */
export function displayOnlyMixedScore(card: JobCard): MixedScore {
  let value = 0;
  if (card.source?.publicGetStatus === 200) value += 0.25;
  if (isOpenStatus(card.listing?.status)) value += 0.25;
  if (card.listing?.funded === true) value += 0.2;
  if (card.reward?.gross != null && String(card.reward.gross) !== "" && String(card.reward.gross) !== "0") {
    value += 0.15;
  }
  const access = String(card.listing?.agentAccess || card.claim?.agentAccess || "").toUpperCase();
  if (access === "AGENT_ALLOWED") value += 0.15;
  return { value: Number(Math.min(1, value).toFixed(4)), displayOnly: true };
}

export function workGateFromDimensions(packet: Packet): {
  startWork: false;
  reasons: string[];
  ignoredMixedScore: true;
} {
  const reasons: string[] = [];
  if (packet.eligibility.claimAuthority !== "agent") {
    reasons.push(`claimAuthority=${packet.eligibility.claimAuthority}`);
  }
  if (packet.eligibility.doNotStartWork) reasons.push("doNotStartWork");
  if (packet.eligibility.agentAccess === "human_only") reasons.push("agentAccess=human_only");
  if (packet.eligibility.agentAccess === "discover_only") reasons.push("agentAccess=discover_only");
  if (packet.funding.deadlineExpired) reasons.push("deadlineExpired");
  if (packet.funding.purpose !== "actionable") reasons.push(`purpose=${packet.funding.purpose}`);
  if (packet.funding.class !== "escrowed") reasons.push(`funding.class=${packet.funding.class}`);
  if (packet.effort.winProbability !== "unknown") {
    reasons.push("invented_win_probability");
  }
  return { startWork: false, reasons, ignoredMixedScore: true };
}

/** Forbidden pattern: mixed scalar as the only gate. Tests prove we do not use this. */
export function mixedScoreOnlyGate(packet: Packet): boolean {
  const v = packet.mixedScore?.value;
  return typeof v === "number" && v >= 0.5;
}
