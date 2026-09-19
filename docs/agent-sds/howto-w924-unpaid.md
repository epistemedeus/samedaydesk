# How to stay unpaid on SameDayDesk (w924)

Use this when a cold clone of `epistemedeus/samedaydesk` is enough and the
goal is **inventory plus honest refuse**: fixture discovery, task-to-offer
routing, apex MCP list pin, unpaid 402 catalog pin, then **stop**. Do not
settle. Do not publish. Do not touch Neomorphic.

This is a Diátaxis how-to for wave **w924**. It is not the unpaid MCP
list-only guide, not the “HTTP 402 is not settlement” evidence how-to,
not the w904 public-entry how-to, and not a license-redemption or
checkout flow.

Audience: an agent on a cold clone of `epistemedeus/samedaydesk`. Node
**22.x**. No `npm install`. Run every command from the repository root.

## Boundary

Unpaid SDS work on this clone is fixture reads, local routing, and
source pins. Listing a paid tool, a 402 challenge, or a useful-jobs
archive is catalog metadata, not a bill. HTTP 402 with amount `5000`
is an unpaid challenge, not settlement.

| Surface | Unpaid here? | This how-to |
| --- | --- | --- |
| Offline `resolveForAgentsColdRead({preferFixture:true})` | Yes | Required |
| `route-job.mjs` on `page-change-evidence` | Yes (local, `payment: none`) | Required |
| `route-job.mjs` on `complete-issue-discussion` | Honest miss (`ok: false`) | Required refuse |
| Apex MCP `initialize` / `tools/list` source pin | Yes | Required; no `tools/call` |
| Presence x402 catalog `/extract` amount `5000` | Yes (unpaid 402 pin) | Required; do not pay |
| Buyer-runtime stop `reason: "no wallet"` | Yes (unpaid 402) | Required |
| useful-jobs 1.4.7 discovery (`purchaseAuthority: false`) | Yes (offline archive pin) | Required |
| result-reuse **preview** | Yes | Allowed |
| result-reuse **export** without `--opt-in` | Refuse | Seeded failure |
| `tools/call` of `generate_complete_fix_pack` | Paid Fix Pack | Refuse before POST |
| `GET /extract`, `POST /extract/batch` | Paid gateway | Refuse |
| Treat HTTP 402 as settlement | False settlement | Refuse |
| `GET /mcp?cs=` or Stripe Payment Link | License / checkout | Refuse |
| MCP Registry publish / `version=latest` write | Publish | Refuse |
| `vendor/neomorphic*` / neo-kernel-vendor | Other product | Refuse |

Speak MCP protocol **`2024-11-05`**. Do not send `PAYMENT-SIGNATURE`,
`X-PAYMENT`, `stripe-signature`, or `Authorization`. Do not open
`buy.stripe.com`. Naming `neo.agent_task_kit` in the offer matrix is
not permission to fetch or run it.

Five apex tools (order is load-bearing; pin is
`server/lib/mcp-tool-inventory.js`):

1. `check_ai_readiness` — free
2. `generate_complete_fix_pack` — **PAID** (listed, never called here)
3. `plan_taskmarket_delegation` — free plan only
4. `browse_taskmarket_tasks` — free public read
5. `track_taskmarket_task` — free public read

The byte pin of the `TOOLS` block in `server/routes/mcp.js` is SHA-256
`068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf`.
Drift is a stop, not a reason to invent names.

Committed unpaid 402 pin for `GET /extract`: amount `"5000"` atomic
USDC on `eip155:8453` to `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee`.
The catalog has **23** origin routes (`x402Version: 2`). A matching
fixture observation is `fixtures/verified-feed/observations/extract-current.json`
with `status: 402`. Pinning that challenge is not a paid retry.

Wave **w924** pins those committed artifacts. It does not invent a new
paid SKU.

## Cold run (offline, unpaid)

