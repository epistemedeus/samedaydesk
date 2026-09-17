# SDS offer-receipt join regression (W7)

Fixtures and verifier that **join** a SameDayDesk catalog/402 `accepts[0]`
offer to an unsigned `offer-receipt` payload on exact keys, and **reject**
mismatches.

Write boundary: `tests/regression-sds/offer-receipt-join-w7/**` only.
No Stripe/x402 payment. No `--live`. No checkout, settle, or publish.

A join is an observation that both sides declared the same exact key values
(origin+pathname, amount string, network, asset, scheme, payTo). It is not
settlement, demand, or a paid retry. Amounts are never unit-converted
(`5000` is not `0.005`).

Cold join loads the real committed catalog
`fixtures/presence/catalog/x402.json` (origin `/.well-known/x402`).

```
tests/regression-sds/offer-receipt-join-w7/
  MANIFEST.json
  run.mjs              # cold join + --seeded-mismatch
  verify.mjs           # single fixture
  *.test.mjs
  lib/{pin,join,catalog,envelope,refuse,root}.mjs
  fixtures/cases/*.json
```

## Commands

```bash
# Cold join: matching /extract /read /scan joins succeed; mismatches reject → exit 0
node tests/regression-sds/offer-receipt-join-w7/run.mjs --cold --json

# Seeded mismatch (payload.amount "1" vs catalog 5000) fed as accept → exit ≠0, error.code SEED_REJECT
node tests/regression-sds/offer-receipt-join-w7/run.mjs --seeded-mismatch --json

node --test --test-concurrency=1 tests/regression-sds/offer-receipt-join-w7/*.test.mjs
```

`--pay`, `--live`, `--checkout`, `--settle`, `--publish` are refused (exit 2).

## Cases

| id | expect | defect |
| --- | --- | --- |
| cold-extract-join | accept | committed `/extract` 5000 joins unsigned offer-receipt |
| cold-read-join | accept | committed `/read` 5000 joins |
| cold-scan-join | accept | committed `/scan` 200000 joins (not hardcoded to 5000) |
| amount-mismatch | **seed reject** | payload amount `1` vs catalog `5000` |
| route-mismatch | reject | `/extract` offer vs `/read` receipt |
| payto-mismatch | reject | SDS payTo swapped |
| network-mismatch | reject | `eip155:1` vs Base `eip155:8453` |
| unit-conversion-as-match | reject | `0.005` claimed equal to atomic `5000` |
| invented-receipt-field | reject | `loyaltyPoints` / `throughBlock` |
| offer-as-settlement | reject | unsigned offer plus copied tx labeled settled |
| join-without-exact-key | reject | no shared join key |
| money-movement | reject | `mode: pay` / `intent: checkout` |

Offer signatures and `validUntil` are omitted as volatile. Fixtures are
synthetic unpaid records, not live payments.
