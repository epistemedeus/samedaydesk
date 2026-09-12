# RECEIPT: W5-D04 Co20 managed-order client

Local order client over the D01 execution contract. Not deployed. Not a live
catalog item. Payments remain nonsettling (`sold: false`, `charged: false`).

## Source

| Item | Value |
| --- | --- |
| Repo | epistemedeus/samedaydesk |
| Feature branch | `cursor/w5-d04-co20-managed-order-client-removing-its-competing-runner-979c` |
| Starting ref | `13d1fc023ce235b1611dc868caf5dd84fe5f11c7` (`codex/w4-commerce-20-20260911`) |
| Owned paths | `tools/managed-useful-jobs-order/`, `experiments/wave5/d04/RECEIPT.md` |
| Tested D01 | this tree `codex/w5-d01-20260911` PR74 |
| Contract | `samedaydesk.paid-useful-jobs.execution.v1` |
| Packet pin PR52 | `aeef964fa188443078958d9d6d393afae1d542ee` (read-only worktree) |
| Competing runner removed | `lib/engine.mjs`, `lib/kit.mjs` |

## Commands

From the repository root, Node >= 22. D01 is this tree's `server/paid-useful-jobs`.

```bash
npm run test:managed-useful-jobs-order
```

```bash
node tools/managed-useful-jobs-order/bin/orders.mjs create \
  --request tools/managed-useful-jobs-order/fixtures/orders/ord-1.json \
  --store /tmp/managed-order-store \
  --out-dir /tmp/managed-order-out
```

## Tests

Executed from repo root, Node v22.14.0. D01 is this tree's `server/paid-useful-jobs`. File-store CLI lazy-imports `pg` only when `--database-url` is set.

```bash
npm run test:managed-useful-jobs-order
```

**21 tests, 7 suites, 21 pass, 0 fail, 0 skip, 0 cancelled.** Composition re-test on PR 74. Disposable Postgres 16 `initdb`/`pg_ctl`.

| Suite | Tests | Class |
| --- | --- | --- |
| concurrent reserve / interrupted resume | 2 | two CLI processes; dead-pid resume |
| contract boundaries | 3 | stale outDir, corrupt store, D01 `/execute` HTTP |
| 127.0.0.1 test listener | 2 | loopback POST |
| owned-path hygiene | 3 | owned paths; no competing CLI |
| public CLI journey | 1 | ord-1 + swap refuse |
| real local Postgres | 2 | persist + two clients one reservation |
| seeded fail-closed CLI | 8 | sample, pin, orderId, extract, funding, terms, invalid JSON |

Missing deps were not skipped. `sold`/`charged` stay false.

SDS52 extract pin stays **1.0.0** (`useful-jobs-1.0.0.sha256.json` /
`fixtures/samedaydesk.useful-jobs-consumer.v1.json`). The public current download
is useful-jobs **1.1.0**; this client must not follow `usefulJobsKit.json` for
the original-six archive hash.

## Integration limits

- Tested D01 is this tree's `execution.v1` (PR 74). Historical pin `6bed72dd` is not spawned.
- Order `termsHash` and D01 `receipt.inputsDigest` are unlike documents.
- D19 owns further multi-process order/ledger tests.
- No live catalog, Express mount, price change, spend, or default-branch push.