This command imports committed helpers only. It sends no HTTP, no
payment header, and does not open Stripe. It does not POST `tools/call`.
It does not treat a 402 challenge as settlement.

```bash
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveForAgentsColdRead } from "./tools/presence/for-agents-cold-read.mjs";
import { routeJobFromFile } from "./tools/offer-routing/route-job.mjs";
import { previewReuse } from "./tools/result-reuse/src/export.mjs";
import { MCP_TOOL_NAMES } from "./server/lib/mcp-tool-inventory.js";
import { loadRuntime } from "./tools/buyer-runtimes/lib.mjs";

const WAVE = "w924";
const PAID_TOOL = "generate_complete_fix_pack";
const PROTOCOL = "2024-11-05";
const FROZEN_TOOLS_BLOCK_SHA256 =
  "068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf";
const LLMS_SHA =
  "95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d";
const SKILLS_SHA =
  "a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564";
const USEFUL_JOBS_SHA256 =
  "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec";
const EXTRACT_AMOUNT = "5000";
const EXTRACT_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
const EXPECTED_NAMES = [
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
];
const SKILL_NAMES = ["web-extract", "page-change", "explicit-record"];
const CLOCK = "2026-09-18T00:00:00Z";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const mcpSource = readFileSync("server/routes/mcp.js", "utf8");
const appSource = readFileSync("server/app.js", "utf8");
const useful = JSON.parse(
  readFileSync("client/public/discovery/useful-jobs.json", "utf8"),
);
const x402 = JSON.parse(readFileSync("fixtures/presence/catalog/x402.json", "utf8"));
const extractObs = JSON.parse(
  readFileSync("fixtures/verified-feed/observations/extract-current.json", "utf8"),
);

const discovery = await resolveForAgentsColdRead({ preferFixture: true });
assert.equal(discovery.outcome, "offline_fixture");
assert.equal(discovery.paid, false);
assert.equal(discovery.liveObserved, false);
assert.equal(discovery.coverage, "partial_discovery_not_apex_guide");
assert.equal(discovery.sources.length, 2);
assert.equal(discovery.sources.every((s) => s.source === "fixture"), true);
const llms = discovery.sources.find((s) => s.id === "agents_llms");
const skills = discovery.sources.find((s) => s.id === "agents_skills_index");
assert.equal(llms.sha256, LLMS_SHA);
assert.equal(skills.sha256, SKILLS_SHA);
assert.equal(skills.captureAuthority, "worker_reported");
const skillIndex = JSON.parse(skills.body);
assert.deepEqual(skillIndex.skills.map((s) => s.name), SKILL_NAMES);

const complete = routeJobFromFile(
  "tools/offer-routing/fixtures/complete-issue-discussion.job.json",
);
assert.equal(complete.ok, false);
assert.equal(complete.selected, null);
assert.equal(complete.paid, false);
assert.equal(complete.paymentRequired, false);
assert.equal(complete.executionAuthorized, false);
assert.equal(
  complete.warnings.includes("complete_issue_acquisition_unavailable"),
  true,
);
assert.equal(
  complete.rejected.some(
    (row) =>
      row.offerId === "sdd.paid_html_extract" && row.reason === "job_type_in_notFor",
  ),
  true,
);
assert.equal(
  complete.avoidedMistakes.includes("paid_html_extraction_for_complete_issue_comments"),
  true,
);

const page = routeJobFromFile(
  "tools/offer-routing/fixtures/page-change-evidence.job.json",
);
assert.equal(page.ok, true);
assert.equal(page.selected.offerId, "sdd.page_change_offline");
assert.equal(page.selected.payment, "none");
assert.equal(page.paid, false);
assert.equal(page.paymentRequired, false);
assert.equal(page.executionAuthorized, false);
assert.equal(page.criteriaAssessment, "not_evaluated");

assert.deepEqual([...MCP_TOOL_NAMES], EXPECTED_NAMES);
assert.match(mcpSource, /const PROTOCOL_VERSION = "2024-11-05"/);
assert.equal(mcpSource.includes("2025-11-25"), false);
assert.equal(mcpSource.includes("2026-07-28"), false);
assert.match(mcpSource, /name: "samedaydesk-agent-tools"/);
assert.match(mcpSource, /PAID\. Returns the complete/);
assert.equal(appSource.includes("paymentMiddleware"), false);
assert.match(appSource, /app\.use\("\/mcp", mcpRouter\)/);
const toolsBlock = mcpSource.slice(
  mcpSource.indexOf("const TOOLS = ["),
  mcpSource.indexOf("const okMsg"),
);
assert.equal(sha256(toolsBlock), FROZEN_TOOLS_BLOCK_SHA256);

assert.equal(x402.x402Version, 2);
assert.equal(x402.items.length, 23);
const extract = x402.items.find((row) => row.resource.routeTemplate === "/extract");
assert.equal(extract.request.method, "GET");
assert.equal(extract.accepts[0].amount, EXTRACT_AMOUNT);
assert.equal(extract.accepts[0].network, "eip155:8453");
assert.equal(extract.accepts[0].payTo, EXTRACT_PAY_TO);
assert.equal(extractObs.route, "/extract");
assert.equal(extractObs.status, 402);
assert.equal(extractObs.body.accepts[0].amount, EXTRACT_AMOUNT);
assert.notEqual(extractObs.status, 200);
assert.equal(extractObs.body.accepts[0].amount === "0.005", false);

const stop = loadRuntime("agent402").states.stop;
assert.equal(stop.reason, "no wallet");
assert.equal(stop.mustNotRun.includes("payX402 paid retry"), true);
assert.equal(stop.mustNotRun.includes("Agent402 route-execute"), true);
assert.match(stop.recorded, /no PAYMENT-SIGNATURE/i);

assert.equal(useful.version, "1.4.7");
assert.equal(useful.purchaseAuthority, false);
assert.equal(useful.paidHostedClaim, false);
assert.equal(useful.offline, true);
assert.equal(useful.sha256, USEFUL_JOBS_SHA256);
assert.equal(useful.bytes, 5255824);

const held = JSON.parse(
  readFileSync("tools/result-reuse/fixtures/accepted-page-change.json", "utf8"),
);
const preview = previewReuse(held, {
  taskId: "vendor-watch",
  subject: "vendor-page-result",
  sequence: 1,
  clock: CLOCK,
});
assert.equal(preview.ok, true);
assert.equal(preview.mode, "preview");
assert.equal(preview.publicSafeCertified, false);
assert.equal(preview.purchaseRequiresPublish, false);
assert.equal(preview.optInRequiredToWrite, true);
assert.equal(preview.observation.execute, false);

console.log(
  JSON.stringify(
    {
      ok: true,
      wave: WAVE,
      quadrant: "howto",
      paid: false,
      paymentAttempted: false,
      toolsCalled: false,
      checkout: false,
      publish: false,
      neoKernelVendor: false,
      liveMerchantPay: false,
      extractAttempted: false,
      http402IsSettlement: false,
      discoveryOutcome: discovery.outcome,
      skillNames: SKILL_NAMES,
      completeIssueUnavailable: true,
      pageChangeOffer: page.selected.offerId,
      protocolVersion: PROTOCOL,
      paidToolListed: PAID_TOOL,
      paidToolCalled: false,
      extractAmountAtomic: EXTRACT_AMOUNT,
      extractCatalogStatus: 402,
      x402RouteCount: x402.items.length,
      buyerStopReason: stop.reason,
      reuseMode: preview.mode,
      usefulJobsVersion: useful.version,
      usefulJobsPurchaseAuthority: useful.purchaseAuthority,
      toolsBlockSha256: FROZEN_TOOLS_BLOCK_SHA256,
    },
    null,
    2,
  ),
);
JS
```

