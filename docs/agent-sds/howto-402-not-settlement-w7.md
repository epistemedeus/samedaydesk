# How to keep HTTP 402 from being treated as settlement (W7)

Use this when an unpaid x402 challenge, a `PAYMENT-REQUIRED` body, a
verified-feed unpaid-402 row, or an Agent402 paywall probe is being read as
payment completed, banked USDC, or on-chain settlement.

This is a boundary howto. It does not pay, settle, publish, migrate
Neomorphic trees, or run `--live`.

Audience: an agent on a cold clone of `epistemedeus/samedaydesk`. Node **22.x**.
No `npm install`. Run every command from the repository root.

## Boundary

HTTP 402 is the unpaid offer. Settlement is a later paid path this howto
does not execute.

| Observation | Settlement? | What it actually is |
| --- | --- | --- |
| HTTP 402 + `PAYMENT-REQUIRED` on `GET /extract` | No | Unpaid x402 challenge (contract terms only) |
| Buyer-runtime `contract.expectedStatus = 402` | No | Pinned unpaid challenge |
| Buyer-runtime `stop.reason = "no wallet"` | No | Replay ended before sign, retry, verify, or settle |
| Verified-feed `price.source = live_unpaid_402` | No | Inspection row. Not a certificate |
| Agent402 `paywall.status = 402` | No | Paywall liveness |
| Agent402 `routerDispatchReason = settlement_required` | No | Their spend gate: on-chain settlement is below their floor. Crawl health can still be 1 |
| Banked rows in `tools/evidence-records/fixtures/settlements/` | Those rows are typed settlement observations | Separate records with `settlement.transaction` and buyer class. Not 402 bodies |
| `x402_facilitator_settlement` evidence | Provider-returned settle window | Must list `provider_response_is_chain_settlement` as a *prohibited* inference |

`GET /commerce/settlement-proof` is itself a paid product (`0.005` USDC,
operation `verifyBaseUsdcSettlement`). An unpaid call to that route is still
HTTP 402. It does not prove a prior transfer.

Apex `server/app.js` does not host `paymentMiddleware`. The paid gateway is
`https://agents.samedaydesk.com`, not this marketing process.

## Cold run (offline, unpaid)

This command reads committed fixtures only. It sends no HTTP, no
`PAYMENT-SIGNATURE`, no `X-PAYMENT`, and no wallet.

```bash
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRuntime } from "./tools/buyer-runtimes/lib.mjs";
import { reconcileDir } from "./tools/evidence/reconcile.mjs";

const agent = loadRuntime("agent402");
const coinbase = loadRuntime("coinbase-x402");
const a402 = JSON.parse(
  readFileSync("docs/lqdist1-distribution-audit/evidence/agent402-seller-bounded.json", "utf8"),
);
const app = readFileSync("server/app.js", "utf8");
const x402Readme = readFileSync("client/public/x402/README.md", "utf8");
const report = reconcileDir();

assert.equal(agent.states.contract.expectedStatus, 402);
assert.equal(coinbase.states.contract.expectedStatus, 402);
assert.equal(agent.states.stop.reason, "no wallet");
assert.equal(coinbase.states.stop.reason, "no wallet");
assert.match(agent.states.stop.recorded, /no PAYMENT-SIGNATURE/i);
assert.match(agent.states.stop.recorded, /no facilitator verify or settle/i);
assert.deepEqual(agent.states.construct.forbiddenHeaders, [
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "Authorization",
]);
assert.equal(a402.paywall.status, 402);
assert.equal(a402.paywall.ok, true);
assert.equal(a402.health, 1);
assert.equal(a402.routable, true);
assert.equal(a402.routerDispatchEligible, false);
assert.equal(a402.routerDispatchReason, "settlement_required");
assert.equal(app.includes("paymentMiddleware"), false);
assert.match(x402Readme, /Inspection evidence only\. Not a certificate/);
assert.equal(report.ok, true);
assert.equal(report.table.citedBankedUsdc, "8.105");
assert.equal(report.table.computedUsdc, "8.105");
assert.notEqual(report.table.citedBankedUsdc, "0.005");

const independent = report.table.rows.find((row) => row.buyerClass === "independent");
assert.ok(independent);
assert.equal(
  independent.operations.some((item) => item.operationId === "what-agents-buy-independent-benchmark-2026-08-30"),
  true,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      boundary: "402_is_not_settlement",
      contractExpectedStatus: agent.states.contract.expectedStatus,
      stopReason: agent.states.stop.reason,
      paywallStatus: a402.paywall.status,
      routerDispatchReason: a402.routerDispatchReason,
      routerDispatchEligible: a402.routerDispatchEligible,
      paymentMiddlewarePresent: false,
      citedBankedUsdc: report.table.citedBankedUsdc,
      unpaid402QuoteUsd: "0.005",
      bankedTotalEqualsUnpaid402Quote: false,
    },
    null,
    2,
  ),
);
JS
```

