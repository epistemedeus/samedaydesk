// Coverage map: every normal-user action the backend advertises at the
// release head (samedaydesk@1199727fb014ad1a41fb294a322f852d274e28bf), read
// from the authoritative sources named per entry, classified as:
//   cli          executable by the listed commands (batch ops count as cli)
//   handoff      a real external or human step; reference says where
//   unsupported  the backend does not support it for a normal user now
//   gap          the backend supports it; this CLI does not implement it yet
// operator-only and test-fixture surfaces are listed with audience operator
// or fixture and are not counted as normal-user actions. Command count and
// generated help are not completion; this table is the completion record.
import { COMMANDS } from "./manifest.mjs";
import { BATCH_OPS } from "./batch.mjs";

export const COVERAGE_SCHEMA = "samedaydesk.cli.coverage.v1";
export const RELEASE_HEAD = "epistemedeus/samedaydesk@1199727fb014ad1a41fb294a322f852d274e28bf";
const GW = "server/vendor/machine-gateway/openapi.json";
const APEX = "server/lib/apex-declarations.js#apexPaths";
const MCP = "server/lib/mcp-tool-inventory.js#MCP_TOOL_NAMES";
const AE = "vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz (sha256 95784dc255bd9952cec1b95e82b84cf214be8a88c0915f357c45ce8100d00f3f):src/catalog.mjs#ROUTES";
const AE_HANDOFF = command => `Existing client ae 0.3.0 (agent-economy-client, bin ae) command ${command}. Needs a native account session, wallet or signer that this CLI does not create or hold.`;
const MERCHANT = "agents.samedaydesk.com (merchant x402-url-extractor; source not in SameDayDesk at the release head; INVENTORY.md section 5)";

const row = (id, surface, action, source, classification, extra = {}) => ({ id, surface, action, source, classification, audience: "normal_user", commands: [], batchOps: [], reference: null, note: null, ...extra });

