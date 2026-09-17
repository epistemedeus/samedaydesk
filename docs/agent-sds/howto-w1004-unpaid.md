# How to run SameDayDesk unpaid local work (w1004)

Use this when you have a cold clone of `epistemedeus/samedaydesk` and the
goal is **unpaid local SDS work only**: offline for-agents discovery,
no-pay offer routing, a fixture recipe compare, and a result-reuse
**preview**. Do not settle. Do not publish. Do not follow Neomorphic
products named by the matrix.

This is a Diátaxis how-to for wave **w1004**. It is not the unpaid MCP
`initialize` / `tools/list` inventory, not the “HTTP 402 is not
settlement” evidence how-to, not the w904 public-entry how-to, and not a
license-redemption guide.

Audience: an agent on a cold clone. Node **22.x**. No `npm install`.
Run every command from the repository root.

## Boundary

Paid routes in the free catalogs are **catalog metadata**, not a bill.
Routing `paid: false` is advice, not execution. `executionAuthorized` is
always false on this path. A sourced `/extract/batch` list price is not
invoked by the unpaid recipe fixture.

| Surface | Unpaid? | This how-to |
| --- | --- | --- |
| `resolveForAgentsColdRead({ preferFixture: true })` | Yes (offline fixture) | Required |
| `route-job.mjs` on `page-change-evidence` | Yes (local SDS offer) | Required |
| `routeJob({ type: "bounded_html_observation", constraints: ["no_payment"] })` | Refusal of paid extract | Required |
| `route-job.mjs` on `complete_issue_discussion` | Refusal is the product | Required (do not “fix” with `/extract`) |
| Recurring `source-change-alert` on committed fixtures | Yes (no merchant charge) | Required |
| `result-reuse` `preview` of already-held JSON | Yes (no write) | Required |
| Live `resolveForAgentsColdRead()` (free HTTP) | Yes, optional | Out of scope here |
| Recipe `--live-safe` / `--live-url` | Free HTTP, not this wave | Out of scope here |
| `GET` / `POST` `https://agents.samedaydesk.com/extract` | Paid gateway | Refuse before request |
| `--replay-payment` against a prior receipt | Settlement replay | Refuse (seeded failure) |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` / Stripe `cs_` | Settlement / checkout | Refuse |
| `vendor/neomorphic*` / `neomorphic.io` / `neo.*` offers | Other product | Refuse |
| MCP Registry publish / `version=latest` write | Publish | Refuse |
| useful-jobs 1.4.7 archive download | Free local package | Named, not executed here |

Wave **w1004** pins the committed discovery fixtures, the local
capability matrix, and the unpaid recipe payment-guard. It does not
invent a new paid SKU.

Committed pins (load-bearing):

| Pin | Value |
| --- | --- |
| Fixture capture | `2026-09-09T20:55:00.000Z` (worker-reported, not live) |
| `agents_llms` SHA-256 | `95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d` |
| `agents_skills_index` SHA-256 | `a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564` |
| Skills listed | `web-extract`, `page-change`, `explicit-record` |
| Page-change offer | `sdd.page_change_offline` (`payment: none`) |
| Complete-discussion warning | `complete_issue_acquisition_unavailable` |
| No-pay bounded HTML reject | `sdd.paid_html_extract` / `constraint_no_payment` |
| Recipe unpaid fixture | `source-change-alert` → `outcome: "unchanged"`, `payment.attempted: false` |
| Replay refuse | `payment_replay_blocked` (exit 1, `attempted: false`) |
| useful-jobs 1.4.7 SHA-256 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| useful-jobs bytes | `5255824` |

`web-extract` in the skills index describes paid `/extract` and
`/extract/batch`. Listing it is not permission to pay. `page-change`
and `explicit-record` require already-held JSON.

Do not send `PAYMENT-SIGNATURE`, `X-PAYMENT`, `stripe-signature`, or
`Authorization`. Do not open `/api/checkout` or Stripe Payment Links.
Do not run `npm run correspondence:migrate`. Do not pass `--replay-payment`.

## Cold run (offline, unpaid)

This command reads committed fixtures only. It sends no HTTP, no
payment header, and does not write a reuse observation. Expected
`complete_issue_discussion` routing is `ok: false` with `selected: null`;
that refusal is success for this how-to (the CLI of `route-job.mjs`
exits 2 for the same fixture; this wrapper exits 0 when the refusal
matches). Expected `bounded_html_observation` with `no_payment` is
`ok: false` because paid extract is the only matching offer.

```bash
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveForAgentsColdRead } from "./tools/presence/for-agents-cold-read.mjs";
import { routeJob, routeJobFromFile } from "./tools/offer-routing/route-job.mjs";
import { previewReuse } from "./tools/result-reuse/src/export.mjs";
import { runRecipe } from "./tools/recurring-job-recipes/lib/run.mjs";

