# SDS route census (W7, read-only)

Local inventory of SameDayDesk HTTP routes. Walks `server/app.js` mounts,
`server/routes/*` methods, SPA history routes, well-known paths, and
unconfigured correspondence `GET /healthz`. Cross-checks Express 5 router
leaves from `createSdsApp()`.

Does not HTTP-probe, pay, publish, or load `neomorphic-io`. `--live`,
`--pay`, `--neo`, and `--publish` are refused.

A payment route cannot be labeled read-only. HTTP 402 is not settlement.

```
node tools/ops/sds-route-census-w7/cli.mjs
node tools/ops/sds-route-census-w7/cli.mjs --seeded-failure payment-as-readonly
node tools/ops/sds-route-census-w7/cli.mjs --expect-reject payment_as_readonly \
  tools/ops/sds-route-census-w7/fixtures/invalid/payment-as-readonly.json
node tools/ops/sds-route-census-w7/cli.mjs --suite
node --test tools/ops/sds-route-census-w7/test.mjs
```
