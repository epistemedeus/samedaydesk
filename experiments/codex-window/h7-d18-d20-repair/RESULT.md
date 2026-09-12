# H7 d18/d20 repair

Isolated native session (same H6D parent identity, **not** the terminal H7 delivery session):
`01a09456-c82b-7b41-ad58-e5557da52ed3`

- CWD: `/tmp/h7-witness/wt`
- Branch: `codex/h7-d18-d20-repair-20260912`
- Base / vendor pin: `8a811bbadba7edc6c926b319b0839cd2f01e5896` (PR143, fix `e122c266`)
- H6D worktree `/tmp/h6d/wt` left at `b54eaa0ae8cb756cdb82b2b923a9468c3893061c` (not dirtied)
- H7 delivery session `01a094f5-dde1-70e1-ad54-481c90a8cd67` not resumed
- TMPDIR: `/tmp/h7-witness/runtime-tmp`
- Cash $0. No production merge/deploy/payment. No archive overwrite.
- Publication is **not** crash-atomic.

## Witnesses (assertions not softened)

| Case | Owner | Result |
| --- | --- | --- |
| CW65 `d20-order-interrupt-before-complete` | `tools/managed-useful-jobs-order` | Guard intact: journal stays **1**; reopen `interrupted-incomplete` |
| CW65 `d18-publication-rollback` | `wrapper.mjs` `publishCompleteOutputs` | Preflight still refuses directory dest without overwrite |
| d18 rollback after first successful install (preexisting dest) | same | original restored; new sibling removed |
| d18 rollback after first successful install (absent dest) | same | new dest removed |
| d18 rollback-incomplete | same | `rollback-incomplete` + `recoveryDir`; unique backups kept; caller `.${pid}.bak` untouched |

## Fixes

1. **d20** (unchanged this amendment) — adopt with `executionCount > 0` refuses a second engine.
2. **d18 amendment** — incoming vs backups in a unique workspace subtree; every newly published path is removed on rollback; restore failures keep the workspace and throw `rollback-incomplete` with `recoveryDir`. Optional `publicationHooks` seam for deterministic inject. No crash-atomicity claim.

PR143 signal/scratch cleanup was **not** edited.

## Tests (`NODE_OPTIONS=--max-old-space-size=768`, `--test-concurrency=1`, flock)

| Pack | Result |
| --- | --- |
| publication-rollback (5 cases, exact temp dirs removed in `finally`) | **5/5** |
| wrapper unit + journey + seeded + execution-contract + publication-rollback | **49/49** |
| d20 interrupt-before-complete | **1/1** |
| concurrent-resume | **2/2** |
| PR143 `vendor-temp-lifecycle.test.mjs` | **9/9** |
| PR143 `packaged-vendor-lifecycle.test.mjs` | **2/2** |

Postgres 55590–55595 still untested (`pg` missing). HTTP principal / ledger / outbox still later gates.

## Next rebind owner

**PR145 / H7-delivery consumer owner** (`codex/h7-delivery-20260912`) should rebind onto this branch (or `8a811bba` + these commits).
