# How to list SameDayDesk well-known skills (unpaid)

Use this when you have a cold clone of `epistemedeus/samedaydesk` and the
goal is **skills inventory only**: read the committed
`/.well-known/skills/index.json` fixture, name the three SDS skills, then
**stop**. Do not settle. Do not publish. Do not follow Neomorphic.

This is a Diátaxis how-to for wave **w0-x103**. It is not the unpaid apex
MCP `initialize` / `tools/list` inventory, not JSON-RPC `skills/list`
(SEP-2640), not the unpaid local-work / public-entry how-tos, and not a
license-redemption guide.

Audience: an agent on a cold clone. Node **22.x**. No `npm install`.
Run every command from the repository root.

## Boundary

The well-known skills index is **catalog metadata**, not a bill. Listing
`web-extract` is not permission to `GET`/`POST` `/extract`. `page-change`
and `explicit-record` require already-held JSON. `executionAuthorized` is
always false on this path.

HTTP `https://agents.samedaydesk.com/.well-known/skills/index.json` is
not JSON-RPC `skills/list`. Apex MCP `tools/list` is a **different**
inventory (`check_ai_readiness`, `generate_complete_fix_pack`,
`plan_taskmarket_delegation`, `browse_taskmarket_tasks`,
`track_taskmarket_task`). Do not treat either MCP method as this how-to.

| Surface | Unpaid list? | This how-to |
| --- | --- | --- |
| `resolveForAgentsColdRead({ preferFixture: true })` skills source | Yes (offline fixture) | Required |
| Committed `tools/presence/fixtures/for-agents-cold-read/skills-index.json` | Yes | Required |
| `route-job.mjs` on `page-change-evidence` (skill `page-change`) | Yes (local SDS offer) | Required (list ≠ pay) |
| `routeJob({ type: "bounded_html_observation", constraints: ["no_payment"] })` | Refusal of paid extract | Required |
| `route-job.mjs` on `complete_issue_discussion` | Refusal is the product | Required (do not “fix” with `/extract`) |
| Live `GET` of `/.well-known/skills/index.json` | Yes, optional | Out of scope here |
| JSON-RPC `skills/list` (SEP-2640) | Different method | Refuse (seeded) |
| Apex MCP `tools/list` | Different inventory | Named, not this list |
| `tools/call` / `GET` / `POST` `/extract` | Paid or invocation | Refuse before request |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` / Stripe `cs_` | Settlement / checkout | Refuse |
| `vendor/neomorphic*` / `neomorphic.io` / `neo.*` offers | Other product | Refuse |
| MCP Registry publish / `version=latest` write | Publish | Refuse |

Wave **w0-x103** pins the committed skills-index fixture. It does not
invent a new paid SKU.

Committed pins (load-bearing):

| Pin | Value |
| --- | --- |
| Fixture capture | `2026-09-09T20:55:00.000Z` (worker-reported, not live) |
| `agents_llms` SHA-256 | `95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d` |
| `agents_skills_index` SHA-256 | `a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564` |
| Skills listed | `web-extract`, `page-change`, `explicit-record` |
| Each skill files | `SKILL.md` |
| Page-change offer | `sdd.page_change_offline` (`payment: none`) |
| Complete-discussion warning | `complete_issue_acquisition_unavailable` |
| No-pay bounded HTML reject | `sdd.paid_html_extract` / `constraint_no_payment` |
| Unknown fixture helper | `unknown_fixture` (exit 1) |

`web-extract` describes paid `/extract` and `/extract/batch`. Listing it
is not permission to pay. `page-change` says to compare already-held
snapshots **without fetching, paying**. `explicit-record` says **do not
fetch, pay**, and not to treat payment as useful output.

An empty `skills: []` body is not a successful list. A missing
`web-extract` is a refuse, not a partial success. Do not send
`PAYMENT-SIGNATURE`, `X-PAYMENT`, `stripe-signature`, or `Authorization`.
Do not open `/api/checkout` or Stripe Payment Links. Do not run
`npm run correspondence:migrate`. Do not POST `tools/call` or
`skills/list`.

## Cold run (offline, unpaid)

This command reads committed fixtures only. It sends no HTTP, no
payment header, and does not invoke a skill. Expected
`complete_issue_discussion` routing is `ok: false` with `selected: null`;
that refusal is success for this how-to (the CLI of `route-job.mjs`
exits 2 for the same fixture; this wrapper exits 0 when the refusal
matches). Expected `bounded_html_observation` with `no_payment` is
`ok: false` because paid extract is the only matching offer.

```bash
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveForAgentsColdRead, sha256File } from "./tools/presence/for-agents-cold-read.mjs";
import { routeJob, routeJobFromFile } from "./tools/offer-routing/route-job.mjs";
import { MCP_TOOL_NAMES } from "./server/lib/mcp-tool-inventory.js";