export const COVERAGE = Object.freeze([
  // Machine gateway (OpenAPI operationIds).
  row("gateway.health", "machine-gateway", "GET /healthz (gatewayHealth)", GW, "cli", { commands: ["capabilities"], batchOps: ["gateway.health"] }),
  row("gateway.discover", "machine-gateway", "GET /v1/discover (discoverRoutes)", GW, "cli", { commands: ["gateway.routes", "capabilities"], batchOps: ["gateway.routes"] }),
  row("gateway.route_schemas", "machine-gateway", "GET /v1/routes/{route}/{input,output}.schema.json", GW, "cli", { commands: ["gateway.schema"], batchOps: ["gateway.schema"] }),
  row("gateway.test", "machine-gateway", "POST /v1/test (testRouteFixture)", GW, "cli", { commands: ["gateway.test"], note: "Labeled fixture; no provider or payment." }),
  row("gateway.quote_anonymous", "machine-gateway", "POST /v1/quote without bearer (quoteRoute)", GW, "cli", { commands: ["gateway.quote"] }),
  row("gateway.quote_tenant", "machine-gateway", "POST /v1/quote with tenant bearer (quoteRoute)", GW, "cli", { commands: ["gateway.quote", "gateway.execute"] }),
  row("gateway.execute_free", "machine-gateway", "POST /v1/execute free route with Idempotency-Key (executeBoundQuote)", GW, "cli", { commands: ["gateway.execute", "gateway.resume"],
    note: "Routes at the head: lockfile.delta, http.capture, url.extract.submit, url.extract.poll, url.extract.result (all price 0). Needs an operator-enrolled tenant credential." }),
  row("gateway.execute_paid", "machine-gateway", "POST /v1/execute paid route with payment-signature", GW, "unsupported", {
    note: "paymentsEnabled is false at the head and no route is priced. A paid quote stops at paid_route_requires_payment_authority (handoff to an operator-approved payer); the CLI never pays or signs." }),
  row("gateway.receipt", "machine-gateway", "GET /v1/receipts/{id} (readPersistedReceipt)", GW, "cli", { commands: ["gateway.result", "gateway.resume"], batchOps: ["gateway.receipt"] }),
  row("gateway.tenant_enrollment", "machine-gateway", "tenant credential issue (bin/enroll.mjs)", "server/vendor/machine-gateway/bin/enroll.mjs", "handoff", { audience: "operator",
    reference: "Operator runs bin/enroll.mjs; the caller receives a 0600 credential file. No self-serve route exists." }),
  // Apex SameDayDesk HTTP (apex OpenAPI).
  row("apex.health", "samedaydesk.com", "GET /api/health (getHealth)", APEX, "cli", { batchOps: ["apex.health"] }),
  row("apex.ai_readiness", "samedaydesk.com", "GET /api/tools/ai-readiness?url (check_ai_readiness)", APEX, "cli", { commands: ["tools.ai_readiness"], batchOps: ["tools.ai_readiness"] }),
  row("apex.llms_txt", "samedaydesk.com", "GET /api/tools/llms-txt?url (generate_llms_txt)", APEX, "cli", { commands: ["tools.llms_txt"], batchOps: ["tools.llms_txt"] }),
  row("apex.agent_readiness_json", "samedaydesk.com", "GET /agent-readiness?host&format=json (check_agent_readiness)", APEX, "cli", { commands: ["readiness.check"], batchOps: ["readiness.check"] }),
  row("apex.agent_readiness_other_formats", "samedaydesk.com", "GET /agent-readiness?format=fix-pack or the documentation format", APEX, "gap",
    { note: "fix-pack answers Markdown, which the shared client-io refuses as non-JSON; the documentation format is not wired yet." }),
  row("apex.funnel_evidence", "samedaydesk.com", "POST /api/funnel-evidence (project_funnel_evidence)", APEX, "gap",
    { note: "Free idempotent projection of a caller packet (nothing stored). Not implemented in this CLI yet." }),
  row("apex.checkout", "samedaydesk.com", "/api/auth/*, /api/checkout/* (Supabase session, Stripe checkout)", "server/app.js#createSdsApp; server/middleware/auth.js", "handoff",
    { reference: "Human sign-in and Stripe checkout on samedaydesk.com. Not an agent action." }),
  // Apex MCP tools (POST /mcp JSON-RPC).
  row("mcp.check_ai_readiness", "samedaydesk.com/mcp", "tool check_ai_readiness", MCP, "cli", { commands: ["tools.ai_readiness"], note: "Same check over the HTTP route." }),
  row("mcp.check_agent_readiness", "samedaydesk.com/mcp", "tool check_agent_readiness", MCP, "cli", { commands: ["readiness.check"], note: "Same operation over GET /agent-readiness." }),
  row("mcp.generate_complete_fix_pack", "samedaydesk.com/mcp", "tool generate_complete_fix_pack (paid, Stripe license)", MCP, "handoff",
    { reference: "MCP tool at https://samedaydesk.com/mcp with a Stripe checkout license bought by a human (FIXPACK_MCP_BUY_URL in server/lib/fixpack-license.js). The CLI never buys." }),
  row("mcp.plan_taskmarket_delegation", "samedaydesk.com/mcp", "tool plan_taskmarket_delegation", MCP, "handoff",
    { reference: "MCP tool at https://samedaydesk.com/mcp (read-only payload builder). MCP-only; no HTTP route. This CLI has no MCP client." }),
  row("mcp.browse_taskmarket_tasks", "samedaydesk.com/mcp", "tool browse_taskmarket_tasks", MCP, "handoff",
    { reference: "MCP tool at https://samedaydesk.com/mcp. MCP-only; no HTTP route. This CLI has no MCP client." }),
  row("mcp.track_taskmarket_task", "samedaydesk.com/mcp", "tool track_taskmarket_task", MCP, "handoff",
    { reference: "MCP tool at https://samedaydesk.com/mcp. MCP-only; no HTTP route. This CLI has no MCP client." }),
  row("mcp.project_funnel_evidence", "samedaydesk.com/mcp", "tool project_funnel_evidence", MCP, "gap", { note: "HTTP equivalent POST /api/funnel-evidence is not implemented in this CLI yet." }),
  // Machine market (ae 0.3.0 ROUTES under /api/neomorphic-contributor-journey).
  row("market.profile", "machine-market", "GET /v1/market/profile (machine.profile)", AE, "cli", { commands: ["market.profile", "capabilities"], batchOps: ["market.profile"] }),
  row("market.discover", "machine-market", "GET /v1/market/discover (machine.discover)", AE, "cli", { commands: ["market.discover"], batchOps: ["market.discover"] }),
  ...[
    ["market.account_signup", "POST /v1/account/signup", "account.signup"], ["market.account_login", "POST /v1/account/login", "account.login"],
    ["market.account_recover", "POST /v1/account/recover", "account.recover"], ["market.account_readback", "POST /v1/account/readback", "account.resume"],
    ["market.account_session", "GET /v1/account/session", "account.session"], ["market.account_exit", "POST /v1/account/exit", "account.exit"],
    ["market.wallet_bind", "POST /v1/wallet/bind", "wallet.bind"], ["market.wallet_export", "GET /v1/wallet/export", "wallet.export"], ["market.wallet_exit", "POST /v1/wallet/exit", "wallet.exit"],
    ["market.call", "POST /v1/market/{action}", "market.call"], ["market.prove_wallet", "POST /v1/market/walletProve", "market.prove-wallet"],
    ["market.fund", "POST /v1/market/fundingAuthorize", "market.fund"], ["market.reclaim", "POST /v1/market/fundingIntent", "market.reclaim"],
    ["market.task_post", "POST /v1/tasks", "task.post"], ["market.task_quote", "GET /v1/tasks/{taskId}/quote", "task.quote"],
    ["market.task_fund", "POST /v1/tasks/{taskId}/funding", "task.fund"], ["market.task_intent", "POST /v1/tasks/{taskId}/funding-intent", "task.intent"],
    ["market.task_intent_sign", "POST /v1/tasks/{taskId}/funding-intent/signature", "task.intent.sign"], ["market.claim_terms", "GET /v1/claims/terms", "task.claim"],
    ["market.claim_binding", "POST /v1/claims/binding", "task.claim"], ["market.claim", "POST /v1/claims/claims", "task.claim"],
    ["market.submission_draft", "POST /v1/submission/{reservationId}/draft", "task.submit"], ["market.submission_submit", "POST /v1/submission/{reservationId}/submit", "task.submit"],
    ["market.review_read", "GET /v1/review", "task.retained"], ["market.review_verdict", "POST /v1/review/verdict", "task.review"],
    ["market.review_decision", "POST /v1/review/decision", "task.review"], ["market.review_authority", "POST /v1/review/authority", "task.authority"],
    ["market.payout_status", "GET /v1/payouts", "payout.status"], ["market.operation_readback", "GET /v1/operations", "operation.recover"],
  ].map(([id, action, command]) => row(id, "machine-market", action, AE, "handoff", { reference: AE_HANDOFF(command) })),
  row("market.c0_fixture_routes", "machine-market", "GET /healthz, GET /v1/discover, /v1/fixture/* (c0 fixture)", AE, "unsupported", { audience: "fixture", note: "Fixture server class only; not a live normal-user surface." }),
  row("market.native_debt_operator", "hosted-wallet-market", "native debt, discharge, canonical receiving (src/*.mjs, bin/*)", "vendor/hosted-wallet-market/src", "handoff", { audience: "operator",
    reference: "Operator kernels (Postgres, RPC). Not a caller action; owned elsewhere." }),
  // Merchant storefront linked from the apex.
  row("merchant.free_tools", "agents.samedaydesk.com/mcp", "free MCP tools (page_change, careers_board_cold, report_caller_result, trial_read, recover_paid_result)", MERCHANT, "handoff", {
    reference: "https://agents.samedaydesk.com/mcp (MCP streamable-http). An MCP caller should accept only protocol versions 2025-11-25 or 2025-06-18 by exact match, else protocol_version_unsupported (x402-url-extractor@d74c37ff caller-result-client/src/protocol-selection.mjs). This CLI has no MCP client." }),
  row("merchant.paid_tools", "agents.samedaydesk.com/mcp", "paid x402 MCP tools (25 at the 2026-11-12 observation)", MERCHANT, "handoff", {
    reference: "x402 payment by the caller's own payer at https://agents.samedaydesk.com/mcp. This CLI never pays, signs or probes paid routes." }),
]);

