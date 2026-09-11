# RECEIPT — W4-commerce-10 JSON Schema / webhook used-path drift

Repo: `epistemedeus/samedaydesk`  
Branch: `codex/w4-commerce-10-20260911`  
Starting ref: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`  
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/59  
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-10-20260911  
Owned path: `tools/json-schema-webhook-drift/`  
Next integration owner: Root

## Source pins (read-only)

| Input | Result |
| --- | --- |
| `client/public/for-agents/useful-jobs/catalog.json` | Present at starting SHA. Contrast only. Not edited. |
| `experiments/s134-record-jobs/README.md` | Present. OpenAPI/CSV/pricing/RSS; no JSON Pointer webhook job. |
| `experiments/s134-record-jobs/modules/openapi-impact/cli.mjs` | Present. Used-operation OpenAPI. Not copied. |
| Ajv in SDS `package-lock.json` | Absent. Structural compare. No new dependency. |
| I01 Neo PR54 hasher | `vendor/i01-hash-terms/` from `819fa637ecf5e5177c84efc16fcaa18d57017631` (`canonical.mjs`, `hash.mjs`, LICENSE). Not `services/earned-work`. Not original F01 kernel. |

Environment swarm skill (`pstack/skills/swarm` at `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d`) was installed under `.cursor/skills/pstack-swarm` only. Not a product diff.

## Commands and counts

Node `v22.14.0`. No `npm install` for this module.

```bash
node --test --test-concurrency=1 tools/json-schema-webhook-drift/test/*.test.mjs
```

**15 pass, 0 fail** (`hash-terms` 2, `local-http-ref` 1, `webhook-drift` 12).

```bash
node tools/json-schema-webhook-drift/bin/webhook-drift.mjs \
  --before tools/json-schema-webhook-drift/fixtures/journey/before.json \
  --after tools/json-schema-webhook-drift/fixtures/journey/after.json \
  --used tools/json-schema-webhook-drift/fixtures/journey/used.json \
  --out-dir "$OUT"
```

Journey stdout: `ok=true` `kind=json-schema` `status=actionable` `breaking=1` `unknown=0` `customerBrief=false` `purchaseAuthority=false` `sold=false`. Brief lists `/properties/amount` `type-change` number to string. `/properties/debug` absent from the brief.

## Caller journey (useful)

A caller who consumes a payment webhook schema pins `/properties/amount`. After a vendor changes that field from number to string, this job reports that one breaking used-path change. A debug field that also changed is ignored because it is not in `--used`.

## Seeded failures

| Case | Class | Result |
| --- | --- | --- |
| Remote `$ref` (`https://example.invalid/...`) | fixture | `remote-ref-refused`, exit 2, no brief files |
| Live `http://127.0.0.1:$port/...` `$ref` | local-runtime | same refuse; HTTP hit count 0 |
| Used path missing in both | fixture | `unknown` / `absent-in-both`, not deleted, status `partial` |
| `--example` | fixture SAMPLE | `sample=true` `customerBrief=false`; markdown says SAMPLE is not a customer brief |
| Integer `termsVersion` | fixture | `invalid_input` (I01: hash only) |
| OpenAPI document | fixture | `not-this-job-openapi` |
| HTML / YAML | fixture | `html-or-markup` / `not-json` |
| Schema vs payload mix | fixture | `kind-mismatch` |

## Honestly untested

- Real Postgres: not applicable. This job has no store, no ledger, no payment row.
- External acceptance: live vendor webhook, public HTTPS `$ref`, catalog admission, F08 wrap, useful-jobs archive.
- Local `#/` `$ref` retarget vs inline (implemented, no dedicated fixture).
- JSON Pointer `~0` / `~1` escaping.
- I01 golden funded-task-terms document `sha256:c82f232d...` (that document is not this job's input; hasher source is pinned instead).
- Sibling W4 modules. Consumed only through injected hasher adapter.

## Payments

All Wave 4 payments here are explicitly nonsettling prototypes. This CLI never charges, settles, or sends customer messages.

## Licenses

Pinned hasher MIT: `vendor/i01-hash-terms/LICENSE`. No other third-party code added.
