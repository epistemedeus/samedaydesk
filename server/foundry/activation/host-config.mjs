import { foundryHostOptIn } from "../opt-in.js";

export const HOST_WITHHOLD_CLASS = "host_configuration_withheld";
export const UNENROLLED_CLASS = "hosted_success_without_enrolled_store";

const LAUNCH_CLAIM_KEYS = [
  "hostedDiscovery",
  "taskResult",
  "durableRetrieval",
  "launchedService",
  "productionReady",
  "portableKitInterop",
  "officialClientInterop",
];

export function missingHostConfiguration(env = {}) {
  const missing = [];
  try {
    if (!foundryHostOptIn(env)) missing.push("FOUNDRY_HOST_OPT_IN");
  } catch {
    missing.push("FOUNDRY_HOST_OPT_IN");
  }
  if (!String(env.CORRESPONDENCE_DATABASE_URL || "").trim()) missing.push("CORRESPONDENCE_DATABASE_URL");
  if (String(env.CORRESPONDENCE_ADMIN_TOKEN || "").trim().length < 24) missing.push("CORRESPONDENCE_ADMIN_TOKEN");
  return missing;
}

function missingFromObservation(observation) {
  const host = observation?.hostConfiguration;
  if (!host || typeof host !== "object" || Array.isArray(host)) return [];
  return missingHostConfiguration({
    FOUNDRY_HOST_OPT_IN: host.FOUNDRY_HOST_OPT_IN,
    CORRESPONDENCE_DATABASE_URL: host.CORRESPONDENCE_DATABASE_URL,
    CORRESPONDENCE_ADMIN_TOKEN: host.CORRESPONDENCE_ADMIN_TOKEN,
  });
}

export function launchClaimed(observation) {
  const claims = observation?.claims || {};
  if (LAUNCH_CLAIM_KEYS.some((key) => claims[key] === true)) return true;
  return observation?.launchedService === true || observation?.productionReady === true;
}

function hold(code, extra = {}) {
  return {
    rejected: true,
    ok: false,
    exitCode: 2,
    code,
    class: code,
    reason: code,
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    secretsCopied: false,
    ...extra,
  };
}

export function judgeHostLaunch(observation, env = null) {
  const missing = env ? missingHostConfiguration(env) : missingFromObservation(observation);
  if (!missing.length || !launchClaimed(observation)) return { rejected: false, missing };
  return hold(HOST_WITHHOLD_CLASS, { missing });
}

export function judgeUnenrolledHostedSuccess(observation) {
  const explicitlyUnenrolled = observation?.enrolledRealStore === false
    || observation?.correspondenceDataService?.enrolled === false;
  if (!explicitlyUnenrolled || !launchClaimed(observation)) return { rejected: false };
  return hold(UNENROLLED_CLASS, { enrolledRealStore: false });
}
