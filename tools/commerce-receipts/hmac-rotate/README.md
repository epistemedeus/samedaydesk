# Commerce-receipt HMAC rotation (offline)

Rotates fixture HMAC keys that tag unpaid SameDayDesk commerce receipts.
Previous kids verify during a required overlap window and are refused after
it. This is a local rotation probe. It does not pay, checkout, settle,
publish, or touch neo.

Raw key bytes are never stored. Fixture keys are derived from public
`fixture.*` labels. Envelopes emit `kid` and `sha256:` fingerprints only.

```
node tools/commerce-receipts/hmac-rotate/cli.mjs --cold
node tools/commerce-receipts/hmac-rotate/cli.mjs --suite
node tools/commerce-receipts/hmac-rotate/cli.mjs --seeded-failure retired-key-after-overlap
node tools/commerce-receipts/hmac-rotate/cli.mjs --seeded-failure forged-mac
node --test tools/commerce-receipts/hmac-rotate/test.mjs
```

## Cold run

`--cold` signs the committed unpaid `/extract` 402 body with `sds-hmac-2026-09-a`,
rotates to `sds-hmac-2026-09-b` with a 1 hour overlap, dual-verifies the old
tag, signs a new receipt with the current kid, expires the overlap, and
refuses the retired kid. The current kid still verifies after expire.

## Seeded failure

`fixtures/invalid/retired-key-after-overlap.json` keeps a cryptographically
valid HMAC on retired kid `sds-hmac-2026-09-a` after `notAfter`. A naive
verifier that ignores key status accepts it. Honest rotation rejects
`retired_key_after_overlap`.

`--pay`, `--checkout`, `--neo`, and `--publish` exit 2
(`money_movement_refused`). `--out` must be a `.json` file inside this
package.

## HMAC

`HMAC-SHA256(key, domain || 0x00 || kid || 0x00 || canonical_json(body))`

- domain: `samedaydesk.commerce-receipts.hmac.v1`
- fixture key: `SHA-256(fixture-domain || 0x00 || label)`
- overlap: required, 1 ms .. 7 days
- statuses: `current` (sign+verify), `previous` (verify only), `retired` (neither)
