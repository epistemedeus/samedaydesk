# Feature map — W5-D02 job input preflight adapter

| Field | Value |
| --- | --- |
| User goal | Materialize caller files or inline JSON, validate catalog + job input schemas, refuse disguised SAMPLE, and emit a D01 `runPaidOffer` request shape without running the engine. |
| Entrypoint | `tools/job-input-preflight/` (`bin/preflight.mjs`, `lib/index.mjs`) |
| Command | `node tools/job-input-preflight/bin/preflight.mjs vendor-budget-impact --before caller/vendor-budget-impact/before.json --after caller/vendor-budget-impact/after.json --input-root tools/job-input-preflight/fixtures` |
| State | `ok: true` with staged `digest` (`sha256:` + 64 hex); refusals exit 2. `engineInvoked` is always false. `purchaseAuthority` / spend / tool-cost claims are always false. |
| Tests | `node --test --test-concurrency=1 tools/job-input-preflight/test/*.test.mjs` |
| Account prerequisite | None. Offline Node 22. No wallet, facilitator, Postgres, or live SDS HTTP. |

## Test map

| Class | What | Command / evidence |
| --- | --- | --- |
| Journey | Custom caller vendor-budget-impact JSON; `ok: true`; no engine artifacts | `test/journey.test.mjs`, `test/entry-point.test.mjs` |
| Proof refuse | Syntax-valid JSON without `rows` | `input-schema-mismatch` |
| Proof refuse | SAMPLE.txt sibling / JSON `label: SAMPLE` / inline SAMPLE JSON / `.txt` SAMPLE | `disguised-sample` |
| Proof accept | Inline JSON custom rows; custom catalog pin | `ok: true` |
| Catalog refuse | JSON Schema draft, `schema: false`, JSONL catalog | `catalog-schema-mismatch` / `catalog-jsonl-not-document` |
| Seeded refuse | Missing `--after`; path/symlink escape; file > 8 MiB; digest mismatch; integer digest | `test/seeded-failures.test.mjs` |
| D01 consume | SDS52 `inspectSample` at `aeef964f` misses inline JSON SAMPLE; this CLI still refuses | `test/d01-consume.test.mjs` |
| Local-runtime | Real `catalog.json` + archive sha/bytes; extract kit cap | `test/kit-alignment.test.mjs` |
| Local HTTP | Serve the real catalog on `127.0.0.1` | same file |
| External | Not claimed | No live samedaydesk.com or payment |

## Later integration (W5-D01)

Contract: `lib/contract.mjs` `PREFLIGHT_CONTRACT` / `toWrapperRequest`. Tested D01 pin is SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`. That pin's `inspectSample` does not see inline JSON strings; this adapter refuses them at the CLI. D01 still enforces its 1 MiB cap after bind. This package never claims spend, tool cost, or settlement.
