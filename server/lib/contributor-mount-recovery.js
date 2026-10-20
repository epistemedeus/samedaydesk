// Shared contributor startup policy. One request drives at most one init.
// There is no timer, interval, or watchdog. Diagnostics stay enum-only.
import { startupDiagnostic } from "../foundry/startup-diagnostic.js";

export const RECOVERY_BACKOFF_MS = Object.freeze([1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);

const PERMANENT_STAGES = new Set([
  "source_verify", "qualification_load", "ingress_profile", "asset_load", "service_config",
]);
const PERMANENT_CODES = new Set([
  "28P01", "28000", "42501", "3D000", "3F000",
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND",
  "ENOENT", "ENOTDIR", "EACCES", "EPERM", "EROFS",
  "installed_verification_changed", "installed_source_changed", "INVALID_INPUT",
]);
// Static refusals only. Matched exactly so a driver message cannot widen them.
const PERMANENT_MESSAGES = new Set([
  "live mount requires the exact default artifact and installed adapters",
  "artifact identity refused", "artifact manifest refused", "artifact bytes refused",
  "artifact digest refused", "unlisted artifact member refused", "missing artifact member",
  "runtime source stamp refused", "host lock differs", "host dependency differs",
  "actual compiled managed composition required",
  "explicit installed managed profile required", "reviewed public read composition required",
  "exact HTTPS origin required", "explicit supported qualified ingress mode required",
  "explicit concrete proxy IPs required",
  "signed edge qualification required", "controller qualification signature refused",
  "qualified source/origin/store differs", "qualification shape refused",
  "qualification date refused", "explicit received managed edge required",
  "exact received deployment required", "fresh independent receiving references required",
  "distinct owning receiving references required",
  "qualification preparation must stay disabled and public-off",
  "exact controller-received SDS source required",
  "exact controller-received product source required",
  "existing stable integrity key required", "installed profile required",
  "existing explicit store and stable credentials required",
  "qualification encoding refused", "qualification issue time refused",
  "source member refused", "source changed during receiving",
  "exact source required", "exact private desk placement required",
  "desk resource placement refused", "desk resource changed", "compiled desk absent",
  "bounded desk assets required",
  "durable deployment binding differs; restore the enrolled store, origin and keys",
  "unqualified existing account store cannot be enrolled live",
  "deployment is not enrolled for these exact store, origin and stable keys",
  "exact task/requester binding is not enrolled",
  "live profile requires actual installed adapters",
  "live canonical receiving cannot use a synthetic proof producer",
  "journey configuration differs from the validated profile",
  "CONTRIBUTOR_JOURNEY_MODE must be disabled, staging or live",
  "journey listener must be loopback", "invalid journey CORS origin",
  "explicit journey database URL is required",
  "database must match the selected profile; connection overrides are refused",
  "journey must use a dedicated staging database",
  "distinct dedicated service tokens (>=24 characters) are required",
  "durable schema cannot be synthetic, historical or shared public",
  "distinct canonical service schemas required",
  "live profile requires the installed composition",
  "canonical same-origin HTTPS preview required",
  "distinct32-byte stable installed keys required",
  "explicit unique profile-matched round bindings required",
  "stable durable store ID required",
  "public reads must be explicitly 0 or 1",
  "public reads require an explicit human review reference",
  "selected canonical round is absent",
  "selected source is not the exact admitted production round",
  "live fixture refused", "round is outside the selected profile",
  "production source cannot enter staging", "canonical offer is absent",
  "task is outside the selected durable bindings",
  "exact opportunity task ID required",
]);
const TRANSIENT_MESSAGE = /connection terminated|connection closed|Client has encountered a connection error|server closed the connection|Query read timeout|timeout exceeded when trying to connect|connect ECONNREFUSED|connect ETIMEDOUT|connect ECONNRESET/i;

function primary(error) {
  const nested = [error, error?.cause];
  if (Array.isArray(error?.errors)) nested.push(...error.errors);
  for (const candidate of nested) {
    if (candidate && typeof candidate.code === "string") return candidate;
  }
  return error;
}

function mappedCode(stage, code, permanent, message) {
  if (code !== "unknown") return code;
  if (!permanent && /timeout/i.test(message)) return "ETIMEDOUT";
  if (!permanent && TRANSIENT_MESSAGE.test(message)) return "ECONNRESET";
  if (!permanent) return code;
  if (stage === "source_verify" || stage === "asset_load") return "installed_source_changed";
  if (stage === "qualification_load") return "installed_verification_changed";
  return "INVALID_INPUT";
}

/** Secret-safe class for one init failure. The message is never returned. */
export function contributorFailure(stage, error) {
  const diagnostic = startupDiagnostic(stage, primary(error));
  const message = typeof error?.message === "string" ? error.message
    : typeof error?.cause?.message === "string" ? error.cause.message : "";
  const permanent = PERMANENT_STAGES.has(diagnostic.stage)
    || PERMANENT_CODES.has(diagnostic.code)
    || PERMANENT_MESSAGES.has(message)
    || / must be an integer$| out of range$/.test(message);
  return {
    stage: diagnostic.stage,
    code: mappedCode(diagnostic.stage, diagnostic.code, permanent, message),
    permanent,
  };
}

export function recoveryDelay(attempt) {
  const index = Math.max(0, Math.min(attempt, RECOVERY_BACKOFF_MS.length - 1));
  return RECOVERY_BACKOFF_MS[index];
}

export function createRecoveryState(reason = "disabled") {
  return {
    status: reason === "disabled" ? "disabled" : "starting",
    reason,
    runtime: null,
    inFlight: null,
    closed: false,
    terminal: reason !== "starting",
    diagnostic: null,
    attempts: 0,
    initializations: 0,
    nextAttemptAt: 0,
  };
}

export function noteContributorFailure(state, stage, error, now, label) {
  const failure = contributorFailure(stage, error);
  state.runtime = null;
  state.status = "disabled";
  state.diagnostic = { stage: failure.stage, code: failure.code };
  state.terminal = failure.permanent;
  if (failure.permanent) {
    state.reason = failure.code === "ERR_MODULE_NOT_FOUND" || failure.code === "MODULE_NOT_FOUND"
      ? "integration_pending"
      : failure.stage === "service_config" ? "invalid_config" : "unavailable";
  } else {
    state.reason = "unavailable";
    state.nextAttemptAt = now() + recoveryDelay(state.attempts);
    state.attempts += 1;
  }
  console.error(label, { stage: state.diagnostic.stage, code: state.diagnostic.code });
  return failure;
}
