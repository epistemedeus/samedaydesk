# CW62 H7 slice status

Status: **acceptance pack green against pin `8a811bba` (useful-jobs 1.4.3 unpublished)**. Prior closeout used ancestor `6007fcfa`, which is not release-ready. Not a release, merge, or payment claim.

Hostname `cursor` is not provider identity. Shared runtime was not edited.

## Pin actually consumed

- Runtime pin: `8a811bbadba7edc6c926b319b0839cd2f01e5896`
- Catalog version: **1.4.3**
- Execution contract: `samedaydesk.paid-useful-jobs.execution.v1`
- Envelope `executionId` is top-level; `receipt.v1` is not required to nest `executionId`
- Named-byte compare uses `name` / `kind` (default `file`) / `bytes` / `sha256` (fileEntry path omitted)
- vendor-budget-impact receipts use the **1.0.0 wrapper archive** (`6bf65039…`, 2522418 B)
- M01 jobs use **source-identity** pins; the two identities are not forced equal
- `CURRENT_CORE_BASE` is `8a811bba…`. Tests were **not** claimed against `76f0fab` or the non-release-ready `6007fcfa` archive.
- `usefulPaidWork` remains false; `jobRevenueUsdc` remains null
- HTTP execution cache is process-local (restart does not replay)

## Exact commands

TMPDIR and flock as required:

```sh
mkdir -p /tmp/h7/runtime-tmp/cw62
export TMPDIR=/tmp/h7/runtime-tmp/cw62
export NODE_OPTIONS=--max-old-space-size=768
```

Library gate (Node `--test-name-pattern` with the prompt’s `\\(library\\)` in single quotes matched **zero** tests; this equivalent ran the library body):

```sh
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 \
  --test-name-pattern='[(]library[)]' \
  experiments/codex-window/cw62-batch-value-integration/test/acceptance.test.mjs
```

Result: **1 pass / 0 fail** (`current core -> desk -> batch -> value (library), exact rows and replay`).

Full owned acceptance:

```sh
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 \
  experiments/codex-window/cw62-batch-value-integration/test/acceptance.test.mjs
```

Result: **25 pass / 0 fail / 0 skip**. TAP: `experiments/codex-window/cw62-batch-value-integration/evidence/acceptance.tap`.

Ported desk execute-seam safety (owned path, not the donor engineRunner suite as-is):

```sh
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 \
  tools/job-request-desk/test/replay-honesty.test.mjs
```

Result: **6 pass / 0 fail**.

## Acceptance cases

| Case | Result |
| --- | --- |
| Pin / M01 vs 1.0.0 archive identity | pass |
| current core → desk → two-row batch → value (library) | pass |
| same journey over loopback execution HTTP | pass |
| desk + batch HTTP, failed-request replay, GET after restart | pass |
| kill after core execution, restart, no second dispatch | pass |
| interrupted two-item batch: unknown + not-attempted | pass |
| six concurrent same-request writers | pass |
| concurrent same-order input substitution | pass |
| wrong execution ID / input receipt / nested delivery / funding / output bytes | pass |
| stored output replacement | pass |
| source-byte freeze around dispatch | pass |
| stated unknown / possible-spend / settled cannot become zero or success | pass |
| batch identity + duplicate IDs | pass |
| corrupt admission retained | pass |
| concurrent value writers, duplicate replay, conflicting payloads | pass |
| unknown-to-final observation IDs stay distinct | pass |
| batch + value CLI without a second run | pass |
| pre-admission integer termsVersion has no durable row; async executor is unknown | pass |
| persist callback on replay | pass |

## Files changed (owned paths only)

Desk: `lib/{current,desk,store,http-adapter,catalog,pins,contract,index}.mjs`, `FEATURE-MAP.md`, `test/replay-honesty.test.mjs`.

Batch: `lib/{ledger,http,pins,request}.mjs`, `FEATURE-MAP.md`, `test/{helpers,identity,seeded-failures}.test.mjs`.

Value: `lib/{run,cli,pins}.mjs`, `FEATURE-MAP.md`, `test/binding.test.mjs`.

Harness: `experiments/codex-window/cw62-batch-value-integration/test/{acceptance.test.mjs,worker.mjs}`, `H7-SLICE-STATUS.md`, `evidence/acceptance.tap`.

## Defects repaired (same-owner)

- Off-by-one repo root (`../../../../`, four levels).
- Engine identity branches: archive for vendor-budget-impact, source-identity for M01.
- Named-byte projection; no nested `receipt.executionId` requirement.
- Failures after claim cannot look like not-attempted; async executor is unknown spend.
- Pre-admission integer `termsVersion` / engine-pin / same-order swap leave no new durable row. Freeze errors admit then reject for replay.
- Order-before-ticket races resolve as `same-order-id-input-swap`, not missing-admission.
- Desk/batch HTTP: 8 MiB body limit, loopback bind, 413/400 status.
- Batch persist callback runs on replay; planned rows keep buyerClass; no partial `ok: true`.
- `measureBatch` no longer hardcodes `owner-qa`; observation is part of value `runId` so unknown-to-final / corruption does not overwrite original evidence.
- Worker cleanup SIGTERMs and waits; SIGKILL reserved for crash/interrupt tests.
- Inherited `engineRunner` injection ported onto `execute`. Archive-origin/file overrides remain refused (`runner-override-refused`, `usefulPaidWork: false`). PR52 worktree auto-checkout removed from batch helpers.

## PG 55592

**Untested.** No acceptance case needed a database. Inherited PG helpers still use random ports and are not atomic/duplicate-safe; they were not started. Do not treat file-ledger acceptance as Postgres proof.

## Remaining raw failures / unrun donor tests

Not executed as a pack (per instruction: do not start with every inherited donor test):

- `tools/paid-batch-reconciler/test/f08-adapter.test.mjs` still asserts the old `f08Root` override path and historical pin `aeef964`. New default refuses runner overrides (`runner-override-refused`). Safety of that refusal is covered in `seeded-failures.test.mjs`.
- `tools/paid-batch-reconciler/test/postgres.test.mjs` and `tools/buyer-value-ledger/test/postgres.test.mjs` — PG untested.
- Other D12/D13 journey/local-http/d01-consumer files that still mention private archive adapters or `engineRunner`. Safety assertions that mattered were ported; leftover donor assertions were not rewritten to green.

## Unsupported boundaries

- Directory / rewritten `job` inputs remain `unbound-input-shape`.
- No live payment route, no artifact download route, no durable HTTP execution cache.
- Multi-host / untrusted filesystem attackers are not established.
- M01 identity is checked and branched; the process acceptance journey used **vendor-budget-impact**, not a full lockfile-pin-delta run.
- Shared `server/paid-useful-jobs` was read-only.

No git commit. No default merge, publication, credentials, or signing.
