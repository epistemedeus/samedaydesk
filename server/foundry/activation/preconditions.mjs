import { foundryHostOptIn, parseFoundryBodyLimit, DEFAULT_BODY_LIMIT_BYTES, FOUNDRY_OPT_IN_BODY_LIMIT_BYTES } from "../opt-in.js";

const SCHEMA = "pilot_correspondence";

function activateValue(env) {
  const raw = env.FOUNDRY_PRODUCTION_ACTIVATE;
  if (raw == null || String(raw).trim() === "") return "HOLD";
  return String(raw).trim();
}

export function assessPreconditions(env = {}, evidence = {}) {
  const blockers = [];
  const shapeBlockers = [];
  if (activateValue(env) !== "HOLD") blockers.push("production_activate_not_hold");

  let optInRequested = false;
  try {
    optInRequested = foundryHostOptIn(env);
  } catch {
    blockers.push("foundry_opt_in_invalid");
  }

  const url = String(env.CORRESPONDENCE_DATABASE_URL || "").trim();
  if (!url) shapeBlockers.push("database_url_absent");
  else {
    try {
      const parsed = new URL(url);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
        shapeBlockers.push("database_url_not_postgres");
      }
    } catch {
      shapeBlockers.push("database_url_invalid");
    }
  }
  if (String(env.CORRESPONDENCE_PG_SCHEMA || "").trim() !== SCHEMA) shapeBlockers.push("schema_not_pilot_correspondence");
  if (String(env.CORRESPONDENCE_ADMIN_TOKEN || "").length < 24) shapeBlockers.push("admin_token_short");
  if (String(env.CORRESPONDENCE_STORE || "postgres").toLowerCase() !== "postgres") shapeBlockers.push("store_not_postgres");
  if (!String(env.FOUNDRY_HOST_PROFILE_FILE || "").trim()) shapeBlockers.push("host_profile_file_absent");
  if (!String(env.FOUNDRY_PARTICIPATION_KEY_FILE || "").trim()) shapeBlockers.push("participation_key_file_absent");
  if (!String(env.FOUNDRY_PRIVATE_PROFILE_FILE || "").trim()) shapeBlockers.push("private_profile_file_absent");
  try {
    parseFoundryBodyLimit(env);
  } catch {
    shapeBlockers.push("body_limit_invalid");
  }
  const poolRaw = env.CORRESPONDENCE_POOL_MAX;
  if (poolRaw != null && String(poolRaw).trim() !== "") {
    const pool = Number(String(poolRaw).trim());
    if (!Number.isInteger(pool) || pool < 1 || pool > 4) shapeBlockers.push("pool_max_invalid");
  }
  const installer = evidence.installer;
  if (!installer || installer.installed !== true || installer.schema !== SCHEMA || installer.startupMigrates !== false) {
    shapeBlockers.push("installer_evidence_absent");
  }

  return {
    productionActivate: "HOLD",
    productionReady: false,
    holdReason: "Root owns env and process restart. This package does not activate production.",
    optInRequested,
    schema: SCHEMA,
    startupMigrates: false,
    destructiveDownMigration: false,
    bodyLimitWhenDisabled: DEFAULT_BODY_LIMIT_BYTES,
    bodyLimitWhenOptedIn: FOUNDRY_OPT_IN_BODY_LIMIT_BYTES,
    shapeComplete: shapeBlockers.length === 0 && blockers.length === 0,
    shapeBlockers,
    blockers,
  };
}
