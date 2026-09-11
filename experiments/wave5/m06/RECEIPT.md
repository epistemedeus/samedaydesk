# RECEIPT — W5-M06 independent schema compatibility corpus

Repo: `epistemedeus/samedaydesk`  
Branch: `cursor/w5-m06-independent-schema-compatibility-corpus-from-specified-schema-semantics-9ed7`  
Starting ref: PR52 `aeef964fa188443078958d9d6d393afae1d542ee`  
Owned path: `experiments/wave5/m06/`  
Engine tested: Co10 `94c7bfdfeaa99f5e70f341504df3051cc7717f91` (PR 59) via git worktree, not vendored  
Integration owner: W5-M01 (catalog). Engine owner: W5-M02.

## Outcome

Independent Draft 2020-12 instance-set corpus with valid and incompatible
witnesses. Replay uses the public Co10 CLI
`node tools/json-schema-webhook-drift/bin/webhook-drift.mjs --before --after --used`.
This package does not copy that engine.

Nontrivial compatible and incompatible cases distinguish an always-pass
classifier and an always-fail classifier. Co10 is neither: it still reports
used-path type change and ignores unused debug.

## Source predictions reproduced (Co10 pin)

| Specified case | Specified | Co10 at 94c7bfd |
| --- | --- | --- |
| `false-schema-true-to-false` | incompatible | unchanged (boolean `true`/`false` fingerprint as the same jsonType) |
| `items-true-to-false` | incompatible | unchanged |
| `numeric-float-minimum-raised` | incompatible | unchanged (`intOrNull` drops 0.5 / 1.5) |
| `exclusive-minimum-added` | incompatible | unchanged |
| `ref-sibling-minimum-added` | incompatible | unchanged (siblings dropped after `$ref`) |
| `required-field-removed` | compatible weakening | breaking |
| `additional-properties-false-to-true` | compatible weakening | breaking |
| `false-schema-false-to-true` | compatible weakening | unchanged (not breaking; weakening unclassified) |

Integer `minimum` raise, required add, additionalProperties true to false,
const change, local `$ref` retarget, required order-only, description-only,
unused-path-only, remote `$ref` refuse, and integer `termsVersion` refuse match
the pin. Refuses are analysis refusals (exit 2), not crashes.

Unlike schema pairs keep unlike `termsVersion` hashes. Identical replay is
stable. Integer `termsVersion` is refused rather than forced equal to an I01
content hash.

## Commands

```bash
node --test --test-concurrency=1 experiments/wave5/m06/test/*.test.mjs
node experiments/wave5/m06/bin/replay.mjs --out-dir "$OUT"
```

Node v22. **13 pass, 0 fail, 0 skipped.** Corpus: 20 cases, pinMatch 20,
witnessesOk 20, specifiedAgree 13, gaps 7, transportFailures 0.
Local HTTP `$ref` hit count 0. Postgres not used (no store). Missing
`--engine-root` is incomplete (exit 1), not a skip.

pstack plugin cache `0.15.1` present. Skills read: prove-it-works,
test-behavior-not-implementation, boundary-discipline, laziness-protocol,
sequence-verifiable-units, no-comments, setup-pstack. Run model
`cursor-grok-4.6-xhigh`. Literal slash commands were not invoked. No extra
Cloud agents.

## Remaining integration binding

W5-M02 owns `tools/json-schema-webhook-drift/` semantics (false schemas,
numeric bounds, `$ref` siblings, weakening vs strengthening). Re-run
`bin/replay.mjs` with `W5_M02_ENGINE_ROOT` on that export. This receipt does
not claim a later M02 head. W5-M01 catalog admission is unbound.

## Honesty

purchaseAuthority=false. sold=false. customerBrief=false. payment.settling=false.
No deploy, spend, payout, or outbound message.
