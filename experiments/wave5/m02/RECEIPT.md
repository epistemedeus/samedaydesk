# RECEIPT — W5-M02 Co10 JSON-schema compatibility semantics

Repo: `epistemedeus/samedaydesk`  
Branch: `cursor/w5-m02-co10-json-schema-compatibility-semantics-a811`  
Starting pin: `94c7bfdfeaa99f5e70f341504df3051cc7717f91` (W4-commerce-10 / PR 59)  
Exact head: `ae78da64b0c56f848c7a2dec82afa7bec0b1d858`  
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/79  
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...cursor/w5-m02-co10-json-schema-compatibility-semantics-a811  
Owned paths: `tools/json-schema-webhook-drift/`, `experiments/wave5/m02/RECEIPT.md`  
Integration owner: W5-M01

## Source

Fetched GitHub `94c7bfdfeaa99f5e70f341504df3051cc7717f91` (`lib/compare.mjs` blob `f915e8c2`). Read-only worktree of PR52 `aeef964fa188443078958d9d6d393afae1d542ee` for wrapper refuse semantics. No wrapper or catalog copied.

REVIEW-INTEGRATION Co10: false schemas, `$ref` siblings, required-field and numeric changes need semantic fixtures. Reproduced at the pin before editing:

| Case | Pin `94c7bfd` CLI |
| --- | --- |
| `false` → `true` schema | `unchanged` (both `{kind:literal,jsonType:boolean}`) |
| `$ref` + sibling `minimum: 0.5` | `unchanged` (siblings dropped) |
| `required` added / removed | both `breaking` / `structural-change` |
| float `minimum` 0.5 → 1.5 | `unchanged` (`intOrNull` dropped non-integers) |

## Fix

Instance-set classification on the existing CLI. `impact.compatible` added (`schemaVersion` 2). Public export: `lib/contract.mjs`. Compatible/no-change stay `ok: true` exit 0. Input/remote-ref refuse stays exit 2. Non-integer bounds are decimal strings in fingerprints so the pinned I01 hasher (integers only) can hash the brief. Hasher source not replaced.

## Tests

Node `v22`. No extra npm install. No Postgres (this job has no store).

```bash
node --test --test-concurrency=1 tools/json-schema-webhook-drift/test/*.test.mjs
```

**27 pass, 0 fail, 0 skip** (`compatibility-semantics` 12, `hash-terms` 2, `local-http-ref` 1, `webhook-drift` 12).

Local-runtime: HTTP `$ref` still refused, 0 fetches. External catalog/F08 wrap: not run.

## pstack

Account plugin `9717366` v0.15.1 pin `68d834d9`. Read `setup-pstack`, `principle-prove-it-works`, `tdd`, `principle-test-behavior-not-implementation`, `figure-it-out`, `principle-fix-root-causes`, `principle-subtract-before-you-add`, `principle-sequence-verifiable-units`. No `/swarm`, no Task/Cloud children. Parent model: included Cursor Grok 4.6 xhigh. No `pstack-models.mdc` write.

## Integration limits

Tested this branch against Co10 pin `94c7bfd` plus this amendment. Remaining bind: M01 catalog/engine wiring; F08 wrapper at `aeef964` is not claimed here. M06 may replay these fixtures. Unlike terms documents are not forced to equal hashes.
