# CW60 H7 slice status

Observed 2026-09-12 on Cursor Cloud VM. Hostname `cursor` is not provider identity. No git commit.

## Git

- Branch: `codex/h7-delivery-20260912`
- HEAD observed (do not commit): `fe8057f395bc665b629e12dbff0db0c264f0eb46`
- Runtime pin: `8a811bbadba7edc6c926b319b0839cd2f01e5896` (useful-jobs **1.4.3 unpublished**; previous `6007fcfa` is an ancestor and not release-ready)
- Catalog/contract used: `samedaydesk.paid-useful-jobs.execution.v1`; envelope `executionId` is top-level
- Node: v22.22.2

## Files changed (owned paths only)

Repairs:

- `tools/job-delivery-outbox/lib/receiver.mjs` — compare named-output projection (`outputRefs()` name/kind/bytes/sha256; directory `path` only). Added `ack-wrong-terms`.
- `tools/job-delivery-outbox/bin/loopback-receiver.mjs` — help lists `ack-wrong-terms`.
- `tools/job-artifact-export/lib/refuse.mjs` — narrow `MailboxError.code` → `ExportRefuse` (same code, exit 2). Programming faults unmapped.
- `tools/job-artifact-export/lib/current-receipt.mjs` — wrap `assertD01ExecutionRetrievable()` with that mapping.
- `tools/job-artifact-export/bin/export.mjs` — CLI maps leaked `MailboxError` the same way.

Tests / evidence:

- `experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs`
- `experiments/codex-window/cw60-delivery-export-integration/test/boundaries.test.mjs`
- `experiments/codex-window/cw60-delivery-export-integration/evidence/h7-repro-before.tap`
- `experiments/codex-window/cw60-delivery-export-integration/evidence/h7-repro-after-named.tap`
- `experiments/codex-window/cw60-delivery-export-integration/evidence/h7-boundaries-after.tap`
- `experiments/codex-window/cw60-delivery-export-integration/evidence/h7-journey-after.tap`
- `experiments/codex-window/cw60-delivery-export-integration/evidence/h7-20260912-native/cold-journey.json`

Mailbox, wrapper, engines, archives, and other CW slices were not edited by this slice.

## Env

```
mkdir -p /tmp/h7/runtime-tmp/cw60
export TMPDIR=/tmp/h7/runtime-tmp/cw60
export NODE_OPTIONS=--max-old-space-size=768
```

Every `node --test` ran under `flock /tmp/h7/runtime-tmp/test.lock` with `--test-concurrency=1`. Ephemeral loopback HTTP only. MemAvailable stayed ~10 GiB / 16 GiB (~63%).

## Reproduce first (raw failures preserved)

```
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 --test-name-pattern='partial current receipt' experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 --test-name-pattern='different receiver process' experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
```

Logged in `evidence/h7-repro-before.tap`.

| Test | Result | Raw failure |
| --- | --- | --- |
| partial current receipt… | **fail** 1/1 | `export.mjs: {"ok":false,"code":"internal-error","error":"D01 delivery is not complete; missing or crashed output cannot be picked up"}` then `1 !== 2` |
| different receiver process… | **fail** 1/1 | `actual 'failed' / expected 'delivered'` (receiver whole-row stringify of `path`-bearing receipt outputs vs `kind:"file"` payload refs) |

Those TAP files were not rewritten.

## After repairs

```
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 --test-name-pattern='partial current receipt' experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
# tests 1 / pass 1 / fail 0 / skipped 0  exit:0

flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 --test-name-pattern='different receiver process' experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
# tests 1 / pass 1 / fail 0 / skipped 0  exit:0

flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 experiments/codex-window/cw60-delivery-export-integration/test/boundaries.test.mjs
# tests 18 / pass 18 / fail 0 / skipped 0 / cancelled 0 / todo 0  exit:0
# evidence/h7-boundaries-after.tap

CW60_EVIDENCE=$PWD/experiments/codex-window/cw60-delivery-export-integration/evidence/h7-20260912-native \
flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
# tests 14 / pass 14 / fail 0 / skipped 0 / cancelled 0 / todo 0  exit:0
# evidence/h7-journey-after.tap
```

Donor `tools/job-artifact-export/test/*.test.mjs` and `tools/job-delivery-outbox/test/*.test.mjs` were **not** bulk-run as current acceptance.

## Remaining failures

None in owned journey + boundaries. Assertions were not weakened to green.

## Cold journey receipt

**Yes.** `evidence/h7-20260912-native/cold-journey.json` was written.

- Producer: current in-tree `server/paid-useful-jobs/bin/cli.mjs`
- Job: `lockfile-pin-delta` (M01 source-identity pin `367ca709…` / 196 bytes, not the 1.0.0 archive `6bf65039…` / 2522418)
- `transport: ok`, completeness `classification=complete`
- Mailbox seed/pickup ok; named output bytes matched
- Independent receiver process; `commitBeforeAck: true`; replay kept a single record
- `sold: false`, callback ack is not buyer acceptance

## PG status

**Untested.** No cluster on port 55590. Donor randomly-port Postgres tests were not launched.

## Unsupported / not claimed

- Hosted transfer or an independent external customer (receiver still reads an operator-provided bundle dir in the same workspace)
- Power-loss durability, hostile multi-tenant sandbox, parent-path races beyond the local staging rename
- HTTP path as acquisition authority
- Relabeling M01 source-identity documents as archive checksums (identities kept distinct)
- File-store lock ownership is covered; Postgres lock/store is not
- Historical donor CLI pins / old wrapper fetches in `evidence/original/` are not current readiness

## What was repaired

1. Receiver output comparison now projects both receipt rows and payload refs through `outputRefs()` and checks exact name/kind/size/hash (plus canonical stringify). File `path` is not part of the equality. Digest-string-only was not substituted.
2. Failing journey diagnostics include sender stdout/stderr and a POST probe of the receiver body so a 422 cannot hide behind `condition timeout`.
3. Partial-receipt export maps mailbox `d01-missing-output` to `ExportRefuse` exit 2 with the same code.
4. Journey covers empty HTTP 200, event-only / wrong-path / wrong-digest / wrong-terms acks, lost response after commit (`close-after-store`), same-origin path/query change, same-ID body conflict, persisted endpoint tamper, two receivers, receiver restart/replay, sender crash after attempt commit, file-lock pid+token ownership, no-change export/import, and current completed-analysis refusal plus foreign/changed outputs.
5. Boundaries cover traversal, duplicates, hidden/local-central, symlink/hardlink, truncated zip, partial receipts, member/JSONL/terms changes with refreshed checksum, foreign members, populated/linked dest, and killed staging with no visible partial completion.