const WAVE = "w1004";
const LLMS_SHA =
  "95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d";
const SKILLS_SHA =
  "a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564";
const USEFUL_JOBS_SHA =
  "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec";
const SKILL_NAMES = ["web-extract", "page-change", "explicit-record"];
const CLOCK = "2026-09-17T00:00:00Z";
const RECIPE_CLOCK = "2026-09-09T15:00:00.000Z";

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
assert.equal(llms.source, "fixture");
assert.equal(skills.captureAuthority, "worker_reported");
const skillIndex = JSON.parse(skills.body);
assert.deepEqual(skillIndex.skills.map((s) => s.name), SKILL_NAMES);
assert.match(skillIndex.skills[0].description, /GET \/extract/);
assert.match(skillIndex.skills[1].description, /without fetching, paying/);

const pageChange = routeJobFromFile(
  "tools/offer-routing/fixtures/page-change-evidence.job.json",
);
assert.equal(pageChange.ok, true);
assert.equal(pageChange.paid, false);
assert.equal(pageChange.paymentRequired, false);
assert.equal(pageChange.executionAuthorized, false);
assert.equal(pageChange.criteriaAssessment, "not_evaluated");
assert.equal(pageChange.selected.offerId, "sdd.page_change_offline");
assert.equal(pageChange.selected.payment, "none");
assert.equal(pageChange.selected.hosting, "offline_local");
assert.equal(pageChange.executionMode, "local");

const noPayHtml = routeJob({
  type: "bounded_html_observation",
  jobId: "w1004-no-pay",
  constraints: ["no_payment", "offline_preferred"],
});
assert.equal(noPayHtml.ok, false);
assert.equal(noPayHtml.selected, null);
assert.equal(noPayHtml.paid, false);
assert.equal(noPayHtml.paymentRequired, false);
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
assert.equal(
  completeIssue.avoidedMistakes.includes(
    "paid_html_extraction_for_complete_issue_comments",
  ),
  true,
);

const recipe = await runRecipe("source-change-alert", {
  priorPath: "tools/recurring-job-recipes/fixtures/priors/source-change.prior.json",
  currentFixturePath:
    "tools/recurring-job-recipes/fixtures/current/example-unchanged.json",
  scheduleHint: "daily",
  clock: RECIPE_CLOCK,
  horizonHours: 168,
});
assert.equal(recipe.ok, true);
assert.equal(recipe.recipeId, "source-change-alert");
assert.equal(recipe.outcome, "unchanged");
assert.equal(recipe.payment.ok, true);
assert.equal(recipe.payment.attempted, false);
assert.equal(recipe.payment.replayBlocked, true);
assert.equal(recipe.payment.hasPriorReceipt, false);

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

const useful = JSON.parse(
  readFileSync("client/public/discovery/useful-jobs.json", "utf8"),
);
assert.equal(useful.version, "1.4.7");
assert.equal(useful.offline, true);
assert.equal(useful.purchaseAuthority, false);
assert.equal(useful.paidHostedClaim, false);
assert.equal(useful.sha256, USEFUL_JOBS_SHA);
assert.equal(useful.bytes, 5255824);

const app = readFileSync("server/app.js", "utf8");
assert.equal(app.includes("paymentMiddleware"), false);

console.log(JSON.stringify({
  ok: true,
  wave: WAVE,
  surface: "sds-unpaid-local-work",
  quadrant: "howto",
  paid: false,
  liveMerchantPay: false,
  checkout: false,
  publish: false,
  neoKernelVendor: false,
  paymentAttempted: false,
  extractAttempted: false,
  replayPayment: false,
  discoveryOutcome: discovery.outcome,
  skillNames: SKILL_NAMES,
  pageChangeOffer: pageChange.selected.offerId,
  noPayHtmlSelected: noPayHtml.selected,
  noPayHtmlReason: "constraint_no_payment",
  completeIssueSelected: completeIssue.selected,
  completeIssueWarning: "complete_issue_acquisition_unavailable",
  recipeId: recipe.recipeId,
  recipeOutcome: recipe.outcome,
  recipePaymentAttempted: recipe.payment.attempted,
  reuseMode: preview.mode,
  usefulJobsVersion: useful.version,
  usefulJobsSha256: USEFUL_JOBS_SHA,
}, null, 2));
JS
```

Expected: exit **0** and JSON with `"ok": true`, `"wave": "w1004"`,
`"paid": false`, `"discoveryOutcome": "offline_fixture"`,
`"pageChangeOffer": "sdd.page_change_offline"`,
`"noPayHtmlSelected": null`, `"completeIssueSelected": null`,
`"recipeOutcome": "unchanged"`, `"recipePaymentAttempted": false`,
`"reuseMode": "preview"`, `"extractAttempted": false`,
`"neoKernelVendor": false`.

The same facts as separate public-entry commands (still no network, no
pay):

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json; echo "complete_issue_exit:$?"
node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \
  --prior tools/recurring-job-recipes/fixtures/priors/source-change.prior.json \
  --current-fixture tools/recurring-job-recipes/fixtures/current/example-unchanged.json \
  --schedule daily --clock 2026-09-09T15:00:00.000Z --horizon 168
```