const WAVE = "w0-x103";
const SKILLS_SHA =
  "a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564";
const LLMS_SHA =
  "95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d";
const SKILL_NAMES = ["web-extract", "page-change", "explicit-record"];
const MCP_TOOL_INVENTORY = [
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
];
const SKILLS_URL = "https://agents.samedaydesk.com/.well-known/skills/index.json";

const discovery = await resolveForAgentsColdRead({ preferFixture: true });
assert.equal(discovery.outcome, "offline_fixture");
assert.equal(discovery.paid, false);
assert.equal(discovery.liveObserved, false);
assert.equal(discovery.coverage, "partial_discovery_not_apex_guide");
assert.equal(discovery.sources.length, 2);

const llms = discovery.sources.find((s) => s.id === "agents_llms");
const skills = discovery.sources.find((s) => s.id === "agents_skills_index");
assert.equal(llms.sha256, LLMS_SHA);
assert.equal(skills.sha256, SKILLS_SHA);
assert.equal(skills.source, "fixture");
assert.equal(skills.captureAuthority, "worker_reported");
assert.equal(skills.capturedAt, "2026-09-09T20:55:00.000Z");
assert.equal(skills.url, SKILLS_URL);
assert.equal(sha256File("skills-index.json"), SKILLS_SHA);

const skillIndex = JSON.parse(skills.body);
assert.ok(Array.isArray(skillIndex.skills));
assert.equal(skillIndex.skills.length, 3);
assert.deepEqual(skillIndex.skills.map((s) => s.name), SKILL_NAMES);
assert.ok(skillIndex.skills.every((s) => Array.isArray(s.files) && s.files.includes("SKILL.md")));
assert.match(skillIndex.skills[0].description, /GET \/extract/);
assert.match(skillIndex.skills[0].description, /POST \/extract\/batch/);
assert.match(skillIndex.skills[1].description, /without fetching, paying/);
assert.match(skillIndex.skills[1].description, /Do not use to purchase a second observation/);
assert.match(skillIndex.skills[2].description, /Do not fetch, pay/);
assert.match(skillIndex.skills[2].description, /treat payment as useful output/);

assert.equal(skillIndex.skills.length === 0, false, "silent empty skills list is not success");
assert.ok(SKILL_NAMES.includes("web-extract"));

assert.deepEqual([...MCP_TOOL_NAMES], MCP_TOOL_INVENTORY);
for (const name of SKILL_NAMES) {
  assert.equal(MCP_TOOL_INVENTORY.includes(name), false, `${name} is a well-known skill, not an apex MCP tool`);
}
for (const name of MCP_TOOL_INVENTORY) {
  assert.equal(SKILL_NAMES.includes(name), false);
}

const pageChange = routeJobFromFile(
  "tools/offer-routing/fixtures/page-change-evidence.job.json",
);
assert.equal(pageChange.ok, true);
assert.equal(pageChange.paid, false);
assert.equal(pageChange.paymentRequired, false);
assert.equal(pageChange.executionAuthorized, false);
assert.equal(pageChange.selected.offerId, "sdd.page_change_offline");
assert.equal(pageChange.selected.payment, "none");
assert.equal(pageChange.selected.hosting, "offline_local");
assert.equal(
  pageChange.selected.publicSurface,
  SKILLS_URL,
);

const noPayHtml = routeJob({
  type: "bounded_html_observation",
  jobId: "w0-x103-no-pay",
  constraints: ["no_payment", "offline_preferred"],
});
assert.equal(noPayHtml.ok, false);
assert.equal(noPayHtml.selected, null);
assert.equal(noPayHtml.paid, false);
assert.equal(noPayHtml.executionAuthorized, false);
assert.equal(
  noPayHtml.rejected.some(
    (r) =>
      r.offerId === "sdd.paid_html_extract" && r.reason === "constraint_no_payment",
  ),
  true,
);

const completeIssue = routeJobFromFile(
  "tools/offer-routing/fixtures/complete-issue-discussion.job.json",
);
assert.equal(completeIssue.ok, false);
assert.equal(completeIssue.selected, null);
assert.equal(completeIssue.paid, false);
assert.equal(completeIssue.executionAuthorized, false);
assert.equal(
  completeIssue.warnings.includes("complete_issue_acquisition_unavailable"),
  true,
);
assert.equal(
  completeIssue.rejected.some(
    (r) =>
      r.offerId === "sdd.paid_html_extract" &&
      r.commonMistake === "paid_html_extraction_for_complete_issue_comments",
  ),
  true,
);

