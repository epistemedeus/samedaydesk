# RECEIPT — W4-commerce-06 failed-delivery evidence dossier

Tool: `tools/failed-delivery-dossier/`
Branch: `codex/w4-commerce-06-20260911`
Date: 2026-09-11
Node: v22.14.0
Base: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
Repo: `epistemedeus/samedaydesk`

## Outcome

Read-only packer that labels failed-delivery evidence from (a) F08 rejected/unfunded receipts, (b) checkout `fulfillmentPending` / `intake_required` bodies, (c) extract 402 / Agent402 `stop.json`. `sold` is always false. Refund, payment retry, Stripe calls, and PAYMENT-SIGNATURE are refused.

## Pins consumed

| Ref | SHA | Use |
| --- | --- | --- |
| SDS main | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | fulfill.js, checkout HTTP test, Agent402 stop, evidence-records settlement (not summed) |
| F08 | `bae3e7cd5034b21019fb272a99d88db964b831ee` | receipt schema and real CLI rejection; not on main; not copied as a kernel |
| I01 Neo PR54 | `819fa637ecf5e5177c84efc16fcaa18d57017631` | content-hash `termsVersion`; integer keys refused |

F08 CLI capture (read-only worktree of that pin):

```
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact --example --funding reserved-fixture --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json
```

Exit 2, `code: sample-not-a-sale`, `sold: false`. Copied to `fixtures/wrapper-receipt/rejected-sample-not-a-sale.json` (class: fixture, generated from the pinned public CLI).

## Caller journey

A useful-jobs caller whose delivery is not in hand packs three labelled items:

```bash
node tools/failed-delivery-dossier/bin/dossier.mjs pack \
  --wrapper-receipt tools/failed-delivery-dossier/fixtures/wrapper-receipt/rejected-sample-not-a-sale.json \
  --checkout-intake tools/failed-delivery-dossier/fixtures/checkout-intake/fulfillment-pending-verify.json \
  --extract-unpaid tools/failed-delivery-dossier/fixtures/extract-unpaid/agent402-stop.json
```

Result: `ok: true`, `sold: false`, three evidence rows with distinct source kinds.

## Tests (reproducible from this PR)

Dependencies: Node 22.x. Root `npm install` from existing `package.json` is required for local HTTP capture (`express`, `jose`, `stripe`). No new root dependencies. Postgres is not used by this packer or the checkout fixture path (in-memory attempt store + local HTTP supabase mock).

```bash
npm install
node --test --test-concurrency=1 tools/failed-delivery-dossier/test/*.test.mjs
```

**PASS — 15 tests, 0 fail** on Node v22.14.0.

Also ran published `node --test server/scripts/test-checkout-http-lifecycle.js` (1 pass). That is local-runtime proof of the checkout HTTP surface; the committed verify JSON remains a fixture reconstructed from that test plus `server/routes/checkout.js`.

Seeded refusals:

| Case | Code | Exit |
| --- | --- | --- |
| SAMPLE receipt labelled delivered | `sample_labelled_delivered` | n/a (library) |
| buyerClass mixed into a revenue total | `buyerclass_revenue_mix` | CLI `--revenue-total` → 2 |
| `--refund` | `refund_refused` | 2 |
| `--retry-payment` / `--send-payment-signature` | `retry_payment_refused` / `payment_signature_refused` | 2 |
| integer `termsVersion` | `integer_terms_version` | n/a |

## Class labels

| Class | What |
| --- | --- |
| fixture | Copied F08 CLI receipt, copied stop.json, reconstructed checkout verify body |
| local-runtime | `lib/capture-checkout-http.mjs` POST `/api/checkout/verify` on 127.0.0.1; published checkout lifecycle test |
| external | Live Stripe, live extract 402, facilitator settle, customer mail — not run |

## Honestly untested

- Live Stripe, live facilitator, PAYMENT-SIGNATURE send (refused by design)
- Real local Postgres (nothing listening; checkout path does not use it)
- F08 tree on SDS main (absent; pin worktree used for capture and optional pin check)
- External Agent402 wallet continuation
- Sibling W4 packs (adapters injected; see `lib/later-bindings.mjs`)

## Next integration owner

Root. Bind F08 when it merges. Do not import original F01. Keep I01 hash terms. No deploy, purchase, or customer messages from this package.
