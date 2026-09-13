# H27 HA1 compact dependency map

Narrow delta on private integration `44b8ca0f`. Not a merge of H7 history into public main.

## Consumed (read, not rewritten)

| Dependency | How HA1 uses it |
| --- | --- |
| H21 declaration `experiments/codex-window/h21-package-release-gate/hosted-acquisition.d.ts` | `AcquisitionReader` / `AcquisitionWriter` / `AvailableResult` shape |
| H21 plan + ten skeleton TODOs | Acceptance obligations; TODOs remain TODOs |
| Managed-order reservation/completion | `create-order.mjs` admit before engine, publish before `store.complete` |
| `samedaydesk.useful-jobs-order-terms.v1` `termsHash` | Distinct from acquisition frozen-request hash |
| `samedaydesk.paid-useful-jobs.execution.v1` | Completion verifies top-level `executionId`; nested receipt `executionId` optional |
| Named-byte projection `name` / `kind` default `file` / `bytes` / `sha256` (mailbox/D01 digest, no absolute path) | `outputsDigest` |
| Catalog promised names | `lockfile-pin-delta`: `pin-delta.json`, `pin-delta.md`; `vendor-budget-impact`: `budget-impact.json`, `budget-impact.md` |
| `pg` 8.23.0 + host postgresql-16 `initdb`/`pg_ctl` | Real isolated test cluster |
| Result-mailbox expiry/identity lesson | Injected server clock; pickup() is **not** mounted as HTTP |

## Produced for later packages

| Package | Receives |
| --- | --- |
| HA2 | `createAcquisitionService(...).reader` (`get` / `openVerified`). No SQL. No auth provider. |
| HA3 | Nothing yet. Needs HA2 route + a second consumer directory. |
| Release owner | This branch vs H21 `codex/h21-package-release-gate-20260913` or `44b8ca0f` |

## Explicitly out of this delta

Public archives and catalog, `server/paid-useful-jobs/lib/http.mjs` routes, D14 `acquire.mjs`, outbox enqueue/ack, payment/settlement, process-local HTTP Map as authority.
