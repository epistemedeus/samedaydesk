# H7 live ownership (native parent)

Recorded 2026-09-12 on Cursor Cloud VM. Hostname `cursor` is not provider identity.

## Git

- Branch: `codex/h7-delivery-20260912`
- HEAD at start: `fe8057f395bc665b629e12dbff0db0c264f0eb46` (import of CW60/61/62/65/70 onto pin)
- Integration source: `c6f1464222169f2d32247c978dc5007d82a2aa03` (PR146)
- Repair SHA: `080cc62e7bc83f76431d916df34aea6d30875401`
- Archive pin (immutable 1.4.3, no wrapper fixes): `8a811bbadba7edc6c926b319b0839cd2f01e5896`
- Previous pin (ancestor, not release-ready): `6007fcfa27074f9a594248e47296f1afa4f8385d`
- Archive: 2615491 bytes, sha256 `a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09` (not overwritten; no 1.4.4)
- Diff vs pin: 613 files, owned consumer/experiment trees only
- Protected trees match pin exactly: `server/paid-useful-jobs`, `tools/result-mailbox`, `tools/job-output-atomicity`, `tools/lockfile-pin-delta`, `experiments/wave5/m01`, `client/public/for-agents/useful-jobs`

## Catalog / contract (actual, this pin)

- Public catalog version: **1.4.3**
- Execution contract: `samedaydesk.paid-useful-jobs.execution.v1`
- Envelope `executionId` is **top-level**; `receipt.v1` does not require nested `executionId`
- Wrapper stamps `receipt.contract`, `receipt.transport`, `receipt.delivery`, `receipt.runOutDir`
- `fileEntry()` rows include absolute `path` and omit `kind`
- `digestNamedBytes` / `outputRefs()` project `name`, `kind` (default file), `bytes`, `sha256` (directory `path` only)
- HTTP `POST /execute` + `GET /results/:id`; **no artifact download route**
- Process-local result cache; not durable across restart
- Legacy wrapper extract remains useful-jobs **1.0.0** archive; M01 jobs use source-identity pins. Do not force those identities equal.
- Mailbox pickup JSON: `outDir` + artifacts `{name,bytes,sha256,ok}` (no per-artifact `path`)

## Child allocation (disjoint writable paths; max 3 concurrent)

| Child | Exclusive write | Must not write | Notes |
| --- | --- | --- | --- |
| CW60 | `tools/job-artifact-export/` `tools/job-delivery-outbox/` `experiments/codex-window/cw60-delivery-export-integration/` | runtime, archives, other slices | PG 55590 only if a test truly needs it |
| CW62 | `tools/job-request-desk/` `tools/paid-batch-reconciler/` `tools/buyer-value-ledger/` `experiments/codex-window/cw62-batch-value-integration/` | runtime, archives, other slices | PG 55592 only if needed |
| CW70 | `experiments/wave5/d14/` `experiments/codex-window/cw70-cold-http-consumer-current/` | runtime, archives, other slices | no PG; ephemeral HTTP |
| CW61 (wave 2) | `tools/repeat-job-binder/` `tools/output-replay-harness/` `experiments/codex-window/cw61-repeat-replay-integration/` | runtime, archives | PG 55591 only if needed |
| CW65 (wave 2 / parent) | `experiments/codex-window/cw65-delivery-adversarial-harness/` `experiments/wave5/d16/` `d18/` `d19/` `d20/` (`current.mjs` + harness) | original D16–D20 files unless harness defect | independent countercheck |

CW64 is inspect-only. Children do **not** git commit. Parent commits at phase boundaries.

## PR143 vs later witnesses (PR145 completion)

- **Can ship independently as integration:** PR143 vendor-temp leak correction; PR146 wrapper/order repairs at `c6f1464`/`080cc62`.
- **PR145** rebound onto that integration; consumers preserved. HTTP principal, ledger, outbox, portable, and real PG controls ran on this branch. Not production main.
- Immutable 1.4.3 archive does **not** contain wrapper fixes. `usefulPaidWork` remains false. Cash $0. Draft PR145: https://github.com/epistemedeus/samedaydesk/pull/145 — update via branch push, no default merge.

## Test serialization

Use `flock` on `/tmp/h7/runtime-tmp/test.lock` for any `node --test` / wrapper spawn / DB.

```
export NODE_OPTIONS=--max-old-space-size=768
export TMPDIR=/tmp/h7/runtime-tmp/<slice>
```
