# H7 d18/d20 repair

Isolated native session (same H6D parent identity, **not** the terminal H7 delivery session):
`01a09456-c82b-7b41-ad58-e5557da52ed3`

- CWD: `/tmp/h7-witness/wt`
- Branch: `codex/h7-d18-d20-repair-20260912`
- Base / vendor pin: `8a811bbadba7edc6c926b319b0839cd2f01e5896` (PR143, fix `e122c266`)
- Implementation head: `e2e2bbde5d017a39de1dea9b3af5409f4ca752d0`
- H6D worktree `/tmp/h6d/wt` left at `b54eaa0ae8cb756cdb82b2b923a9468c3893061c` (not dirtied)
- H7 delivery session `01a094f5-dde1-70e1-ad54-481c90a8cd67` not resumed
- TMPDIR: `/tmp/h7-witness/runtime-tmp`
- Cash $0. No production merge/deploy/payment. No archive overwrite.

## Witnesses reproduced on this pin (assertions not softened)

| Case | Owner | Pre-fix | Post-fix |
| --- | --- | --- | --- |
| CW65 `d20-order-interrupt-before-complete` | `tools/managed-useful-jobs-order` | `2 !== 1` second engine after SIGKILL-before-complete | journal stays **1**; reopen refuses `interrupted-incomplete` (or would recover same executionId) |
| CW65 `d18-publication-rollback` | `wrapper.mjs` `publishCompleteOutputs` | preexisting 34-byte caller file overwritten to `s233.useful-application.artifact.v1` | `ok:false`, original bytes preserved |

## Fixes (smallest general)

1. **d20** — `create-order.mjs`: adopting a reserved order that already has `executionCount > 0` refuses a second engine run and completes as `interrupted-incomplete`. Does not append `executions.jsonl` again.
2. **d18** — `publishCompleteOutputs`: preflight destinations; stage then rename; restore backups on failure. Throws `publication-failed` (`WrapperRefuse`) so the kernel returns `ok:false` without a partial caller overwrite.

PR143 signal/scratch cleanup (`release/lib/common.mjs`, vendor-temp tests) was **not** edited.

## Tests (`NODE_OPTIONS=--max-old-space-size=768`, `--test-concurrency=1`, flock)

| Pack | Result |
| --- | --- |
| managed-order (no Postgres) | **33/33** including concurrent-resume + d20 interrupt |
| wrapper unit + journey + seeded + execution-contract + publication-rollback | **45/45** |
| PR143 `vendor-temp-lifecycle.test.mjs` | **9/9** (four application-handler-without-redelivery included) |
| PR143 `packaged-vendor-lifecycle.test.mjs` | **2/2** |
| CW65 `--only d20-order-interrupt-before-complete` | **pass** |
| CW65 `--only d18-publication-rollback` | **pass** |
| CW65 `--only d20-order-interrupt-reserved` | **pass** |
| CW65 `--only d20-order-interrupt-completed` | **pass** |

## Not in this repair (later / independent)

- Isolated Postgres **55590–55595**: `tools/managed-useful-jobs-order/test/postgres.test.mjs` cannot load `pg` in this checkout (`ERR_MODULE_NOT_FOUND`). No cluster started.
- CW65 `d19-http-principal-boundary`, `d19-current-ledger`, `d20-current-outbox`: still incomplete independent gates (no authenticated HTTP principal; sibling ledger/outbox not this owner).
- HTTP portable artifact download remains `unsupported-portable-acquisition`.
- No core authority redesign.

## Next rebind owner

**PR145 / H7-delivery consumer owner** (`codex/h7-delivery-20260912`) should rebind onto this repair (or onto `8a811bba` + these two commits), then re-run CW65 `--only` is no longer the blocker. Do not wait on PG/principal/ledger/outbox to land d18/d20.

PR143 vendor-temp leak correction remains independently shippable.
