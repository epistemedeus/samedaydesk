# FEATURE-MAP — W5-M06 final-engine-inputs

Independent final-input check of the **shipped** json-schema-webhook-drift
job. Not a second comparison engine. Not a re-run of `../test/*.test.mjs`.

## Caller goal

Replay a compact used-path corpus through the public kit CLI and compare
Draft 2020-12 (plus advertised `nullable`) instance-set labels to the
engine's certain safe/unsafe claims.

## Entrypoint

| Item | Value |
| --- | --- |
| Default CLI | `node bin/useful-jobs.mjs run json-schema-webhook-drift` from useful-jobs 1.2.0 |
| Required | `--before <file>` `--after <file>` `--used <file>` |
| Optional | `--out-dir` `--example` |
| `--used` | `{ "pointers": ["/properties/…"] }` (file, not inline JSON) |
| Outputs | `drift-brief.json`, `drift-brief.md` |
| This check | `node experiments/wave5/m06/final-engine-inputs/bin/check.mjs` |

## Honesty

| Flag | Meaning |
| --- | --- |
| `purchaseAuthority` / `sold` / `customerBrief` | false |
| `payment.settling` | false |
| Kit | PR114 archive `useful-jobs-1.2.0.tar.gz` (byte-identical on D01) |
| Engine file | `engines/json-schema-webhook-drift/lib/compare.mjs` sha256 `71d2379f…` |

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m06/final-engine-inputs/test/*.test.mjs
node experiments/wave5/m06/final-engine-inputs/bin/check.mjs --out-dir "$OUT"
```

Missing kit is incomplete (exit 1), not a skipped pass. Postgres is not used.
No purchases, customer files, production load, email, merge, or deploy.
