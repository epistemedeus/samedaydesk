# W5-D11 RECEIPT — Co01 request-desk adapter with honest replay

**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d11-co01-request-desk-adapter-with-honest-replay-outcomes-b00e`
**HEAD:** `c68f79e7ad15a07f988ddedd2cb8390b346a88cc` (receipt commit updates this)
**PR:** https://github.com/epistemedeus/samedaydesk/pull/85 (draft)
**Owned paths:** `tools/job-request-desk/`, `experiments/wave5/d11/RECEIPT.md`
**Starting ref:** `912794c6775e16e93dc38cbfc7113a97ab5dc012`
**Tested SDS52:** `aeef964fa188443078958d9d6d393afae1d542ee` (PR52)
**Integration owner:** W5-D01
**D01 head:** not on origin (`codex/w5-d01-20260911` missing). Remaining binding is D01's later `server/paid-useful-jobs` contract. This adapter does not claim that later head.

## Source-only predictions reproduced

At `912794c`, `createRequest` returned `{ ok: true, ...existing }` for any non-queued ticket. A rejected ticket replayed as success. Caller `outDir` plus `listOutputs` existence filtering listed leftover `budget-impact.json` as a completed result after a subset engine write.

## Fix

Rejected and other failure tickets replay as `ok: false`, `refused: true`, CLI exit 2, HTTP POST 400. Engine writes go to `store/results/<requestId>/` after catalog names are cleared. Missing catalog outputs stay `incomplete-outputs`, not completed. Valid analysis `status: refused` with complete artifacts stays `completed` + `outcomeKind: analysis-refused`, not a transport crash. Jobs run through the SDS52 wrapper CLI. The wrapper source is not copied into this tree.

## Tests

```bash
node --test tools/job-request-desk/test/*.test.mjs
```

**PASS** — 20 tests, 0 fail, 0 skip. Node v22.14.0. Kit extract plus SDS52 CLI and `node:http` on `127.0.0.1`. No Postgres in this product path (JSON `--store`). No skipped gates.

| Kind | What ran |
| --- | --- |
| Process | SDS52 `bin/cli.mjs list` at pin aeef964f |
| CLI | rejected replay stays refused; clean create after stale result-dir files |
| HTTP | POST rejected replay 400; subset leftover names cannot complete |
| Journey | vendor-budget-impact create/status/list/defer through SDS52 |
| Seeded | example/SAMPLE/missing/unknown/path-escape/integer-terms/order-swap/digest |

pstack: marketplace plugin `9717366` v0.15.1 pin `68d834d9`, 47 skills on disk. Skills read from cache (poteto-mode, prove-it-works, tdd, how, no-comments, unslop, technical-writing, model-the-domain, boundary-discipline, laziness, sequence-verifiable-units, fix-root-causes, make-operations-idempotent). No slash expansion. No `pstack-models.mdc`. Parent model `cursor-grok-4.6-xhigh`. No extra Cloud agents.

## Limits

D01 may amend the wrapper. Tested pin remains aeef964f. `--out-dir` is ignored in favor of the request-scoped result dir. Live settlement stays out of scope. `sold` is always false.
