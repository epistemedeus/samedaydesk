import { DEFAULT_CLAIM_AUTHORITY } from "./constants.ts";
import {
  deadlineExpired,
  isDirectory,
  isOpenStatus,
  isPausedOrDead,
  isReferralOrMarketing,
  listedAccess,
} from "./inspect.ts";
import type { AgentAccess, ClaimAuthority, Eligibility, JobCard, ScoreOptions } from "./types.ts";

function documentedIdentityClaim(card: JobCard): boolean {
  const method = String(card.claim?.method || "").toUpperCase();
  const endpoint = String(card.claim?.endpoint || "");
  if (method === "POST" && endpoint.includes("/claims")) return true;
  if (card.claim?.identityRequired === true && endpoint.length > 0 && method === "POST") {
    return true;
  }
  return false;
}

/**
 * Eligibility is who may participate and whether THIS caller has claim authority.
 * Default claimAuthority is none. A successful GET is never agent authority.
 */
export function scoreEligibility(card: JobCard, opts: ScoreOptions = {}): Eligibility {
  const accessListed = listedAccess(card);
  const referral = isReferralOrMarketing(card);
  const directory = isDirectory(card);
  const paused = isPausedOrDead(card);
  const expiredOpen =
    deadlineExpired(card.listing?.deadlineAt, opts.now) && isOpenStatus(card.listing?.status);
  const claimRoute401 = card.source?.claimRouteStatus === 401;
  const listGet200 = card.source?.publicGetStatus === 200;

  let agentAccess: AgentAccess = "discover_only";
  if (accessListed === "HUMAN_ONLY") {
    agentAccess = "human_only";
  } else if (directory || paused || referral) {
    agentAccess = "discover_only";
  } else if (documentedIdentityClaim(card) && !referral && !directory && !paused) {
    agentAccess = "auth_claim";
  } else if (accessListed === "AGENT_ALLOWED") {
    agentAccess = "agent_allowed";
  } else if (accessListed === "AUTH_CLAIM" && documentedIdentityClaim(card)) {
    agentAccess = "auth_claim";
  } else if (accessListed === "DISCOVER_ONLY" || listGet200) {
    agentAccess = "discover_only";
  }

  // claimAuthority cannot become agent (or auth_claim) because a GET succeeded,
  // the listing is expired-OPEN, HUMAN_ONLY, referral, or paused/401.
  let claimAuthority: ClaimAuthority = DEFAULT_CLAIM_AUTHORITY;
  const hostile = String(card.claimAuthority || "").toLowerCase();
  if (hostile === "agent" || hostile === "auth_claim") {
    claimAuthority = DEFAULT_CLAIM_AUTHORITY;
  }

  // Even a documented identity-gated claim does not grant this pack agent rights.
  if (agentAccess === "human_only") {
    claimAuthority = "human_only";
  } else if (agentAccess === "auth_claim") {
    claimAuthority = "auth_required";
  } else {
    claimAuthority = DEFAULT_CLAIM_AUTHORITY;
  }

  if (
    listGet200 &&
    !documentedIdentityClaim(card) &&
    (referral || expiredOpen || paused || claimRoute401 || directory)
  ) {
    claimAuthority = agentAccess === "human_only" ? "human_only" : DEFAULT_CLAIM_AUTHORITY;
  }

  if (String(claimAuthority) === "agent") {
    claimAuthority = DEFAULT_CLAIM_AUTHORITY;
  }

  const assigned = card.assignment?.assigned === true || card.assignment?.reserved === true;
  const doNotStartWork =
    String(claimAuthority) !== "agent" ||
    !assigned ||
    agentAccess === "human_only" ||
    agentAccess === "discover_only" ||
    referral ||
    directory ||
    paused ||
    expiredOpen ||
    claimRoute401;

  return { agentAccess, claimAuthority, doNotStartWork };
}