const app = readFileSync("server/app.js", "utf8");
assert.equal(app.includes("paymentMiddleware"), false);

let unknownFixtureCode = null;
try {
  sha256File("../../package.json");
} catch (err) {
  unknownFixtureCode = err?.message ?? String(err);
}
assert.equal(unknownFixtureCode, "unknown_fixture");

console.log(JSON.stringify({
  ok: true,
  wave: WAVE,
  surface: "sds-skills-list",
  quadrant: "howto",
  paid: false,
  liveMerchantPay: false,
  checkout: false,
  publish: false,
  neoKernelVendor: false,
  paymentAttempted: false,
  extractAttempted: false,
  toolsCalled: false,
  skillsListMethod: "well-known-index-fixture",
  mcpSkillsListPosted: false,
  discoveryOutcome: discovery.outcome,
  skillNames: SKILL_NAMES,
  skillCount: SKILL_NAMES.length,
  skillsSha256: SKILLS_SHA,
  skillsUrl: SKILLS_URL,
  captureAuthority: skills.captureAuthority,
  mcpToolNamesAreDifferentInventory: true,
  pageChangeOffer: pageChange.selected.offerId,
  noPayHtmlSelected: noPayHtml.selected,
  noPayHtmlReason: "constraint_no_payment",
  completeIssueSelected: completeIssue.selected,
  completeIssueWarning: "complete_issue_acquisition_unavailable",
  unknownFixtureRefused: unknownFixtureCode,
}, null, 2));
JS
```

Expected: exit **0** and JSON with `"ok": true`, `"wave": "w0-x103"`,
`"paid": false`, `"discoveryOutcome": "offline_fixture"`,
`"skillNames": ["web-extract", "page-change", "explicit-record"]`,
`"skillCount": 3`, `"pageChangeOffer": "sdd.page_change_offline"`,
`"noPayHtmlSelected": null`, `"completeIssueSelected": null`,
`"extractAttempted": false`, `"toolsCalled": false`,
`"mcpSkillsListPosted": false`, `"neoKernelVendor": false`,
`"unknownFixtureRefused": "unknown_fixture"`.

The same facts as separate public-entry commands (still no network, no
pay):

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json; echo "complete_issue_exit:$?"
```

Expected: fixture cold-read `outcome: "offline_fixture"`, `paid: false`,
skills source SHA-256
`a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564`,
names `web-extract`, `page-change`, `explicit-record`; page-change route
exit **0**, `ok: true`, `paid: false`,
`selected.offerId: "sdd.page_change_offline"`; complete-issue route
exit **2**, `ok: false`, `selected: null`,
`complete_issue_acquisition_unavailable`. Exit 2 on complete discussion
is the honest miss, not a license to buy `/extract`.

Existing unpaid suites (no `npm install`):

```bash
node --test tools/presence/for-agents-cold-read.test.mjs
node --test tools/offer-routing/route-job.test.mjs tools/offer-routing/review.test.mjs
```

## Seeded failure (required refusal)

The seed below is intentional. It asks this how-to to treat an **empty**
skills array as a successful list, or to treat listing `web-extract` as a
paid `/extract` settlement. Do not “fix” it by posting extract, attaching
`PAYMENT-SIGNATURE`, POSTing `tools/call` or `skills/list`, or opening
Stripe.

