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
| `schemaVersion` | integer `2` (shape only, not a claim key). Adds `impact.compatible`. |
| integer `termsVersion` on `--used` | refused `invalid_input` |

## Kind detection

| Input | Kind |
| --- | --- |
| `$schema` or JSON Schema `type` + `properties` / `$defs` / `definitions` | `json-schema` |
| Other JSON object/array (event payload) | `webhook-example` |
| `openapi` / `swagger` | refuse `not-this-job-openapi` |
| HTML or YAML | refuse |

Remote `$ref` (anything not starting with `#`) is refused. No fetch. Local `#` / `#/` only.

## Compatibility contract (instance-set)

Public export: `lib/contract.mjs`. CLI stdout keeps `ok: true` and exit 0 for a valid analysis, including weakening/`compatible` and no-change. Transport/input failure is `ok: false`, `refused: true`, exit 2. PR52's wrapper treats nonzero exit or `ok === false` as engine refusal; do not project a compatible report into that path.

| Used-path change | class | reason |
| --- | --- | --- |
| JSON Schema `false` → `true`, or `false` → a schema object | `compatible` | `boolean-schema-weakened` |
| `true` → `false`, schema object → `false`, or `true` → a schema object | `breaking` | `boolean-schema-tightened` |
| Array `items` boolean `true` → `false` (used path is the array schema) | `breaking` | `boolean-schema-tightened` |
| Constraint keyword beside `$ref` (draft 2019-09 siblings apply) | same directional classes | e.g. `numeric-tightened` |
| Annotation-only `$ref` siblings (`description`, `title`, `$comment`) | `unchanged` | instance set unchanged |
| `required` name added | `breaking` | `required-added` |
| `required` name removed | `compatible` | `required-removed` |
| Numeric bound tightened, including non-integers and `exclusiveMinimum`/`exclusiveMaximum` | `breaking` | `numeric-tightened` (non-integer bounds are decimal strings in fingerprints because the pinned I01 hasher rejects non-integer JSON numbers) |
| Numeric bound weakened | `compatible` | `numeric-weakened` |
| Type change | `breaking` | `type-change` |

Unlike schema documents are not forced to equal hashes. `termsVersion` remains the I01 content hash of this brief.

## Tests

```bash
node --test --test-concurrency=1 tools/json-schema-webhook-drift/test/*.test.mjs
```

| Class | What |
| --- | --- |
| Fixture | Journey type-change; boolean `false`/`true` schemas; `$ref` constraint siblings; required added/removed; float numeric tighten/weaken; unknown-both; static remote `$ref`; SAMPLE `--example`; webhook payload; integer termsVersion; OpenAPI; HTML; YAML; kind mismatch |
| Local-runtime | HTTP server serving a `$ref` URL; CLI refuse; request count 0 |
| External | Not run. No catalog bind. No live customer webhook. |

Account prerequisite: none. Node >= 22. No extra npm install. Ajv is not in the SDS lockfile; this job does not add it.

## Later integration (Root)

- Do not edit `client/public/for-agents/useful-jobs/catalog.json`.
- Hasher pin: `vendor/i01-hash-terms/` from Neo PR54 `819fa637`. Inject live `hashTermsVersion` via `lib/hash-adapter.mjs` when that pack is on SDS main.
- F08 paid wrapper (`aeef964fa188443078958d9d6d393afae1d542ee`) and useful-jobs archive admission are out of this owned path. Remaining bind: M01 catalog/engine wiring. Consumers should test this branch head, not a future sibling.