Expected: exit **0** and JSON with `"ok": true`, `"wave": "w924"`,
`"paid": false`, `"toolsCalled": false`, `"discoveryOutcome": "offline_fixture"`,
`"completeIssueUnavailable": true`, `"pageChangeOffer": "sdd.page_change_offline"`,
`"protocolVersion": "2024-11-05"`, `"paidToolListed": "generate_complete_fix_pack"`,
`"paidToolCalled": false`, `"extractAmountAtomic": "5000"`,
`"extractCatalogStatus": 402`, `"http402IsSettlement": false`,
`"buyerStopReason": "no wallet"`, `"reuseMode": "preview"`,
`"usefulJobsPurchaseAuthority": false`.

The same unpaid facts as separate public-entry commands (still no
network, no pay):

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json; echo "complete_issue_exit:$?"
```

Expected: fixture cold-read `outcome: "offline_fixture"`, `paid: false`;
page-change route exit **0**, `ok: true`, `paid: false`; complete-issue
route exit **2**, `ok: false`, `selected: null`,
`complete_issue_acquisition_unavailable`. Exit 2 here is the honest miss,
not a license to buy `/extract`.

Existing unpaid suites (no `npm install`):

```bash
node --test scripts/public-entry.test.mjs
node --test tools/presence/for-agents-cold-read.test.mjs
node --test tools/offer-routing/route-job.test.mjs tools/offer-routing/review.test.mjs
```

## Seeded failure (required refusal)

The seed below is intentional. It asks this how-to to treat paid HTML
extract, or an unpaid 402 challenge, as settlement. Do not “fix” it by
posting `/extract`, attaching `PAYMENT-SIGNATURE`, calling
`generate_complete_fix_pack`, or opening Stripe.

```bash
SDS_HOWTO_SEED="${SDS_HOWTO_SEED:-paid-extract}" node --input-type=module <<'JS'
const WAVE = "w924";
const PAID_TOOL = "generate_complete_fix_pack";
const FORBIDDEN_HEADERS = ["PAYMENT-SIGNATURE", "X-PAYMENT", "stripe-signature", "Authorization"];
const PAYMENT_STOP_PATHS = [
  "/extract",
  "/extract/batch",
  "/api/checkout",
  "/api/stripe/webhook",
  "/mcp?cs=",
];
const NEO_STOP = [
  "vendor/neomorphic-correspondence",
  "neo-kernel-vendor",
  "neomorphic.io",
  "neo.agent_task_kit",
  "npm run correspondence:migrate",
];
const KNOWN = [
  "paid-extract",
  "paid-tool-call",
  "payment-signature",
  "stripe-path",
  "registry-publish",
  "neo-kernel-vendor",
  "paid-as-unpaid",
  "402-as-settlement",
  "complete-issue-as-extract",
];

