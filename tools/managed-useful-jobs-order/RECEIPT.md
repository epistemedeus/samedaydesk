# RECEIPT: W4-commerce-20 F13 managed useful-jobs order runner

Local proposed-contract runner. Not deployed. Not a live catalog item.
Payments in this wave are nonsettling prototypes (`sold: false`, `charged: false`).

## Source

| Item | Value |
| --- | --- |
| Repo | epistemedeus/samedaydesk |
| Feature branch | `codex/w4-commerce-20-20260911` |
| Starting ref | `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| Owned path | `tools/managed-useful-jobs-order/` |
| Head | (filled after commit) |
| Consumer contract pin | epistemedeus/pilot `c621646897e6fe1dccf0e5993aea63b5bc1f6bd3` |
| F13 brief pin | epistemedeus/pilot `4188f794aada5cb15ec0f75d298096e97650f038` |
| Archive pin | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 bytes |
| I01 hash terms | Read-only S275 `5de66179` `hashTerms`/`digestSha256` lesson; kernel not copied |
| F08 contrast | pin `bae3e7cd` README only; receipt schema not forked |
| Next integration owner | Root |

## Commands

From the repository root, Node >= 22. No extra packages beyond the repo `pg`
dependency already declared in root `package.json`. Local Postgres tests need
`/usr/lib/postgresql/16/bin/{initdb,pg_ctl}`.

```bash
node --test tools/managed-useful-jobs-order/test/*.test.mjs
```

Useful caller journey:

```bash
node tools/managed-useful-jobs-order/bin/orders.mjs create \
  --request tools/managed-useful-jobs-order/fixtures/orders/ord-1.json \
  --store /tmp/managed-order-store \
  --out-dir /tmp/managed-order-out
```

Optional loopback listener (not Express, not mounted on the live app):

```bash
node tools/managed-useful-jobs-order/bin/orders.mjs listen --port 0 --store /tmp/managed-order-store
# POST http://127.0.0.1:<port>/managed/useful-jobs/v1/orders
```

## Counts

Filled after `node --test` on this branch.

## Seeded failures

- example true as payable (`fixtures/orders/example-true.json`)
- archive sha mismatch (`fixtures/orders/sha-mismatch.json`)
- omitted orderId (`fixtures/orders/omit-order-id.json`)
- hitting extract URL (`fixtures/orders/extract-url.json`)
- SAMPLE hashes claimed as customer (`fixtures/orders/sample-as-customer.json`)

## Honestly untested

- External acceptance against https://samedaydesk.com or agents.samedaydesk.com (out of scope; no POST)
- Live settlement, facilitator, catalog publication, deploy
- F08 CLI spawn (contrast only; optional envelope not produced)
- Sibling W4 mailbox/ticket modules (consume via injected store/engine adapters later)

## Integration notes

Missing sibling W4 work did not block this package. Engine adapter spawns the
published useful-jobs CLI. Order store is file or injected Postgres. Root owns
later HTTP/catalog binding.
