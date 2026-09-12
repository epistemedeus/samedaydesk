# W5-M01 job catalog contract

**Catalog schema:** `samedaydesk.wave5.m01.engine-catalog.v1`  
**Job contract export:** `samedaydesk.wave5.m01.job-catalog.v1`  
**D01 execution contract (read-only):** `samedaydesk.paid-useful-jobs.execution.v1` at `6bed72dd22a396134aa5c957933b42c3a5746698`

This package executes the four imported engine CLIs. It does not copy their compare kernels. D01 owns the paid-offer consumer (`server/paid-useful-jobs/`). Fresh callers select engines through that consumer, not `runCatalogPaidOffer`.

## Consumer

D01 default `createExecutor` / `runPaidOffer` / `bin/deliver.mjs` injects `createM01AwareGetJob` and `runEngineForD01`. Supply caller lockfiles (not fixture paths from this repository):

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

Accepted lockfile inputs: npm `package-lock.json` with `lockfileVersion` 2 or 3. Equality uses `name`, `version`, `integrity`, and `resolved`. Not yarn/pnpm/bun/HTML or package.json-only.

Catalog package CLI (not the paid-offer path):

```bash
node experiments/wave5/m01/bin/catalog.mjs contract
node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs
```

Library: `runCatalogJob` / `invokeEngine` from `experiments/wave5/m01/index.mjs`. `runCatalogPaidOffer` is an adapter remaining for tests, not the consumer.

## Outcome mapping

| Kind | Meaning |
| --- | --- |
| `analysis` | Engine exit 0, stdout `ok:true`, promised files exist. No-change, permutation, compatible weakening, stale freshness, and incomplete-but-honest page walks stay here. |
| `refused` | Valid product refusal on the catalogued stream (stdout for lock/schema/route, stderr for page-change). |
| `incomplete-delivery` | Transport looked successful but a promised output file is missing. |
| `transport-failure` | Crash, missing binary, or non-JSON. Not a domain verdict. |

Unlike hashes are not forced equal. Route permutation now has equal `digest.v2`. Schema `termsVersion` stays the I01 content hash of the brief.

## First offer

`lockfile-pin-delta` from independent M07 cases on this tree: 20/20 domain match, constant hasher cannot hide integrity, unsupported formats refuse.

## D01 bind

D01 default `createExecutor` / `runPaidOffer` now injects:

```js
export const runPaidOffer = createExecutor({
  getJob: createM01AwareGetJob(getJob),
  runEngine: runEngineForD01,
});
```

PR51 jobs still resolve through `getJob` and the useful-jobs archive CLI.
`runCatalogPaidOffer` is not the consumer path. `sold` stays false.

Optional: if `analysis.outcome === "refused"`, D01 returns the engine refuse code instead of `missing-output` when promised files were never written.
