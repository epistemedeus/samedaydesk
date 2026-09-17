# Seeded false-accept / false-reject

Hostile catalog rows. A naive consumer that treats `claimedVerdict` as the required product verdict must fail.

| id | claimed | product | catch |
| --- | --- | --- | --- |
| [false-accept.json](./false-accept.json) | accept SHA mismatch | reject `wrong-digest` | `SEED_REJECT` / `false_accept` |
| [false-reject.json](./false-reject.json) | reject valid evidence | accept `valid_record` | `SEED_REJECT` / `false_reject` |

```bash
node tests/regression/corpus/run.mjs --seeded-failure --json
node tests/regression/corpus/run.mjs --fixture tests/regression/corpus/fixtures/seeded/false-accept.json --json
node tests/regression/corpus/run.mjs --seeded-false-reject --json
```

Default `run.mjs` still **catches** these rows (status `caught`) and exits 0.
The `--seeded-failure` path feeds the hostile claim as required truth and exits 1.
