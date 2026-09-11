# Cross-runtime commission scaffold (W3-09 E03)

SameDayDesk **labelled runtime comparison** for the published PR51 listing-repair-packet engine. Fixture / non-settling. Node 22. No install.

It runs the same caller-supplied listing fixture on two labelled runtimes (`node22-local` vs `node22-container-fixture`), records exact commands and results, and sets `independent: true` only when captured environments differ by more than cwd.

This is not a live second-customer purchase. SAMPLE is never commissioned customer work. Live extract `$0.005` is unchanged. F08 wrappers, W2-06 `tools/cold-start-assessment/`, and Pilot F11 `tools/verify/cold-start/` are imported as contracts only and are not rewritten here.

## Literal user journey

From this directory:

```sh
cd tools/cross-runtime-commission
node bin/cross-runtime.mjs journey --fixture fixtures/ok.json
```

The JSON report lists both runtimes, the shared input digest, commands, engine results, `comparable`, and `independent`. A demo-labelled single-runtime run cannot claim `independent: true`.

## Tests

```sh
npm test
```

From the repository root: `npm run test:cross-runtime-commission`.

## Out of scope

No deployment, payment, secrets, live catalog change, homepage edit, or F08 wrapper rewrite.
