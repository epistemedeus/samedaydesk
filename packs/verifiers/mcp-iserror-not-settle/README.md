# MCP isError ≠ settle

Offline SameDayDesk verifier. An MCP tool result with `isError: true` is never
settlement. HTTP 200 and a JSON-RPC `result` (no `error` field) are the normal
MCP success envelope. They do not mean money moved.

This pack does not call a network, a facilitator, Stripe, or chain. It does not
prove a successful x402 settlement. It only forbids treating `isError` (and
JSON-RPC errors) as settle evidence.

## Invariant

| Wire | Settlement? |
| --- | --- |
| `result.isError: true` | No |
| JSON-RPC `error` | No |
| HTTP 200 / 202 | Not evidence |
| x402 PaymentRequired (`isError` + `accepts`) | Challenge, not settle |
| `x402/payment-response.success: false` with `isError` | Settlement failed |
| `isError: true` plus `payment-response.success: true` | Protocol violation, reject |
| Tool text that says payment is verified | Does not override `isError` |
| `isError` absent | This pack does not prove settle |

SameDayDesk `/mcp` returns HTTP 200 with `isError: true` for unpaid Fix Pack
redemption, missing URL, TaskMarket tool errors, and generation failures after
a Stripe license check. A ledger that banks those as paid is wrong.

## Cold start

No install. Node 20+. From this directory or the repo root:

```bash
node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs
node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --suite
```

Exit 0 means every `fixtures/pass` case passed the invariant and every
`fixtures/fail` case was rejected.

## Seeded failure

The canonical reject is HTTP 200 + unpaid Fix Pack `isError` claimed as
settled because the transport succeeded:

```bash
node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --case \
  packs/verifiers/mcp-iserror-not-settle/fixtures/fail/sds-http-200-unpaid-fixpack-claimed-settle.json
```

Exit 1, `verdict: "reject"`, `code: "http_200_iserror_claimed_settle"`.

Confirm the whole fail set is rejected:

```bash
node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --seeded-failure
```

`--expect-reject` on one fail fixture exits 0 only when that file is rejected.

## Tests

```bash
node --test packs/verifiers/mcp-iserror-not-settle/test/*.test.mjs
```

## Limits

- No `--live`, `--pay`, `--payment`, `--publish`, `--neo`, `--deploy`.
- Does not fetch `https://samedaydesk.com/mcp`.
- Does not change prices, SKUs, or payment rails.
- A successful tool result with `x402/payment-response` is `not_proven` here.
  Chain / facilitator proof is a different pack.
