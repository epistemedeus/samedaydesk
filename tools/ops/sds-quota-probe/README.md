# SameDayDesk ops quota probe (read-only)

Reads declared SameDayDesk caps from local source and evaluates offline
quota-window fixtures. This is an ops probe. It does not pay, checkout,
publish, call MCP `tools/call`, fetch, or attach neomorphic-io.

A declared cap is not remaining headroom. HTTP 429 is `rate_limited`, not
capacity. HTTP 402 is a payment challenge, not remaining quota. Remaining
values are never summed across windows or providers.

```
node tools/ops/sds-quota-probe/cli.mjs --cold
node tools/ops/sds-quota-probe/cli.mjs --suite
node tools/ops/sds-quota-probe/cli.mjs --seeded-failure consume-quota-tools-call
node tools/ops/sds-quota-probe/cli.mjs --seeded-failure http-429-as-headroom
node tools/ops/sds-quota-probe/cli.mjs --input tools/ops/sds-quota-probe/fixtures/valid/github-core-window.json
node --test tools/ops/sds-quota-probe/probe.test.mjs
```

`--cold` is the real-artifact path: it opens the pinned SDS source files and
checks each `sourcePattern`. It does not use the network.

`--pay`, `--checkout`, `--settle`, `--live`, and `--tools-call` are refused.
