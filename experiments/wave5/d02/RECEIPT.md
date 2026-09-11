# RECEIPT — W5-D02 Co05 input materialization/preflight adapter

**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d02-co05-input-materialization-preflight-adapter-including-inline-json-and-catalog-schemas-20f2`
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...cursor/w5-d02-co05-input-materialization-preflight-adapter-including-inline-json-and-catalog-schemas-20f2
**Starting ref:** `2bd0207800ce1a26bae7fe5dd5086cf196296959` (W4-commerce-05 / PR 67)
**Owned paths:** `tools/job-input-preflight/`, `experiments/wave5/d02/RECEIPT.md`
**Integration owner:** W5-D01

## Outcome

Public CLI materializes caller files or inline JSON, validates `useful-jobs.catalog.v1` and job input schemas on the staged bytes, and refuses disguised SAMPLE. It does not run the useful-jobs engine or any payment path.

## Source predictions reproduced

At `2bd0207`, the CLI accepted syntax-valid `{"hello":"world"}` for vendor-budget-impact (`ok: true`) and accepted SAMPLE.txt-sibling kit copies as custom input. Inline JSON was treated as a missing path. JSONL was labelled malformed JSON. SDS52 `inspectSample` at `aeef964fa188443078958d9d6d393afae1d542ee` returned `{ sample: false }` for an inline JSON string with `"label":"SAMPLE"`.

Fixes stay in this adapter: schema checks on staged bytes, JSONL distinguished from JSON documents, inline JSON staged, SAMPLE refused at the CLI. F08 `input-guard.mjs` / `sample-guard.mjs` were not copied.

## Tested D01 pin (not a future sibling claim)

| Field | Value |
| --- | --- |
| Implementation | SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`fable/f08-paid-wrappers`) |
| Entry | `server/paid-useful-jobs/lib/wrapper.mjs#runPaidOffer` |
| Remaining binding | Pass `toWrapperRequest(preflight)` into `runPaidOffer`. D01 Wave5 export was not published. That pin's `inspectSample` misses inline JSON strings; this CLI refuses them. D01 1 MiB cap still applies after bind; this adapter uses the kit 8 MiB cap. |

## Commands / counts

```bash
node --test --test-concurrency=1 tools/job-input-preflight/test/*.test.mjs
```

**PASS** — 30 tests, 0 fail, 0 skip, Node v22.14.0.

Proof at the real CLI:

| Attempt | Result |
| --- | --- |
| Custom caller `fixtures/caller/vendor-budget-impact/*.json` | `ok: true` |
| Inline JSON custom rows | `ok: true` |
| Syntax-valid JSON without `rows` | `input-schema-mismatch` exit 2 |
| SAMPLE.txt sibling kit copies | `disguised-sample` exit 2 |
| Inline JSON `"label":"SAMPLE"` | `disguised-sample` exit 2 |
| JSON Schema draft / `schema:false` catalog | `catalog-schema-mismatch` |
| JSONL catalog | `catalog-jsonl-not-document` |
| Valid custom catalog pin | `ok: true` |

Postgres is not a surface of this package (no DB, no skip-as-pass). No live HTTP to samedaydesk.com. No spend.

## pstack / model

Read installed pstack skills from plugin cache `9717366` (`tdd`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-boundary-discipline`, `principle-subtract-before-you-add`, `setup-pstack`). No `pstack-models.mdc` on this VM. No slash-command expansion. Parent model: Cursor Grok 4.6 xhigh. No extra Cloud agents.