Expected: exit 0 and `ok: true`, `boundary: "402_is_not_settlement"`,
`contractExpectedStatus: 402`, `stopReason: "no wallet"`, `paywallStatus: 402`,
`routerDispatchReason: "settlement_required"`, `routerDispatchEligible: false`,
`citedBankedUsdc: "8.105"`, `bankedTotalEqualsUnpaid402Quote: false`.

The same facts are covered by the existing unpaid suites. Do not drop
`SKIP_LIVE_BUYER_REPLAY=1`; live unpaid replay is optional and still not
settlement.

```bash
SKIP_LIVE_BUYER_REPLAY=1 node --test tools/buyer-runtimes/test.mjs
node tools/evidence/reconcile.mjs --pretty
node tools/evidence-records/validate.mjs --suite
node --test tools/lqdist1-distribution-audit/test.mjs
```

`reconcile.mjs` totals typed settlement fixtures only. It does not read 402
bodies. The golden cited total is `8.105` USDC. The unpaid extract quote is
`0.005`. Those numbers must not be collapsed.

## Seeded failure (required refusal)

The seed below is intentional. It claims an unpaid HTTP 402 challenge is an
`x402_facilitator_settlement` and omits the required prohibited inference
`provider_response_is_chain_settlement`. Do not "fix" the seed by paying.

```bash
SEED="$(mktemp)"
node --input-type=module <<'JS' >"$SEED"
import { readFileSync } from "node:fs";
const record = JSON.parse(
  readFileSync("tools/evidence-records/fixtures/valid/x402-facilitator-settlement.json", "utf8"),
);
record.recordId = "evr_seeded_402_is_settlement_w7";
record.producer.observedSurface =
  "HTTP 402 PAYMENT-REQUIRED unpaid GET /extract treated as facilitator settlement";
record.prohibitedInferences = record.prohibitedInferences.filter(
  (code) => code !== "provider_response_is_chain_settlement",
);
record.settlement = {
  operationId: "evr_seeded_402_is_settlement_w7",
  amountUsdc: "0.005",
  buyerClass: "independent",
  validDeliveryStatus: "inferred_from_unpaid_402",
};
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
JS
node tools/evidence-records/validate.mjs --pretty "$SEED"; echo "validate_exit:$?"
node tools/evidence-records/validate.mjs --expect-reject missing_prohibited_inference --pretty "$SEED"; echo "expect_reject_exit:$?"
SEED_DIR="$(mktemp -d)"
cp "$SEED" "$SEED_DIR/seeded-402-is-settlement.json"
node tools/evidence/reconcile.mjs --dir "$SEED_DIR" --pretty; echo "reconcile_exit:$?"
rm -f "$SEED"
rm -rf "$SEED_DIR"
```

Expected:

| Command | Exit | Proof |
| --- | --- | --- |
| `validate.mjs "$SEED"` | 1 | `ok: false`, codes include `missing_prohibited_inference` |
| `validate.mjs --expect-reject missing_prohibited_inference "$SEED"` | 0 | the named refusal fired |
| `reconcile.mjs --dir "$SEED_DIR"` | 1 | `ok: false`; the 402-as-settlement row is not banked |

