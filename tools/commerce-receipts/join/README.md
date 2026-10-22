# Cross-party receipt join probe (read-only)

Joins local SameDayDesk buyer, seller, and facilitator receipt fixtures on an
exact `receipt_id`, `transaction_hash`, or `operation_id`. This is a typing and
join probe. It does not pay, checkout, settle, fetch, publish, or write a
registry.

A join is an observation that two parties declared the same exact key. It is
not independent settlement, demand, revenue, or a customer count. Amounts on
joined receipts are never summed across authority classes.

```
node tools/commerce-receipts/join/join.mjs --input tools/commerce-receipts/join/fixtures/valid/three-party-transaction-hash.json
node tools/commerce-receipts/join/join.mjs --suite
node tools/commerce-receipts/join/join.mjs --seeded-failure money-movement
node tools/commerce-receipts/join/join.mjs --seeded-failure join-without-exact-key
node --test tools/commerce-receipts/join/join.test.mjs
```

## Parties

| Party | sourceKind |
| --- | --- |
| `buyer` | `buyer_attested_receipt` |
| `seller` | `seller_ledger_line` |
| `facilitator` | `x402_facilitator_settlement` |

Cross-source join without an exact key is rejected. `--pay`, `--checkout`,
`--settle`, `intent: checkout`, `mode: pay`, and mutating HTTP are
`money_movement_refused`.

Fixtures are synthetic. They are not live payments.