function fail(code, message, extra = {}) {
  const body = {
    ok: false,
    rejected: true,
    wave: WAVE,
    code,
    message,
    paid: false,
    paymentAttempted: false,
    toolsCalled: false,
    extractAttempted: false,
    publishAttempted: false,
    neoKernelVendor: false,
    http402IsSettlement: false,
    ...extra,
  };
  console.log(JSON.stringify(body, null, 2));
  console.error(message);
  process.exit(1);
}

const seed = process.env.SDS_HOWTO_SEED || "paid-extract";
if (seed === "paid-extract" || seed === "complete-issue-as-extract") {
  fail(
    "PAID_EXTRACT_REFUSE",
    "complete_issue_discussion is not a reason to GET/POST /extract; unpaid w924 does not settle",
    {
      seed,
      path: "https://agents.samedaydesk.com/extract",
      neverPostedExtract: true,
      warning: "complete_issue_acquisition_unavailable",
      commonMistake: "paid_html_extraction_for_complete_issue_comments",
    },
  );
}
if (seed === "paid-tool-call") {
  fail(
    "PAID_REFUSE",
    "tools/call of generate_complete_fix_pack is paid; unpaid SDS w924 does not settle",
    { seed, tool: PAID_TOOL, neverPostedCall: true },
  );
}
if (seed === "payment-signature") {
  fail(
    "PAYMENT_HEADER_REFUSE",
    "payment headers are forbidden on unpaid SDS w924",
    { seed, forbidden: FORBIDDEN_HEADERS, headerNeverSent: true },
  );
}
if (seed === "stripe-path") {
  fail(
    "STRIPE_PATH_REFUSE",
    "refusing Stripe/checkout path in unpaid SDS w924: /api/checkout",
    { seed, path: "/api/checkout", stops: PAYMENT_STOP_PATHS, neverOpenedCheckout: true },
  );
}
if (seed === "registry-publish") {
  fail(
    "REGISTRY_PUBLISH_REFUSE",
    "MCP Registry publish is a kill condition for unpaid SDS w924",
    { seed, publishAttempted: false },
  );
}
if (seed === "neo-kernel-vendor") {
  fail(
    "NEO_VENDOR_REFUSE",
    "neomorphic/neo-kernel-vendor is out of scope for SDS unpaid w924",
    { seed, stops: NEO_STOP },
  );
}
if (seed === "paid-as-unpaid") {
  fail(
    "PAID_AS_UNPAID_REFUSE",
    "listing generate_complete_fix_pack is not permission to call it unpaid",
    { seed, tool: PAID_TOOL, listedIsNotCalled: true },
  );
}
if (seed === "402-as-settlement") {
  fail(
    "HTTP_402_NOT_SETTLEMENT",
    "HTTP 402 amount 5000 is an unpaid challenge, not settlement; unpaid w924 does not settle",
    {
      seed,
      catalogAmount: "5000",
      catalogStatus: 402,
      neverSettled: true,
    },
  );
}
fail("UNKNOWN_SEED", `unknown seeded failure: ${seed}`, { seed, known: KNOWN });
JS
echo "seeded_exit:$?"
```

Expected: the Node process exits **1**. Stdout is JSON with
`"ok": false`, `"rejected": true`, `"wave": "w924"`,
`"code": "PAID_EXTRACT_REFUSE"`, `"neverPostedExtract": true`,
`"paymentAttempted": false`. Stderr matches
`complete_issue_discussion is not a reason to GET/POST /extract; unpaid w924 does not settle`.
`seeded_exit:1`.

Replay other named refusals with the same fence:

| `SDS_HOWTO_SEED` | Exit | `code` |
| --- | --- | --- |
| `paid-extract` (default) | 1 | `PAID_EXTRACT_REFUSE` |
| `complete-issue-as-extract` | 1 | `PAID_EXTRACT_REFUSE` |
| `paid-tool-call` | 1 | `PAID_REFUSE` |
| `payment-signature` | 1 | `PAYMENT_HEADER_REFUSE` |
| `stripe-path` | 1 | `STRIPE_PATH_REFUSE` |
| `registry-publish` | 1 | `REGISTRY_PUBLISH_REFUSE` |
| `neo-kernel-vendor` | 1 | `NEO_VENDOR_REFUSE` |
| `paid-as-unpaid` | 1 | `PAID_AS_UNPAID_REFUSE` |
| `402-as-settlement` | 1 | `HTTP_402_NOT_SETTLEMENT` |
| `not-a-real-id` | 1 | `UNKNOWN_SEED` |

A second seed hits a real in-repo refuse (export is a write; unpaid
preview is enough). Do not add `--opt-in` to “fix” it.

```bash
node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 \
  --clock "2026-09-18T00:00:00Z" \
  --out /tmp/w924-must-not-write.json
