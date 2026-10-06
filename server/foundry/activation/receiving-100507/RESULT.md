# ROOT-SOL-HOST-RUNTIME-PROGRESS-100507

**Tested diagnostic handoff; actual Hostinger cause remains unidentified.** Root's 2026-10-05 23:51:54Z trace records a 417ms recovery `port_error`, followed by pending readback, with no receiving deadline. [receipt.json](receipt.json) preserves that supplied dated negative separately from VM measurements. A build probe cannot identify which lazy serving operation failed. No additional timeout change is made.

Native session `01a10c36-95c6-7d81-ba6c-edd7587eb57f`, one writer; branch `codex/sol-host-runtime-progress-100507` from exact accepted main `d9025af2cffc38a5d6eb551fe20ac9d99c45704c`. Export is the single commit containing this receipt; its exact head is returned with the PR. No owning AGENTS was present.

Traced normal server → compose → canonical entry mount → full EntryReceiver `recover`/locked completion → `enrollPortable` → lazy `portablePolicy`/`installedPolicy`/`installation`, verification and pool/experiment writes. Recovery is forwarded. Pending readback skips installation checks; recovery evaluates them before pool insertion. Config/verification/participation/experiment values are plain JSON objects serialized by the locked pg driver. Owning migrations define the project/pool foreign keys, JSONB columns and additive verification/participation columns. No schema defect or Hostinger artifact omission is established by the supplied trace.

The owning diagnostic now retains the exact inner operation tag while rethrowing the original error. Only closed error aliases/classes, enumerated SQLSTATE and installed-resource categories enter the existing private journal/projection; error prose, names, SQL, parameters, stack, paths, grants and private correspondence are excluded. Filesystem categories compare the actual error path against this installed closure without another filesystem read. Public schemas remain unchanged. No allocation, execution generation, deadline, SQL statement, recovery decision, endpoint, migration or physical reassignment changes.

**Failing control / changed diagnostic:** exact accepted source runs through normal `server/index.js` from a copied delivery tree with absent runtime, disposable PostgreSQL and the same private enrollment. The complete build-tree sealed probe passes, while serving recovery returns 202/pending and records `port_error`. Amended source on that same retained attempt records `filesystem_missing` / `portable_policy` / `runtime_config`. It remains pending until the disposable delivery's intact runtime is restored; then the same attempt becomes ready, one charge/admission/pool, original allocation/terms/caps/workspace/history preserved. Separate real SQL controls produce `23514` at pool insertion, `23503` at experiment insertion and `42703` for an absent column, all with rollback and later same-attempt completion. Invalid runtime and changed source produce distinct validation evidence. Changed launcher generation refuses serving readback without renewing or trusting old evidence. These controls discriminate possibilities; none is labeled the actual Hostinger cause.

**Validation: 143 passed, 0 failed/skipped/cancelled; final commands exit 0.** Owning `npm ci` passed with the unchanged lockfile. Official Node22.18.0 selected by `PATH=/tmp/root-sol-100503/node-v22.18.0-linux-x64/bin:$PATH`:

| Command | Passed |
| --- | ---: |
| `FOUNDRY_RUNTIME_PROGRESS_RECEIPT=/tmp/root-sol-100507/runtime-evidence.json npm run test:foundry-runtime-progress` | 8 |
| `FOUNDRY_ENTRY_RESERVATION_RECEIPT=/tmp/root-sol-100507/entry-evidence.json npm run test:foundry-entry-reservation` | 20 |
| `npm run test:foundry-private-pass` | 14 |
| `npm run test:foundry-host` | 22 |
| `npm run test:foundry-activation` | 16 |
| `node --test --test-concurrency=1 server/scripts/test-foundry-entry-server.js server/scripts/test-foundry-claimed-sigterm.js server/scripts/test-foundry-drain.js` | 7 |
| `npm run test:managed-node` | 41 |
| `npm run test:managed-platform` | 15 |

Normal product health serves through failed receiving. New serving children are bounded, drained and reaped. Existing regressions retain high pre-completion SQL latency, lost replies, concurrent recovery, missing/unknown begin, 20s cancellation with owned SQL cleanup, tombstones, unchanged original history, private-path refusal and uncertain physical ownership. Disposable A/use/restart/B again supplies useful/useful-negative/changed-input checks and six exited/drained canonical invocation observations. Initial new-harness assertions mistakenly matched the legitimate `use_private_correspondence` nextAction against a sentinel substring; corrected to a unique sentinel. No optional/skipped test supplies proof.

Neo provenance remains `1652533b1823ac33b86591ec4e931a8c4ea4aa97`, tree `d9c80cfd56cb05d40055dba047d6462656764ff8`; SOURCE-PIN appends four exact amendments and receiving tests validate the chain. Private control closure retains 215 files. Both locks, earlier receiving artifacts, sealed execution/PROFILE/child/supervisor/launcher/interpreter49 and limits remain unchanged; this diagnostic does not renew execution authority. No generated correspondence code change is needed.

[ROOT.md](ROOT.md) gives original A's exact continuation and unchanged read-only request. Root must receive source, run the same saved reconciliation, then read its new serving trace through the named private build. Private-pass current runtime readiness cannot substitute for serving readiness. No production credentials/private caller files, Hostinger/retained/product DBs, environment values, accounts, human pages, prices or payment were touched. Actual A progress/verification/publication/use/restart/B remains unproved here.
