# RECEIPT — W5-H04 child: schema-webhook examples

Owned path: `experiments/wave5-heavy/h04/examples/schema-webhook/`  
Parent session: `03efef00-6fd3-4435-b2d1-1b32a46661b8`  
Engine (read-only): `tools/json-schema-webhook-drift` @ `94c7bfdfeaa99f5e70f341504df3051cc7717f91`  
CLI: `node tools/json-schema-webhook-drift/bin/webhook-drift.mjs --before --after --used --out-dir`  
Runs: `/tmp/w5-h04/h04-child-schema-runs/` (not in the RO worktree)

Not a copy of W4 `tools/json-schema-webhook-drift/fixtures/*` (those use `/properties/amount` number→string). Not M06 semantic-unit corpora.

## Examples

| id | kind | fact | source SHAs | W4 stdout | oracle |
| --- | --- | --- | --- | --- | --- |
| `h04-schema-01` | change | `exclusiveMinimum` boolean→number | `d4c5b3a2924370c51b710c8bfd81d3644a92766e` → `4b495a2933b1d6f75298abdd23f018ba6a9d4f4a` (`json-schema-org/json-schema-spec` `schema.json`) | `status=actionable` `kind=json-schema` `breaking=1` type-change boolean→number; unused `exclusiveMaximum`/`const` absent | `actionable`, consumers break |
| `h04-schema-02` | change (unused additive) | GitHub `create` payload added `/repository/custom_properties` | `cdd43ea09fca0dc76c6af948b236cb12a7804e2c` → `bc5f6fd16b0df0e3058512e7d44dcba9ba3e0bb0` (`octokit/webhooks` `payload-examples/api.github.com/create/payload.json`) | `status=informational` `kind=webhook-example` `breaking=0` `unchangedCount=3`; `custom_properties` absent | `unchanged`, consumersBreak=false |
| `h04-schema-03` | no-change-control | CloudEvents used `id`/`type`/`source`/`specversion` identical; key order + unused `debug` | `d665aa6402a7ed5d0e506dc1c3cc408dba88d085` (v1.0 `json-format.md`; after is caller-owned permutation of that example) | `status=informational` `breaking=0` `unchangedCount=4`; `debug` absent | `unchanged`, no consumer action |

## Engine vs oracle

W4 labels used-path equality as `informational` (“Not a runtime compatibility proof”). The useful-job oracle uses `unchanged` when the buyer should take no consumer action. No engine rewrite.

## Failures

None. All three CLI invocations exited 0 against the new fixtures.