echo "reuse_export_exit:$?"
```

Expected: exit **1** and
`refusing to write without --opt-in; preview first and inspect included/omitted`.
The file is not a settled observation. Do not retry with `--opt-in`
from this how-to.

Unknown settlement flags on result-reuse also exit **1** (`unknown option`):
`--live`, `--pay`, `--neo`, `--publish`.

## Do not run (wrong path for this how-to)

These are named so they can be refused. Do not execute them from this doc.

```text
curl -sS -H 'PAYMENT-SIGNATURE: e30=' \
  'https://agents.samedaydesk.com/extract?url=https://github.com/modelcontextprotocol/servers/issues/4785'
curl -sS -H 'content-type: application/json' \
  -d '{"urls":["https://github.com/modelcontextprotocol/servers/issues/4785"]}' \
  https://agents.samedaydesk.com/extract/batch
curl -sS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"generate_complete_fix_pack","arguments":{"url":"https://example.com","license":"cs_test_seeded"}}}' \
  https://samedaydesk.com/mcp
curl -sS 'https://samedaydesk.com/mcp?cs=cs_test_seeded'
node vendor/neomorphic-correspondence/dist/migrate.js
npm run correspondence:migrate
npm run verified-feed:refresh -- --live --live-route-limit 1
```

Reasons:

| Path fragment | Reason |
| --- | --- |
| `/extract` / `/extract/batch` | Paid gateway; charge is not useful output |
| `tools/call` + `generate_complete_fix_pack` | Paid Fix Pack |
| `license` / `cs_` / `/mcp?cs=` | Stripe checkout-session redemption |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` | Settlement credential |
| HTTP 402 amount `5000` treated as paid | Challenge is not settlement |
| `vendor/neomorphic*` / `correspondence:migrate` / `neo.agent_task_kit` | Neomorphic / neo-kernel-vendor out of scope |
| MCP Registry POST / new version | Publish |
| `--live` paid gateway probes | Live merchant pay |