Expected: fixture cold-read `outcome: "offline_fixture"`, `paid: false`;
page-change route exit **0**, `ok: true`, `paid: false`; complete-issue
route exit **2**, `ok: false`, `selected: null`,
`complete_issue_acquisition_unavailable`; recipe fixture exit **0**,
`outcome: "unchanged"`, `payment.attempted: false`. Exit 2 on complete
discussion is the honest miss, not a license to buy `/extract`.

Existing unpaid suites (no `npm install`):

```bash
node --test scripts/public-entry.test.mjs
node --test tools/presence/for-agents-cold-read.test.mjs
node --test tools/offer-routing/route-job.test.mjs tools/offer-routing/review.test.mjs
```

## Seeded failure (required refusal)

The seed below is intentional. It asks this how-to to treat
`complete_issue_discussion` or a `no_payment` job as a paid `/extract`
settlement. Do not “fix” it by posting extract, attaching
`PAYMENT-SIGNATURE`, passing `--replay-payment`, or opening Stripe.

```bash
SDS_HOWTO_SEED="${SDS_HOWTO_SEED:-paid-extract}" node --input-type=module <<'JS'
const WAVE = "w1004";
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
const KNOWN = [
  "paid-extract",
  "payment-signature",
  "stripe-path",
  "registry-publish",
  "neo-kernel-vendor",
  "complete-issue-as-extract",
  "replay-payment",
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
    replayPayment: false,
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
    "complete_issue_discussion is not a reason to GET/POST /extract; unpaid w1004 does not settle",
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
    "payment headers are forbidden on unpaid w1004 local work",
    { seed, forbidden: FORBIDDEN_HEADERS, headerNeverSent: true },
  );
}
if (seed === "stripe-path") {
  fail(
    "STRIPE_PATH_REFUSE",
    "refusing Stripe/checkout path in unpaid w1004: /api/checkout",
    { seed, path: "/api/checkout", stops: PAYMENT_STOP_PATHS, neverOpenedCheckout: true },
  );
}
if (seed === "registry-publish") {
  fail(
    "REGISTRY_PUBLISH_REFUSE",
    "MCP Registry publish is a kill condition for unpaid w1004",
    { seed, publishAttempted: false },
  );
}
if (seed === "neo-kernel-vendor") {
  fail(
    "NEO_VENDOR_REFUSE",
    "neomorphic/neo-kernel-vendor is out of scope for SDS unpaid w1004",
    { seed, stops: NEO_STOP },
  );
}
if (seed === "replay-payment") {
  fail(
    "PAYMENT_REPLAY_REFUSE",
    "recipes never automatically replay payment; unpaid w1004 does not settle",
    { seed, evidenceCode: "payment_replay_blocked", neverReplayed: true },
  );
}
fail("UNKNOWN_SEED", `unknown seeded failure: ${seed}`, { seed, known: KNOWN });
JS
echo "seeded_exit:$?"
```

Expected: the Node process exits **1**. Stdout is JSON with
`"ok": false`, `"rejected": true`, `"code": "PAID_EXTRACT_REFUSE"`,
`"neverPostedExtract": true`, `"paymentAttempted": false`. Stderr matches
`complete_issue_discussion is not a reason to GET/POST /extract; unpaid w1004 does not settle`.
`seeded_exit:1`.

Replay other named refusals with the same fence:

| `SDS_HOWTO_SEED` | Exit | `code` |
| --- | --- | --- |
| `paid-extract` (default) | 1 | `PAID_EXTRACT_REFUSE` |
| `complete-issue-as-extract` | 1 | `PAID_EXTRACT_REFUSE` |
| `payment-signature` | 1 | `PAYMENT_HEADER_REFUSE` |
| `stripe-path` | 1 | `STRIPE_PATH_REFUSE` |
| `registry-publish` | 1 | `REGISTRY_PUBLISH_REFUSE` |
| `neo-kernel-vendor` | 1 | `NEO_VENDOR_REFUSE` |
| `replay-payment` | 1 | `PAYMENT_REPLAY_REFUSE` |
| `not-a-real-id` | 1 | `UNKNOWN_SEED` |