```bash
SDS_HOWTO_SEED="${SDS_HOWTO_SEED:-silent-empty-success}" node --input-type=module <<'JS'
const WAVE = "w0-x103";
const FORBIDDEN_HEADERS = ["PAYMENT-SIGNATURE", "X-PAYMENT", "stripe-signature", "Authorization"];
const PAYMENT_STOP_PATHS = [
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
  "https://agents.samedaydesk.com/extract",
  "https://agents.samedaydesk.com/extract/batch",
];
const NEO_STOP = [
  "vendor/neomorphic-correspondence",
  "neo-kernel-vendor",
  "neomorphic.io",
  "neo.agent_task_kit",
  "npm run correspondence:migrate",
];
const REQUIRED_SKILLS = ["web-extract", "page-change", "explicit-record"];
const KNOWN = [
  "silent-empty-success",
  "missing-skill",
  "paid-extract",
  "payment-signature",
  "stripe-path",
  "registry-publish",
  "neo-kernel-vendor",
  "tools-call",
  "mcp-skills-list",
  "wellknown-as-payment",
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
    extractAttempted: false,
    publishAttempted: false,
    neoKernelVendor: false,
    toolsCalled: false,
    checkout: false,
    ...extra,
  };
  console.log(JSON.stringify(body, null, 2));
  console.error(message);
  process.exit(1);
}

const seed = process.env.SDS_HOWTO_SEED || "silent-empty-success";
if (seed === "silent-empty-success") {
  fail(
    "SILENT_EMPTY",
    "empty skills array is not a successful SDS skills list; required web-extract, page-change, explicit-record",
    { seed, required: REQUIRED_SKILLS, listed: [], neverPostedExtract: true },
  );
}
if (seed === "missing-skill") {
  fail(
    "MISSING_SKILL",
    "skills list missing required web-extract is a refuse, not a partial success",
    { seed, required: REQUIRED_SKILLS, missing: "web-extract" },
  );
}
if (seed === "paid-extract" || seed === "wellknown-as-payment") {
  fail(
    "PAID_EXTRACT_REFUSE",
    "listing web-extract in /.well-known/skills/index.json is not permission to GET/POST /extract; skills-list does not settle",
    {
      seed,
      neverPostedExtract: true,
      warning: "complete_issue_acquisition_unavailable",
      commonMistake: "paid_html_extraction_for_complete_issue_comments",
    },
  );
}
if (seed === "payment-signature") {
  fail(
    "PAYMENT_HEADER_REFUSE",
    "payment headers are forbidden on SDS skills-list",
    { seed, forbidden: FORBIDDEN_HEADERS, headerNeverSent: true },
  );
}
if (seed === "stripe-path") {
  fail(
    "STRIPE_PATH_REFUSE",
    "refusing Stripe/checkout path in SDS skills-list: /api/checkout",
    { seed, path: "/api/checkout", stops: PAYMENT_STOP_PATHS, neverOpenedCheckout: true },
  );
}
if (seed === "registry-publish") {
  fail(
    "REGISTRY_PUBLISH_REFUSE",
    "MCP Registry publish is a kill condition for SDS skills-list",
    { seed, publishAttempted: false },
  );
}
if (seed === "neo-kernel-vendor") {
  fail(
    "NEO_VENDOR_REFUSE",
    "neomorphic/neo-kernel-vendor is out of scope for SDS skills-list",
    { seed, stops: NEO_STOP },
  );
}
if (seed === "tools-call") {
  fail(
    "TOOLS_CALL_REFUSE",
    "MCP tools/call is out of scope for skills-list; listing skills is not a tool invocation",
    { seed, forbiddenMethod: "tools/call", toolsCalled: false },
  );
}
if (seed === "mcp-skills-list") {
  fail(
    "MCP_SKILLS_LIST_REFUSE",
    "HTTP /.well-known/skills/index.json is not JSON-RPC skills/list (SEP-2640); this how-to lists the committed catalog, it does not POST skills/list",
    { seed, mcpSkillsListPosted: false, skillsListMethod: "well-known-index-fixture" },
  );
}
fail("UNKNOWN_SEED", `unknown seeded failure: ${seed}`, { seed, known: KNOWN });
JS
echo "seeded_exit:$?"
```

Expected: the Node process exits **1**. Stdout is JSON with
`"ok": false`, `"rejected": true`, `"code": "SILENT_EMPTY"`,
`"neverPostedExtract": true`, `"paymentAttempted": false`,
`"listed": []`. Stderr matches
`empty skills array is not a successful SDS skills list; required web-extract, page-change, explicit-record`.
`seeded_exit:1`.

Replay other named refusals with the same fence:

| `SDS_HOWTO_SEED` | Exit | `code` |
| --- | --- | --- |
| `silent-empty-success` (default) | 1 | `SILENT_EMPTY` |
| `missing-skill` | 1 | `MISSING_SKILL` |
| `paid-extract` | 1 | `PAID_EXTRACT_REFUSE` |
| `wellknown-as-payment` | 1 | `PAID_EXTRACT_REFUSE` |
| `payment-signature` | 1 | `PAYMENT_HEADER_REFUSE` |
| `stripe-path` | 1 | `STRIPE_PATH_REFUSE` |
| `registry-publish` | 1 | `REGISTRY_PUBLISH_REFUSE` |
| `neo-kernel-vendor` | 1 | `NEO_VENDOR_REFUSE` |
| `tools-call` | 1 | `TOOLS_CALL_REFUSE` |
| `mcp-skills-list` | 1 | `MCP_SKILLS_LIST_REFUSE` |
| `not-a-real-id` | 1 | `UNKNOWN_SEED` |

