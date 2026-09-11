# RECEIPT — W5-D02 Co05 input materialization/preflight adapter

**Repo:** epistemedeus/samedaydesk
**Working branch:** `cursor/w5-d02-co05-input-materialization-preflight-adapter-including-inline-json-and-catalog-schemas-20f2`
**Designated branch:** `codex/w5-d02-20260911`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/113
**Starting ref:** `2bd0207800ce1a26bae7fe5dd5086cf196296959` (W4-commerce-05 / PR 67)
**Owned paths:** `tools/job-input-preflight/`, `experiments/wave5/d02/RECEIPT.md`
**Integration owner:** W5-D01

## Outcome

Public CLI materializes caller files or inline JSON, validates `useful-jobs.catalog.v1` and job input schemas on the staged bytes, refuses disguised SAMPLE, and always writes those exact bytes to `stagedPath`. `toWrapperRequest` emits only those file paths (never re-stringified inline JSON) for D01 `createExecutor` / `runPaidOffer`.

ok:true is bounded by execution.v1 `MAX_INPUT_BYTES` (1_048_576). A 1 MiB+1 payload that is still under the kit 8 MiB cap is `input-oversize`, matching D01 `input-guard.mjs` at the pin below. The kit 8 MiB bound remains `input-too-large`. This is compatible behavior, not a misleading green preflight.

The wrapper kernel is not copied into this package.

## Tested D01 pin (read-only)

| Field | Value |
| --- | --- |
| SHA | `6bed72dd22a396134aa5c957933b42c3a5746698` |
| Ref | `codex/w5-d01-20260911` |
| PR | https://github.com/epistemedeus/samedaydesk/pull/74 |
| Contract | `samedaydesk.paid-useful-jobs.execution.v1` |
| Entry | `server/paid-useful-jobs/index.mjs` `createExecutor` / `runPaidOffer` |
| CLI | `node server/paid-useful-jobs/bin/cli.mjs run <job-id>` |

`inspectSample` at this pin detects inline JSON SAMPLE strings. D01 concurrent/freeze tests are still closing separately; this adapter does not claim a later head.

## Remaining limits

- D01 now also refuses vendor-budget-impact pricing-row schema at service entry (`input-schema-mismatch`). This adapter still gates first.
- Unfunded SAMPLE may run as labeled sample on D01; reserved-fixture SAMPLE is `sample-not-a-sale`. This adapter refuses SAMPLE as `disguised-sample` before bind.
- Kit 8 MiB vs execution 1 MiB is explicit (`input-too-large` vs `input-oversize`).
- Postgres is not a surface of this package.

## Commands / counts

```bash
node --test --test-concurrency=1 tools/job-input-preflight/test/*.test.mjs
```

**PASS** — 39 tests, 0 fail, 0 skip, Node v22.14.0.

Positive: custom caller files, inline JSON (exact staged bytes), exact 1 MiB bound — preflight `ok: true` and D01 `ok: true` with matching receipt input sha256.

Negative: schema-invalid (`input-schema-mismatch`), SAMPLE sibling and inline SAMPLE (`disguised-sample`), 1 MiB+1 (`input-oversize` on both), file > 8 MiB (`input-too-large`), catalog/JSONL/digest seeded failures.

## Proof at the real CLI, then the same staged bytes through D01

| Attempt | Preflight | D01 CLI/library at 6bed72dd |
| --- | --- | --- |
| Custom caller files | `ok: true` | `ok: true`, `execution.v1`, receipt input sha256 matches staged |
| Inline JSON custom rows | `ok: true` (staged files) | `ok: true` on those staged paths, not the original strings |
| Syntax-valid JSON without `rows` | `input-schema-mismatch` | May still run (no pricing-row schema); not claimed as a crash |
| SAMPLE.txt sibling | `disguised-sample` | `sample: true` unfunded; `sample-not-a-sale` reserved-fixture |
| Inline JSON `"label":"SAMPLE"` | `disguised-sample` | same SAMPLE labeling / reserved-fixture refuse |
| 1 MiB+1 under kit cap | `input-oversize` | `input-oversize` |
| Exact 1 MiB | `ok: true` | `ok: true` |
| File > 8 MiB | `input-too-large` | not required (would also be oversize) |

No live HTTP to samedaydesk.com. No spend.

## pstack / model

Read installed pstack skills from plugin cache `9717366`. No `pstack-models.mdc` on this VM. No slash-command expansion. Parent model: Cursor Grok 4.6 xhigh. No extra Cloud agents.
