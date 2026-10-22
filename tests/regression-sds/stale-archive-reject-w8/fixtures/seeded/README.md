Seeded failure is `fixtures/cases/stale-110-as-current.json`.

Feed it as accept:

```
node tests/regression-sds/stale-archive-reject-w8/run.mjs --seeded-failure --json
```

Must exit 1 with `error.code` `SEED_REJECT`. Does not pay.
