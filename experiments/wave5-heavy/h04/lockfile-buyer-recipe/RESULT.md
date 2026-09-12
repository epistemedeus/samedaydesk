# RESULT — lockfile ordinary-wallet recipe

Merchant pin `ca38205279f0d543515b81b7261909e55ea2600f`. No live payment.

## Gate

Unpatched `examples/customer-x402` `normalizeAuthorization` refuses
`POST /lockfile-pin-delta` (`authorization path must be /extract/batch`).
`purchase.mjs`, `preflight.mjs`, attempt-receipt, and reconcile already
bind exact HTTPS URL/method/body bytes after inspect + `--approve`.

That is a one-path authorization patch, not a second payment stack.

## Proof

`npm test` → **9 pass, 0 fail** against the mounted merchant, fake
facilitator, and throwaway viem signer.

| Case | Result |
| --- | --- |
| unpaid inspect | `preflight_ok`, wallet untouched |
| useful change | `valid_delivered`, `analysis=actionable`, settle 1 |
| same-body replay | `x-payment-replay: hit`, settle still 1 |
| replay-negative (different body, same credential) | HTTP 409, `charged=false`, settle still 1 |
| no-change | `valid_delivered`, `analysis=informational` |
| timeout/unknown | HTTP 503, `analysis=not-run`, settle 0; same credential retry is not a new payment |

Optional skill loads in official Hermes `skill_utils` from a disposable
`HERMES_HOME`. Hermes has no native payer.

## Public copy

Free local kit **1.1.0** vs paid HTTP convenience; pin-field analysis
only; **no** vulnerability guarantee. Other customer-x402 GET/batch
behavior preserved.

## Next

Root transfers `patch/` onto the merchant pin. H01 owns live measurement.
Do not merge/deploy from this SDS branch by default.
