# Feature map — W5-D02 job input preflight adapter

| Field | Value |
| --- | --- |
| User goal | Materialize caller files or inline JSON, validate catalog + job input schemas, refuse disguised SAMPLE, stage exact bytes, and emit a D01 `runPaidOffer` request that the pinned execution.v1 CLI/library can consume. |
| Entrypoint | `tools/job-input-preflight/` (`bin/preflight.mjs`, `lib/index.mjs`) |
| Command | `node tools/job-input-preflight/bin/preflight.mjs vendor-budget-impact --before caller/vendor-budget-impact/before.json --after caller/vendor-budget-impact/after.json --input-root tools/job-input-preflight/fixtures` |
| State | `ok: true` with staged `digest` (`sha256:` + 64 hex) and `stagedPath`; refusals exit 2. `engineInvoked` is always false. `purchaseAuthority` / spend / tool-cost claims are always false. `limitBytes` is the execution.v1 1 MiB cap. |
| Tests | `node --test --test-concurrency=1 tools/job-input-preflight/test/*.test.mjs` |
| Account prerequisite | None. Offline Node 22. No wallet, facilitator, Postgres, or live SDS HTTP. D01 bind uses this tree's `server/paid-useful-jobs/`. |

## Test map

| Class | What | Command / evidence |
| --- | --- | --- |
| Journey | Custom caller vendor-budget-impact JSON; `ok: true`; no engine artifacts | `test/journey.test.mjs`, `test/entry-point.test.mjs` |
| Proof refuse | Syntax-valid JSON without `rows` | `input-schema-mismatch` |
| Proof refuse | SAMPLE.txt sibling / JSON `label: SAMPLE` / inline SAMPLE JSON / `.txt` SAMPLE | `disguised-sample` |
| Proof accept | Inline JSON custom rows; custom catalog pin | `ok: true` |
| Catalog refuse | JSON Schema draft, `schema: false`, JSONL catalog | `catalog-schema-mismatch` / `catalog-jsonl-not-document` |
| Seeded refuse | Missing `--after`; path/symlink escape; file > 8 MiB; digest mismatch; integer digest | `test/seeded-failures.test.mjs` |
| Size bound | 1 MiB+1 under kit cap is `input-oversize`; exact 1 MiB is accepted | `test/kit-alignment.test.mjs`, `test/d01-execution-bind.test.mjs` |
| D01 consume | In-repo `inspectSample` detects inline JSON SAMPLE; this CLI still refuses | `test/d01-consume.test.mjs` |
| D01 bind | Same staged paths/bytes through `bin/cli.mjs` and `runPaidOffer` | `test/d01-execution-bind.test.mjs` |
| Local-runtime | Real `catalog.json` + archive sha/bytes; extract kit 8 MiB cap | `test/kit-alignment.test.mjs` |
| Local HTTP | Serve the real catalog on `127.0.0.1` | same file |
| External | Not claimed | No live samedaydesk.com or payment |

## D01 execution.v1 pin

Contract: `lib/contract.mjs` `PREFLIGHT_CONTRACT` / `toWrapperRequest`. Tested D01 pin is this tree (`codex/w5-d01-20260911`, PR 74). Export: `createExecutor` / `runPaidOffer` from `server/paid-useful-jobs/index.mjs`. Version string `samedaydesk.paid-useful-jobs.execution.v1` is asserted, not assumed from a later sibling. Historical D02 pin `6bed72dd` is not spawned.

Compatible size behavior: kit 8 MiB remains `input-too-large`; execution 1 MiB is `input-oversize` so preflight cannot go green past the wrapper. D01 also enforces pricing-row schema at service entry; this adapter still refuses first.