A second seed hits a **real in-repo refuse**: recipe `--replay-payment`
against a prior that already holds payment evidence. Do not drop the
flag and “fix” it by charging.

```bash
node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \
  --prior tools/recurring-job-recipes/fixtures/priors/source-change-paid.prior.json \
  --current-fixture tools/recurring-job-recipes/fixtures/current/example-unchanged.json \
  --replay-payment \
  --clock 2026-09-09T15:00:00.000Z
echo "replay_payment_exit:$?"
```

Expected: exit **1**, `ok: false`, `outcome: "error"`,
`evidence.code: "payment_replay_blocked"`, `payment.attempted: false`,
`payment.replayBlocked: true`. The prior file is not rewritten.

A third seed: result-reuse **export without `--opt-in`**. Preview is
the unpaid default. Do not “fix” a missing opt-in by writing.

```bash
node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 \
  --clock "2026-09-17T00:00:00Z" \
  --out /tmp/w1004-must-not-write.json; echo "export_without_opt_in_exit:$?"
```

Expected: exit **1**, stderr JSON `ok: false` with
`refusing to write without --opt-in; preview first and inspect included/omitted`.
No observation file is required. Do not retry with `--opt-in` from this
how-to.

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
curl -sS -H 'PAYMENT-SIGNATURE: e30=' https://samedaydesk.com/mcp
curl -sS 'https://samedaydesk.com/mcp?cs=cs_test_seeded'
node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \
  --prior tools/recurring-job-recipes/fixtures/priors/source-change-paid.prior.json \
  --current-fixture tools/recurring-job-recipes/fixtures/current/example-unchanged.json \
  --replay-payment --clock 2026-09-09T15:00:00.000Z
node vendor/neomorphic-correspondence/dist/migrate.js
npm run correspondence:migrate
npm run verified-feed:refresh -- --live --live-route-limit 1
```

Reasons:

| Path fragment | Reason |
| --- | --- |
| `/extract` or `/extract/batch` | Paid gateway; not complete issue comments |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` | Settlement credential |
| `cs_` / `/mcp?cs=` / `/api/checkout` | Stripe checkout-session redemption |
| `--replay-payment` | Automatic payment replay is blocked |
| `vendor/neomorphic*` / `correspondence:migrate` / `neo.agent_task_kit` | Neomorphic / neo-kernel-vendor out of scope |
| `--live` verified-feed | Live observation, not this unpaid boundary |
| MCP Registry POST / new version | Publish |

`tools/offer-routing/fixtures/supplied-issue-brief.job.json` routes to
`neo.agent_task_kit`. That selection is a matrix fact. This how-to does
not download or execute it.

Listing `web-extract` is not demand. A Fix Pack buy URL or Stripe Payment
Link is not permission to open it. Recipe cost notes that cite
`0.01 USDC` for `/extract/batch` are sourced list prices, not a purchase.

## Related in-repo artifacts

- `tools/presence/FOR-AGENTS-COLD-READ.md` (apex TLS friction; unpaid alternates)
- `tools/presence/fixtures/for-agents-cold-read/capture.json` (digest pins)
- `tools/offer-routing/README.md` and `capability-limits-matrix.json`
- `tools/offer-routing/fixtures/page-change-evidence.job.json`
- `tools/offer-routing/fixtures/complete-issue-discussion.job.json`
- `tools/recurring-job-recipes/README.md` (fixture dry-runs; never `--replay-payment`)
- `tools/recurring-job-recipes/lib/payment-guard.mjs` (`payment_replay_blocked`)
- `tools/result-reuse/README.md` (preview default; export needs `--opt-in`)
- `client/public/discovery/useful-jobs.json` (offline 1.4.7 pin)
- `README.md` (public-entry unpaid examples)
- `scripts/public-entry.test.mjs` (cited-command gate)

## Bounds

In scope: offline fixture cold-read, local SDS offer routing, expected
complete-discussion refusal, `no_payment` refusal of paid extract,
unpaid recipe fixture compare, result-reuse preview, named refusals,
`--replay-payment` refuse, committed useful-jobs pin.

Out of scope: live HTTP, wallets, `PAYMENT-SIGNATURE`, facilitator
settle, Stripe checkout, price or SKU edits, MCP Registry writes,
`vendor/neomorphic*`, `neomorphic.io`, neo-kernel-vendor, `--live`
paid gateway probes, `tools/call`, useful-jobs archive extract,
recipe `--live-safe`.
