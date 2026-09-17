export const MCP_TOOLS = Object.freeze([
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

export const MCP_PROTOCOL = "2024-11-05";
export const MCP_SERVER_INFO = Object.freeze({
  name: "samedaydesk-agent-tools",
  version: "1.2.0",
});

export const USEFUL_JOBS_PIN = Object.freeze({
  version: "1.4.7",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
  rootName: "useful-jobs-1.4.7",
  cli: "bin/useful-jobs.mjs",
  kitArchive: "client/public/kit/useful-jobs-1.4.7.tar.gz",
  publicArchive: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
});

export const USEFUL_JOBS_NEGATIVE = Object.freeze({
  version: "1.1.0",
  sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
  bytes: 2577606,
  rootName: "useful-jobs-1.1.0",
  cli: "bin/useful-jobs.mjs",
  kitArchive: "client/public/kit/useful-jobs-1.1.0.tar.gz",
  publicArchive: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
});

export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const APEX_ORIGIN = "https://samedaydesk.com";
export const PILOT_MCP_PROBE = "tools/ops/verify-samedaydesk-mcp.mjs";

export const PROTOCOL_ROUTES = Object.freeze([
  "/mcp",
  "/api/health",
  "/scan",
]);

export const X402_PAGES = Object.freeze([
  "/x402",
  "/x402/seller-conformance",
  "/x402/verified",
]);

export const FOR_AGENTS_PAGES = Object.freeze([
  "/for-agents",
  "/for-agents/record-repeat",
  "/for-agents/distribution-repair",
  "/for-agents/consumer-repeat",
  "/for-agents/useful-jobs",
]);

export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
]);

export const FORBIDDEN_HEADERS = Object.freeze([
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
]);

export const SECRET_ENV = Object.freeze([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
]);

export const OPENAPI_FIXTURE = "fixtures/presence/catalog/openapi.json";
export const OPENAPI_FIXTURE_VERSION = "1.23.40";

export const SEEDED = Object.freeze({
  "sha-mismatch": {
    command: "archive",
    feature: "archive-acquisition",
    code: "wrong-digest",
  },
  "wrong-digest": {
    command: "archive",
    feature: "archive-acquisition",
    code: "wrong-digest",
  },
  "missing-required-mcp-tool": {
    command: "mcp",
    feature: "apex-mcp",
    extraTool: "does_not_exist_required_tool",
  },
  "missing-required-inputs": {
    command: "pack",
    feature: "useful-jobs",
    packId: "useful-jobs",
    argv: ["run", "lockfile-pin-delta"],
  },
});

export const PACKS = Object.freeze({
  "useful-jobs": {
    feature: "useful-jobs",
    via: "extracted-cli",
    defaultArgv: ["list", "--json"],
    seededArgv: ["run", "lockfile-pin-delta"],
  },
  s176: {
    feature: "offline-packs",
    bin: ["node", "experiments/s176-record-repeat-package/bin/record-repeat.mjs"],
    defaultArgv: ["sample", "--all"],
  },
  s185: {
    feature: "offline-packs",
    bin: ["node", "experiments/s185-distribution-repair-package/bin/distribution-repair.mjs"],
    defaultArgv: ["sample", "--positive"],
  },
  "offer-routing": {
    feature: "offer-routing",
    bin: ["node", "tools/offer-routing/route-job.mjs"],
    defaultArgv: ["tools/offer-routing/fixtures/complete-issue-discussion.job.json"],
    seededArgv: ["tools/offer-routing/fixtures/complete-issue-discussion.job.json"],
    expectProductReject: true,
  },
  "result-reuse": {
    feature: "result-reuse",
    bin: ["node", "tools/result-reuse/cli.mjs"],
    defaultArgv: ["preview", "--input", "tools/result-reuse/fixtures/accepted-page-change.json"],
  },
  "recurring-recipes": {
    feature: "recurring-recipes",
    bin: ["node", "tools/recurring-job-recipes/cli.mjs"],
    defaultArgv: ["--list"],
  },
});

export const FEATURES = Object.freeze({
  "useful-jobs": { command: "pack", id: "useful-jobs" },
  "archive-acquisition": { command: "archive", action: "acquire" },
  "offline-packs": { command: "pack", id: "s176" },
  "apex-mcp": { command: "mcp" },
  "x402-unpaid-discovery": { command: "fetch", target: "gateway-unpaid" },
  "hosted-readback": { command: "fetch", path: "/api/health" },
  "for-agents-cold-read": { command: "presence", action: "cold-read" },
  "offer-routing": { command: "pack", id: "offer-routing" },
  "result-reuse": { command: "pack", id: "result-reuse" },
  "recurring-recipes": { command: "pack", id: "recurring-recipes" },
});

export const HOST_BUILD = Object.freeze({
  script: "npm run build",
  includes: ["test:hosted-startup", "client tsc -b && vite build"],
  start: "npm start → node server/index.js",
});