A second seed: treat the buyer-runtime 402 contract as a paid continuation.
The stop fixture already lists the paid retry as `mustNotRun`. Assert that
refusal without constructing a signer.

```bash
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { loadRuntime } from "./tools/buyer-runtimes/lib.mjs";
const stop = loadRuntime("agent402").states.stop;
assert.equal(stop.reason, "no wallet");
assert.equal(stop.mustNotRun.includes("payX402 paid retry"), true);
assert.equal(stop.mustNotRun.includes("Agent402 route-execute"), true);
const blob = stop.paidContinuationWouldNeed.join("\n");
assert.match(blob, /PAYMENT-SIGNATURE/);
assert.match(blob, /Facilitator verify\/settle/);
console.log(JSON.stringify({ ok: true, refusedPaidContinuation: true, reason: stop.reason }));
process.exit(0);
JS
```

Expected: exit 0, `refusedPaidContinuation: true`. The paid continuation is
named and not executed.

## Do not run (wrong path for this howto)

These are named so they can be refused. Do not execute them from this doc.

```text
npm run verified-feed:refresh -- --live --live-route-limit 1
curl -sS -H 'PAYMENT-SIGNATURE: eyJhbGciOiJub25lIn0' 'https://agents.samedaydesk.com/extract?url=https://example.com'
node vendor/neomorphic-correspondence/dist/migrate.js
npm run correspondence:migrate
```

Reasons:

| Path fragment | Reason |
| --- | --- |
| `--live` | live observation is not this boundary; still not settlement |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` | paid retry / settlement credential |
| `vendor/neomorphic*` / `correspondence:migrate` | Neomorphic out of scope |
| `/api/checkout` or Stripe Payment Links | checkout mutation, not x402 settlement |

`SKIP_LIVE_BUYER_REPLAY=1` is required on `tools/buyer-runtimes/test.mjs` in
this howto. Unset, that file may probe the live unpaid 402. A live 402 is
still not settlement. Do not follow it with a paid retry.

## What settlement would take (do not perform)

The buyer-runtime stop fixtures list the paid continuation and refuse it:

1. A funded Base USDC spending wallet.
2. `PAYMENT-SIGNATURE` (x402 v2) on the same method, path, and query.
3. Facilitator verify/settle of exact USDC to
   `payTo 0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee` for `5000` atomic units
   (`0.005` USDC) on `eip155:8453`.
4. A typed evidence record in `fixtures/settlements/` with
   `settlement.transaction` (64-hex `0x…`) and a closed `buyerClass`.
5. HTTP 200 with `PAYMENT-RESPONSE`, not another HTTP 402.

Until those exist as a typed settlement record, keep the observation in the
402 column. Agent402 `settlement_required` means *they* have not seen enough
on-chain settlement to dispatch. That is their gate, not proof that SameDayDesk
402 responses failed.

## Related in-repo artifacts

- `fixtures/buyer-runtimes/agent402/states/contract.json` (unpaid 402 pin)
- `fixtures/buyer-runtimes/agent402/states/stop.json` (no wallet, no settle)
- `docs/lqdist1-distribution-audit/evidence/agent402-seller-bounded.json`
- `docs/lqdist1-distribution-audit/README.md` (paywall 402 vs router spend gate)
- `tools/evidence-records/README.md` and `catalog.json`
- `tools/evidence/golden/banked-settlement-table.json`
- `client/public/x402/README.md` (unpaid 402 inspection feed)

## Bounds

In scope: offline fixture reads, typed evidence validation, unpaid buyer-runtime
stop states, the Agent402 bounded snapshot already committed in this repo.

Out of scope: `--live`, wallets, `PAYMENT-SIGNATURE`, facilitator settle,
price or SKU edits, publish, `vendor/neomorphic*`, `neomorphic.io`, Stripe
checkout, MCP Registry writes.