export function coverageDocument(version) {
  const known = new Set(COMMANDS.map(command => command.id));
  const ops = new Set(Object.keys(BATCH_OPS));
  for (const entry of COVERAGE) {
    for (const id of entry.commands) if (!known.has(id)) throw new Error(`coverage names unknown command ${id}`);
    for (const id of entry.batchOps) if (!ops.has(id)) throw new Error(`coverage names unknown batch op ${id}`);
    if (entry.classification === "cli" && !entry.commands.length && !entry.batchOps.length) throw new Error(`coverage cli entry ${entry.id} has no command`);
    if (entry.classification === "handoff" && !entry.reference) throw new Error(`coverage handoff ${entry.id} has no reference`);
  }
  const normal = COVERAGE.filter(entry => entry.audience === "normal_user");
  const counts = Object.fromEntries(["cli", "handoff", "unsupported", "gap"].map(kind => [kind, normal.filter(entry => entry.classification === kind).length]));
  return { schema: COVERAGE_SCHEMA, cliVersion: version, releaseHead: RELEASE_HEAD, normalUserActions: normal.length, counts,
    excluded: COVERAGE.filter(entry => entry.audience !== "normal_user").map(entry => ({ id: entry.id, audience: entry.audience })),
    completion: "Counts compare advertised normal-user actions with executable commands, real handoffs and unsupported backend capability. Command count and generated help are not completion.",
    entries: COVERAGE };
}

export function coverageMarkdown(version) {
  const doc = coverageDocument(version);
  const cell = text => String(text ?? "").replace(/\|/g, "\\|");
  const lines = [`# samedaydesk CLI coverage map (${version})`, "", "Generated from src/coverage.mjs; do not edit. Machine-readable copy: generated/coverage.json and `samedaydesk coverage`.", "",
    `Release head read: \`${doc.releaseHead}\`.`, "", doc.completion, "",
    `Normal-user actions: ${doc.normalUserActions}. cli ${doc.counts.cli}, handoff ${doc.counts.handoff}, unsupported ${doc.counts.unsupported}, gap ${doc.counts.gap}.`, "",
    "| Id | Surface | Action | Class | Audience | Commands or batch ops | Reference or note |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...doc.entries.map(entry => `| ${cell(entry.id)} | ${cell(entry.surface)} | ${cell(entry.action)} | ${entry.classification} | ${entry.audience} | ${cell([...entry.commands, ...entry.batchOps.map(op => `batch:${op}`)].join(", "))} | ${cell(entry.reference ?? entry.note ?? "")} |`),
    "", "## Remaining real gaps", "", ...doc.entries.filter(entry => entry.classification === "gap" || entry.classification === "unsupported").map(entry => `- ${entry.id}: ${entry.note ?? entry.reference}`), ""];
  return lines.join("\n");
}
