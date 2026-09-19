# SDS receipt-forge reject pack (W7)

Offline Node 22 verifier for SameDayDesk unpaid receipts. A pass requires a
canonical SHA-256 digest over the claim body. A forged digest cannot pass.
Copied facilitator settlements, fabricated transaction hashes, replayed
receipt ids, payment headers, and pin swaps are rejected.

The pack does not pay, checkout, publish, fetch, or talk to neo. `--live`
is refused.

```sh
node packs/verifiers/receipt-forge-w7/bin/receipt-forge.mjs --cold
node packs/verifiers/receipt-forge-w7/bin/receipt-forge.mjs --seeded-failure forged-digest
node packs/verifiers/receipt-forge-w7/bin/receipt-forge.mjs packs/verifiers/receipt-forge-w7/fixtures/valid/unpaid-402-extract.json
node packs/verifiers/receipt-forge-w7/bin/receipt-forge.mjs packs/verifiers/receipt-forge-w7/fixtures/reject/forged-digest.json
node --test --test-concurrency=1 packs/verifiers/receipt-forge-w7/tests/*.test.mjs
```

Stdout is JSON. `paymentSent` stays false. The object never contains a live
settlement proof.

## Cold run

`fixtures/valid/unpaid-402-extract.json` is an unpaid HTTP 402 on
`https://agents.samedaydesk.com/extract` with SDS pin `payTo`
`0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee` (Base USDC exact). The claimed
digest matches the canonical body. Verdict `ok: true`.

`fixtures/valid/unpaid-buyer-stop.json` is a buyer stop with `httpStatus: null`.
No paid retry ran.

`--cold` / `--suite` accepts those two and rejects every fixture in
`fixtures/reject/`.

## Seeded failure

`fixtures/reject/forged-digest.json` copies the unpaid extract claim, binds
`integrity.claimedDigest`, then changes `accepts[0].amount` from `5000` to
`1`. Naive verdict is accept (well-formed SDS origin + `sha256:` digest).
Honest verdict is reject, code `receipt_forged`.

```sh
node packs/verifiers/receipt-forge-w7/bin/receipt-forge.mjs --seeded-failure forged-digest
```

Exit 0, `rejected: true`, `code: receipt_forged`. Direct verify of the same
file exits 1.

## Other seeded forges

| Fixture | `codes[]` |
| --- | --- |
| `forged-digest.json` | `receipt_forged` |
| `copied-settlement.json` | `copied_settlement` (tx `0x2916cfe2…` bound to `/commerce/seller-integrity-audit`) |
| `fabricated-tx.json` | `fabricated_settlement` |
| `replay-receipt.json` | `receipt_replay` |
| `payment-header-forge.json` | `payment_header_forge` |
| `payto-swap.json` | `pin_mismatch` |
| `paid-as-unpaid.json` | `paid_as_unpaid` (bound facilitator settlement on unpaid 402) |
| `bound-receipt-replay.json` | `receipt_replay` (paid observation id reused as extract 402) |
| `route-url-mismatch.json` | `invalid_shape` (`resource`, `route`, and `request.url` disagree) |

## Honesty

Naive accept is a well-formed `receiptId`, SDS origin, and `sha256:` digest
string. Honest accept recomputes the digest over canonical JSON (keys sorted,
`integrity` stripped) and checks the local pin. `resource`, `route`, and
`request.url` must name one SDS surface. A non-null `settlement` on an unpaid
claim is `paid_as_unpaid`. The in-tree paid observation id is spent. A matching
self-digest is not chain settlement. `executionVerified` is not claimed.

Known settlement pin is the in-tree facilitator observation
`agent402-external-validation-purchase-2026-08-29`. This pack does not fetch
or re-settle that transaction.

## Boundary

`--live`, `--pay`, `--checkout`, `--publish`, `--registry`, `--refresh`,
`--settle`, `--neo`, and `--payment` exit 2 with `REFUSED`.
