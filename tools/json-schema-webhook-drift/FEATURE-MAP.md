# FEATURE-MAP — JSON Schema / webhook used-path drift

Offline SameDayDesk job. Used JSON Pointers only. Not OpenAPI. Not `api-upgrade-brief`.

## Caller goal

Given two local JSON documents (JSON Schema **or** webhook payload examples) and a used-path pin, emit a drift brief for those pointers only. Unused fields such as `/properties/debug` are ignored.

## Entrypoint

| Item | Value |
| --- | --- |
| CLI | `node tools/json-schema-webhook-drift/bin/webhook-drift.mjs` |
| Required flags | `--before` `--after` `--used` |
| Sample | `--example` (SAMPLE; cannot be a customer brief) |
| Outputs | `drift-brief.json`, `drift-brief.md` |
| Optional | `--out-dir` (else a temp directory) |

`--used` public shape:

```json
{ "pointers": ["/properties/amount"] }
```

## State / honesty

| Flag | Meaning |
| --- | --- |
| `usedOnly` | true |
| `notOpenApi` / `notApiUpgradeBrief` | true |
| `purchaseAuthority` / `sold` / `customerBrief` | false |
| `payment.settling` | false (nonsettling prototype) |
| `termsVersion` | I01 content hash `sha256:` + 64 lowercase hex |
| `schemaVersion` | integer `1` (shape only, not a claim key) |
| integer `termsVersion` on `--used` | refused `invalid_input` |

## Kind detection

| Input | Kind |
| --- | --- |
| `$schema` or JSON Schema `type` + `properties` / `$defs` / `definitions` | `json-schema` |
| Other JSON object/array (event payload) | `webhook-example` |
| `openapi` / `swagger` | refuse `not-this-job-openapi` |
| HTML or YAML | refuse |

Remote `$ref` (anything not starting with `#`) is refused. No fetch. Local `#` / `#/` only.

## Tests

```bash
node --test --test-concurrency=1 tools/json-schema-webhook-drift/test/*.test.mjs
```

| Class | What |
| --- | --- |
| Fixture | Journey type-change; unknown-both; static remote `$ref`; SAMPLE `--example`; webhook payload; integer termsVersion; OpenAPI; HTML; YAML; kind mismatch |
| Local-runtime | HTTP server serving a `$ref` URL; CLI refuse; request count 0 |
| External | Not run. No catalog bind. No live customer webhook. |

Account prerequisite: none. Node >= 22. No extra npm install. Ajv is not in the SDS lockfile; this job does not add it.

## Later integration (Root)

- Do not edit `client/public/for-agents/useful-jobs/catalog.json`.
- Hasher pin: `vendor/i01-hash-terms/` from Neo PR54 `819fa637`. Inject live `hashTermsVersion` via `lib/hash-adapter.mjs` when that pack is on SDS main.
- F08 paid wrapper and useful-jobs archive admission are out of this owned path.
