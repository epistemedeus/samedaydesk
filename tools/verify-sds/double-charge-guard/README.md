# double-charge-guard — SDS unpaid PaymentIntent / fulfill proofs

Owned path: `tools/verify-sds/double-charge-guard/**` (W0-X96).

Proves SameDayDesk's published double-charge guard on a **cold clone** with
**fixture Stripe** (no `npm ci`, no `api.stripe.com`, no `/api/checkout` POST).

Retry of the same `payment_attempt` reuses one PaymentIntent and one Stripe
idempotency key (`sdd-pi-v2:<attemptId>`). Duplicate fulfill/webhook for the
same PI is one order. Changed facts and uncertain retrieve fail closed.

## Engine (read-only cite)

| Path | Role |
| --- | --- |
| `server/lib/payment-attempt.js` | `createOfferPaymentIntent` — one open attempt, retrieve-only on known PI |
| `server/lib/payment-attempt-store.js` | unique open (user, offer); 23505 collision returns admitted row |
| `server/lib/fulfill.js` | `order_<pi_id>` upsert `onConflict: stripe_payment_intent` |
| `supabase/migrations/0004_repeat_purchase_attempts.sql` | `payment_attempts_one_open_uidx`, `orders_stripe_payment_intent_uidx` |
| `server/routes/checkout.js` | cite-only; this pack does **not** mutate it or POST it |

Patterns (read-only): W0-B2 PR148 `heavy/w0-b2-verify-sds` envelope shape.
This package does **not** write under `tools/verify/**`, checkout, or payment routes.

## Commands

```bash
# Cold engine proof (fixture Stripe) — exit 0
node tools/verify-sds/double-charge-guard/cli.mjs cold --json

# Seeded second-charge claim — exit 1, DOUBLE_CHARGE_CLAIM_REFUSE
node tools/verify-sds/double-charge-guard/cli.mjs --seeded-failure second-charge --json

# Other seeded refuses — exit 1
node tools/verify-sds/double-charge-guard/cli.mjs --seeded-failure retrieve-fail-recreate --json
node tools/verify-sds/double-charge-guard/cli.mjs --seeded-failure changed-facts-bypass --json
node tools/verify-sds/double-charge-guard/cli.mjs --seeded-failure live-stripe --json
node tools/verify-sds/double-charge-guard/cli.mjs --seeded-failure checkout-path --json

# Cold harness (engine ok + all seeds refuse) — exit 0
node tools/verify-sds/double-charge-guard/run-harness.mjs

# Tests
node --test tools/verify-sds/double-charge-guard/cli.test.mjs
```

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.toolsCalled` always `false`
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- Never `--pay` / `--checkout` / `--live` / `--publish`
- No Stripe/x402 spend, no price/SKU edits, no merge

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
lib/catalog.mjs         cites + seeds + forbidden flags
lib/envelope.mjs        JSON envelope (W0-B2-shaped)
lib/load-engine.mjs     copy published engines; unpaid supabase/notify stubs
lib/fixture-stripe.mjs  in-memory PaymentIntents + fulfill db
lib/guard.mjs           cold cases against createOfferPaymentIntent / fulfill
lib/refuse.mjs          seeded double-charge / live / checkout refuses
lib/cite.mjs            source hash + required patterns
fixtures/cold-retry.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
