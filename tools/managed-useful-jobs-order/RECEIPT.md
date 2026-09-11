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
| Tested D01 | `codex/w5-d01-20260911` `6bed72dd22a396134aa5c957933b42c3a5746698` PR74, contract `samedaydesk.paid-useful-jobs.execution.v1` |
| Packet pin PR52 | `aeef964fa188443078958d9d6d393afae1d542ee` (read-only worktree; D01 extends it) |
| Competing runner removed | `lib/engine.mjs`, `lib/kit.mjs` (no spawn of useful-jobs CLI) |

## Commands

From the repository root, Node >= 22. D01 contract must be importable:

```bash
# If server/paid-useful-jobs is not on this tree:
git fetch origin codex/w5-d01-20260911
git worktree add --detach /tmp/ro-worktrees/sds-d01 origin/codex/w5-d01-20260911
export MANAGED_ORDER_WRAPPER_ROOT=/tmp/ro-worktrees/sds-d01/server/paid-useful-jobs

node --test tools/managed-useful-jobs-order/test/*.test.mjs
```

Caller journey:

```bash
node tools/managed-useful-jobs-order/bin/orders.mjs create \
  --request tools/managed-useful-jobs-order/fixtures/orders/ord-1.json \
  --store /tmp/managed-order-store \
  --out-dir /tmp/managed-order-out \
  --wrapper-root "$MANAGED_ORDER_WRAPPER_ROOT"
```

## Tests

Executed from repo root after implementation. See `experiments/wave5/d04/RECEIPT.md`
for counts from this worker.

## Integration limits

- Tested D01 `6bed72dd22a396134aa5c957933b42c3a5746698`. Later D01 amendments are a
  remaining binding; this client does not claim a future sibling's behavior.
- Order `termsHash` and D01 `receipt.inputsDigest` are unlike documents.
- No live catalog, Express mount, price change, spend, or default-branch push.
