# FEATURE-MAP — W5-M06 schema compatibility corpus

Independent test-vector package. Not a second JSON Schema drift engine.

## Caller goal

Replay a labeled corpus of valid and incompatible JSON Schema pairs through the
**current pinned** Co10 CLI (`webhook-drift.mjs --before --after --used`) and
prove the labels with Draft 2020-12 instance witnesses.

## Entrypoint

| Item | Value |
| --- | --- |
| CLI | `node experiments/wave5/m06/bin/replay.mjs` |
| Optional | `--engine-root <sds-or-module-root>` `--out-dir <dir>` |
| Env | `W5_M02_ENGINE_ROOT` (SDS checkout or `tools/json-schema-webhook-drift`) |
| Default engine | Git worktree of PIN `engine.sha` (not copied into owned paths) |
| Outputs | `replay-report.json` |

## Honesty

| Flag | Meaning |
| --- | --- |
| `purchaseAuthority` / `sold` / `customerBrief` | false |
| `payment.settling` | false |
| Engine tested | Co10 `94c7bfdfeaa99f5e70f341504df3051cc7717f91` unless env overrides |
| M02 amended engine | Remaining binding. This receipt does not claim a later sibling. |

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m06/test/*.test.mjs
node experiments/wave5/m06/bin/replay.mjs --out-dir "$OUT"
```

Postgres is not used. A missing engine is incomplete, not a green skip.
