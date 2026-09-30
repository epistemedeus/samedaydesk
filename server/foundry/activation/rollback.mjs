#!/usr/bin/env node
const apply = process.argv.includes("--apply");
const procedure = {
  productionActivate: "HOLD",
  productionReady: false,
  applied: false,
  schemaDropped: false,
  destructiveDownMigration: false,
  steps: [
    "Leave FOUNDRY_PRODUCTION_ACTIVATE unset or HOLD.",
    "Unset FOUNDRY_HOST_OPT_IN.",
    "Unset CORRESPONDENCE_DATABASE_URL, CORRESPONDENCE_ADMIN_TOKEN, CORRESPONDENCE_PG_SCHEMA, CORRESPONDENCE_POOL_MAX, CORRESPONDENCE_STORE, CORRESPONDENCE_TRUST_PROXY, CORRESPONDENCE_CORS_ORIGINS, and CORRESPONDENCE_BODY_LIMIT_BYTES.",
    "Unset FOUNDRY_HOST_PROFILE_FILE and FOUNDRY_PARTICIPATION_KEY_FILE.",
    "Restart the process that runs node server/index.js.",
    "GET /api/health stays 200 with service samedaydesk.",
    "GET /api/correspondence/healthz returns enabled false and reason unconfigured.",
    "Do not drop schema pilot_correspondence. There is no down migration.",
  ],
};

if (apply) {
  process.stdout.write(`${JSON.stringify({
    ...procedure,
    ok: false,
    exitCode: 2,
    code: "false_green_rejected",
    reason: "production_activate_not_hold",
  })}\n`);
  process.exit(2);
}

process.stdout.write(`${JSON.stringify({ ...procedure, ok: true, exitCode: 0, code: "rollback_procedure" })}\n`);