`tools/list` is not demand. A Fix Pack buy URL in the paid tool
description is not permission to open it. useful-jobs
`purchaseAuthority: false` means the archive is not a hosted paid
runner. Catalog amount `"5000"` is six-decimal atomic USDC (0.005
display), not dollars, and not a completed transfer.

`tools/offer-routing/fixtures/supplied-issue-brief.job.json` routes to
`neo.agent_task_kit`. That selection is a matrix fact. This how-to
does not download or execute it.

## Related in-repo artifacts

- `tools/presence/FOR-AGENTS-COLD-READ.md` and `for-agents-cold-read.mjs`
- `tools/presence/fixtures/for-agents-cold-read/capture.json` (digest pins)
- `tools/offer-routing/README.md` and `capability-limits-matrix.json`
- `tools/offer-routing/fixtures/page-change-evidence.job.json`
- `tools/offer-routing/fixtures/complete-issue-discussion.job.json`
- `tools/result-reuse/README.md` (preview default; export needs `--opt-in`)
- `server/routes/mcp.js` (apex Streamable HTTP MCP)
- `server/lib/mcp-tool-inventory.js` (five names)
- `fixtures/presence/catalog/x402.json` (23 origin routes; `/extract` amount `5000`)
- `fixtures/verified-feed/observations/extract-current.json` (unpaid 402)
- `fixtures/buyer-runtimes/agent402/states/stop.json` (no wallet, no settle)
- `client/public/discovery/useful-jobs.json` (1.4.7 pin)
- `README.md` (public unpaid entry)
- `scripts/public-entry.test.mjs` (cited-command gate)

## Bounds

In scope: offline fixture cold-read, unpaid offer routing,
complete-issue honest miss, apex MCP source pin without `tools/call`,
unpaid 402 catalog amount pin, buyer-runtime unpaid stop, useful-jobs
discovery pin, result-reuse preview, named refusals, result-reuse
export without `--opt-in` as a write refuse.

Out of scope: `tools/call` (free or paid), wallets, payment headers,
facilitator settle, Stripe checkout, price or SKU edits, MCP Registry
writes, `vendor/neomorphic*`, `neomorphic.io`, neo-kernel-vendor,
`--live` paid gateway probes, extracting or running the useful-jobs
tarball from this doc, treating HTTP 402 as settlement.
