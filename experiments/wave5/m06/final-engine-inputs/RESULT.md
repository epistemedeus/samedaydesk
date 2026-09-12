# RESULT — W5-M06 final-engine-inputs

Independent final-input check of the **shipped** json-schema-webhook-drift
job. Not a second engine. Parent Co10 corpus
`experiments/wave5/m06/test/*.test.mjs` was not re-run as coverage.

**Verdict: FAIL.** Next owner: **W5-M02 / D01**
`tools/json-schema-webhook-drift/` (catalog pin
`27482b712a7221e5079d70df85c5dd5608dc70eb`). Root publishes after
reconciliation. This slot does not merge or deploy.

## Exact source

| Surface | Pin |
| --- | --- |
| D01 PR74 | `46f2b7f55a7fb780333073a5197b64b8fde64a33` |
| Public PR114 | `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` |
| Archive | `client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz` 2579117 bytes, sha256 `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` |
| Engine file | kit `engines/json-schema-webhook-drift/lib/compare.mjs` sha256 `71d2379f865e46d16f63f4f25fcb6d840d5f1f1d22fd4a2e3e216868c5b590b6` (byte-identical to D01 `tools/json-schema-webhook-drift/lib/compare.mjs`) |

Default CLI (file paths, not inline JSON):

```bash
cd "$KIT"   # useful-jobs-1.2.0
node bin/useful-jobs.mjs run json-schema-webhook-drift \
  --before <file> --after <file> --used <file> --out-dir <dir>
```

`--used` is `{ "pointers": [...] }`. Observed kit root:
`/tmp/w5-m06-kit-1.2.0/useful-jobs-1.2.0`. Node v22.14.0.

```bash
node --test --test-concurrency=1 experiments/wave5/m06/final-engine-inputs/test/*.test.mjs
node experiments/wave5/m06/final-engine-inputs/bin/check.mjs --out-dir "$OUT"
```

**3 pass, 0 fail, 0 skipped.** 25 cases. 14 specified-agree. 6 false-safe.
5 false-unsafe. 0 transport failures. Missing kit is incomplete, not a skip.

## Minimal counterexamples (used fields)

**False-safe.** Used pointer `""`. Nested `amount` `number` → `string`.
Official instance-set is incompatible. Engine: `ok: true`,
`unchangedCount: 1`, no breaking row (fingerprint stores property **names**
only at the used object).

**False-unsafe.** Used `/properties/amount`, `type: "integer"` → `"number"`.
Integers remain valid numbers. Engine: `breaking` / `type-change`.
D01 FEATURE-MAP also says every type change is breaking; that is coarser
than Draft 2020-12.

Same false-safe shape: additionalProperties **schema object** type change
(`O3`), `$ref` under `properties` while used is root (`R1`), advertised
`items` `minLength` (`O4`). Combinators `allOf` / `prefixItems` (`U1`,
`U3`) are not advertised; honest `unknown` would be acceptable; observed
`unchanged` is wrongly certain.

**False-unsafe also:** enum widen (`E1` `structural-change`); OpenAPI
`nullable` false→true (`N1`); `type: "string"` → `["string","null"]` (`N3`);
`type: "string"` vs `["string"]` (`T3`).

## Controls that still hold

No-change, unused sibling, description-only, useful type-change, kit sample
`samples/schema/h04-schema-01` (`exclusiveMinimum` boolean→number), `--example`,
missing-input refuse, enum narrow, enum reorder, number→integer, leaf used
`/properties/amount` type change, `$ref` when the used node **is** the `$ref`.

Unused sibling type change does not drive the used-path result.

## Not counted as this check's coverage

Spot probe only: Co10 gaps on boolean/required/additionalProperties
boolean/float/`exclusiveMinimum`/`$ref` siblings now match D01 directional
classes on this CLI. Bare document `true`/`false` is refused `not-json`
(`looksLikeYamlDocument` requires `{` or `[`). Property-level boolean schemas
still classify. Parent 20-case replay was not re-run.

purchaseAuthority=false. sold=false. customerBrief=false. No purchase,
customer files, production load, email, merge, deploy, or extra Cloud agents.