A second seed hits a **real in-repo refuse**: listing `web-extract` does
not acquire a complete GitHub issue discussion. Do not “fix” exit 2 by
posting `/extract`.

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json
echo "complete_issue_exit:$?"
```

Expected: exit **2**, `ok: false`, `selected: null`,
`complete_issue_acquisition_unavailable`, `paid: false`,
`executionAuthorized: false`. The common mistake
`paid_html_extraction_for_complete_issue_comments` is avoided.

A third seed: the cold-read helper refuses an unknown fixture path
instead of hashing arbitrary files.

```bash
node --input-type=module -e 'import {sha256File} from "./tools/presence/for-agents-cold-read.mjs"; sha256File("../../package.json")'
echo "unknown_fixture_exit:$?"
```

Expected: exit **1**, stderr `unknown_fixture`. That is integrity, not a
reason to fetch the live skills index or to pay.

## Do not run (wrong path for this how-to)

These are named so they can be refused. Do not execute them from this doc.

```text
curl -sS https://agents.samedaydesk.com/.well-known/skills/index.json
curl -sS -H 'PAYMENT-SIGNATURE: e30=' \
  'https://agents.samedaydesk.com/extract?url=https://github.com/modelcontextprotocol/servers/issues/4785'
curl -sS -H 'content-type: application/json' \
  -d '{"urls":["https://github.com/modelcontextprotocol/servers/issues/4785"]}' \
  https://agents.samedaydesk.com/extract/batch
curl -sS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"generate_complete_fix_pack","arguments":{"url":"https://example.com"}}}' \
  https://samedaydesk.com/mcp
curl -sS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"skills/list","params":{}}' \
  https://samedaydesk.com/mcp
curl -sS -H 'PAYMENT-SIGNATURE: e30=' https://samedaydesk.com/mcp
curl -sS 'https://samedaydesk.com/mcp?cs=cs_test_seeded'
node vendor/neomorphic-correspondence/dist/migrate.js
npm run correspondence:migrate
```

Reasons:

| Path fragment | Reason |
| --- | --- |
| Live `GET` `/.well-known/skills/index.json` | Optional network; this how-to pins the fixture |
| `/extract` or `/extract/batch` | Paid gateway; listing `web-extract` is not demand |
| `tools/call` | Invocation; skills-list is inventory only |
| JSON-RPC `skills/list` | Different method (SEP-2640), not this catalog |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` | Settlement credential |
| `cs_` / `/mcp?cs=` / `/api/checkout` | Stripe checkout-session redemption |
| `vendor/neomorphic*` / `correspondence:migrate` / `neo.agent_task_kit` | Neomorphic / neo-kernel-vendor out of scope |
| MCP Registry POST / new version | Publish |

`tools/offer-routing/fixtures/supplied-issue-brief.job.json` routes to
`neo.agent_task_kit`. That selection is a matrix fact. This how-to does
not download or execute it.

Listing `web-extract` is not demand. A Fix Pack buy URL or Stripe Payment
Link is not permission to open it. An empty or truncated skills body is
not a successful list.

## Related in-repo artifacts

- `tools/presence/FOR-AGENTS-COLD-READ.md` (apex TLS friction; unpaid alternates)
- `tools/presence/fixtures/for-agents-cold-read/skills-index.json` (the list)
- `tools/presence/fixtures/for-agents-cold-read/capture.json` (digest pins)
- `tools/offer-routing/README.md` and `capability-limits-matrix.json`
- `tools/offer-routing/fixtures/page-change-evidence.job.json`
- `tools/offer-routing/fixtures/complete-issue-discussion.job.json`
- `server/lib/mcp-tool-inventory.js` (apex MCP names; not this list)
- `README.md` (public-entry unpaid examples)

## Bounds

In scope: offline fixture skills list, SHA-256 pin, three named skills,
local SDS page-change routing as unpaid proof that listing is not
settlement, expected complete-discussion refusal, `no_payment` refusal
of paid extract, named refusals, unknown-fixture refuse.

Out of scope: live HTTP, JSON-RPC `skills/list`, MCP `tools/list` as this
catalog, `tools/call`, wallets, `PAYMENT-SIGNATURE`, facilitator settle,
Stripe checkout, price or SKU edits, MCP Registry writes,
`vendor/neomorphic*`, `neomorphic.io`, neo-kernel-vendor, `--live`
paid gateway probes.
