// Startup diagnostics are private enum-only telemetry, never exception text.
const STAGES = new Set([
  "runtime_publication", "service_import", "service_config", "store_create",
  "app_create", "profile_load", "entry_module", "entry_create",
  "base_readiness", "entry_readiness",
]);
const CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "28P01", "28000", "53300", "57P01", "57P02", "57P03", "42P01", "42703",
  "3F000", "57014", "40P01", "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_MODULE_NOT_FOUND",
  "ERR_REQUIRE_ASYNC_MODULE", "installed_verification_changed",
  "installed_source_changed", "entry_host_binding_mismatch",
  "entry_pool_binding_mismatch", "private_profile_unreadable",
  "private_profile_unset", "participation_key_invalid",
]);
export function startupDiagnostic(stage, error) {
  let code = "unknown";
  try {
    for (const candidate of [error, error?.cause]) {
      if (typeof candidate?.code === "string" && CODES.has(candidate.code)) {
        code = candidate.code;
        break;
      }
    }
  } catch { /* Do not let an exception accessor disrupt cleanup or logging. */ }
  return { stage: STAGES.has(stage) ? stage : "unknown", code };
}
