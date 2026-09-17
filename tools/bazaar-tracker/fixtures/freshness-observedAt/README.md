# Freshness from `observedAt` only

Readback-only adapter for R11-BZ-04. Age is `clock - bazaar-observation.observedAt`.
`quality.lastCalledAt` is not a removal clock. Catalog absence is not demand.

Does not run `bazaar-tracker --live`, does not write `observations.json`, does not
invent a completeness watermark.

```
node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --pretty
node tools/bazaar-tracker/cli.mjs --readback --pretty --data-dir data/bazaar-tracker
node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --case cases/seeded-lastCalledAt-as-removal.json
node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --seeded cases/seeded-lastCalledAt-as-removal.json
node --test tools/bazaar-tracker/fixtures/freshness-observedAt/test.mjs
```

Pinned: committed `observedAt` `2026-09-03T09:54:04.798Z` is `stale` at
`2026-09-17T11:45:00.000Z` (`ageMs` 1216255202, `maxAgeMs` 86400000).
Seeded `quality.lastCalledAt` removal claim exits 1.
