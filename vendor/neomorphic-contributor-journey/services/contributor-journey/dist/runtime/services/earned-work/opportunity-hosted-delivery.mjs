/**
 * Explicit hosted-delivery projection within a trusted owner's admission.
 * Admission is deployment data, supplied by the operator, never a claimant.
 * Absent, malformed, and mismatched input stay unconfigured.
 * A claimant cannot supply this configuration.
 * Hosted paths are not settlement, open inventory, or delivered grants.
 */

const EMAIL_FALLBACK = "contact@neomorphic.io";

const UNCONFIGURED_NOTE = "Delivery is unconfigured. Email contact@neomorphic.io with your workflow. Claims and the waitlist require a scoped holder bearer. There is no anonymous registration. Wait for slot confirmation before starting.";
const HOSTED_NOTE = "Hosted round read, submission, and readback paths are configured for the received mount. Claims and the waitlist require a scoped holder bearer. Hosted delivery is not settlement, open inventory, or a delivered grant. Email contact@neomorphic.io remains the fallback. Wait for slot confirmation before starting.";

function blank(configuration) {
  return {
    schema: "neomorphic.opportunity-hosted-delivery.v1",
    configuration,
    deliveryState: "unconfigured",
    deploymentRequired: true,
    origin: null,
    prefix: null,
    roundKey: null,
    roundReadPath: null,
    submissionPathTemplate: null,
    readbackPathTemplate: null,
    machineClaimPath: null,
    waitlistPath: null,
    hostedClaimAutomation: false,
    publicClaimable: false,
    publicRemainingSlots: 0,
    publicPaidCapacity: 0,
    anonymousSelfRegistration: false,
    settlementAutomatic: false,
    grantsDelivered: false,
    openInventory: false,
    holderRequired: true,
    claimsRequireScopedHolder: true,
    emailFallback: EMAIL_FALLBACK,
    note: UNCONFIGURED_NOTE,
  };
}

function secretShaped(value) {
  return /bearer|ew_ctr_|token=/i.test(value);
}

function normalizeTarget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const origin = typeof input.origin === "string" ? input.origin.trim() : "";
  const prefix = typeof input.prefix === "string" ? input.prefix.trim() : "";
  const roundKey = typeof input.roundKey === "string" ? input.roundKey.trim() : "";
  if ([origin, prefix, roundKey].some(secretShaped)) return null;
  // Reject URL parser repairs, empty query/fragment markers and userinfo too.
  if (!/^https:\/\/[^/?#@\\\s]+\/?$/i.test(origin)) return null;
  if (prefix.length > 256 || !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/.test(prefix)) return null;
  if (prefix.split("/").some((part) => part === "." || part === "..")) return null;
  if (!/^[a-z0-9][a-z0-9-]{2,78}$/.test(roundKey)) return null;
  let url;
  try { url = new URL(origin); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  return { origin: url.origin, prefix: prefix === "/" ? "/" : prefix.replace(/\/$/, ""), roundKey };
}

export function projectHostedDelivery(input, admission) {
  if (input == null) return blank("absent");
  if (input.outOfScope === true) return blank("out_of_scope");
  const target = normalizeTarget(input);
  if (!target) return blank("malformed");
  if (admission == null) return blank("out_of_scope");
  const admitted = normalizeTarget(admission);
  if (!admitted) return blank("malformed");
  if (target.origin !== admitted.origin) return blank("wrong_origin");
  if (target.prefix !== admitted.prefix || target.roundKey !== admitted.roundKey) return blank("out_of_scope");
  const { origin, prefix, roundKey } = target;
  const base = `${origin}${prefix === "/" ? "" : prefix}/v1/opportunity-rounds/${roundKey}`;
  return {
    ...blank("hosted"),
    configuration: "hosted",
    deliveryState: "hosted",
    deploymentRequired: false,
    origin,
    prefix,
    roundKey,
    roundReadPath: base,
    submissionPathTemplate: `${base}/claims/{claimId}/submissions`,
    readbackPathTemplate: `${base}/claims/{claimId}`,
    machineClaimPath: `${base}/claims`,
    waitlistPath: `${base}/waitlist`,
    note: HOSTED_NOTE,
  };
}

export function projectionForRound(hosted, roundKey) {
  if (hosted && hosted.configuration === "hosted" && roundKey !== hosted.roundKey) return blank("out_of_scope");
  return hosted ?? blank("absent");
}

export function parseHostedEnv(env = {}) {
  const origin = env.EARNED_WORK_HOSTED_ORIGIN;
  const prefix = env.EARNED_WORK_HOSTED_PREFIX;
  const roundKey = env.EARNED_WORK_HOSTED_ROUND_KEY;
  const rawAdmission = env.EARNED_WORK_HOSTED_ADMISSION;
  const touched = [origin, prefix, roundKey, rawAdmission].some((value) => value != null && String(value).trim() !== "");
  if (!touched) return projectHostedDelivery(undefined);
  let admission;
  if (rawAdmission != null) {
    try { admission = JSON.parse(rawAdmission); } catch { return blank("malformed"); }
    if (!normalizeTarget(admission)) return blank("malformed");
  }
  return projectHostedDelivery({
    origin: origin == null ? "" : String(origin),
    prefix: prefix == null ? "" : String(prefix),
    roundKey: roundKey == null ? "" : String(roundKey),
  }, admission);
}
