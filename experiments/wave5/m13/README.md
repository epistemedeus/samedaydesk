# W5-M13 machine-discovery consumer

Fresh consumer for SameDayDesk. It reads **existing** registries, selects the
current service by **stable identity**, then invokes the current PR52
`paid-useful-jobs` CLI. It does not vendor engines, rewrite the homepage, or
live-settle.

Proof: discover `vendor-budget-impact` by catalog `id`, confirm it is on the
wrapper `list`, then run it on caller files.

## Identities (not array index 0)

| Surface | Identity | Current pin at SDS `aeef964` |
| --- | --- | --- |
| MCP Registry | `io.github.epistemedeus/x402-data-gateway` + official `isLatest` | remote `https://agents.samedaydesk.com/mcp`, version `1.23.45` |
| Offline jobs | catalog `job.id` | six useful-jobs ids |
| Live paid HTTP | OpenAPI `operationId` | `extractUrl` `$0.005`, `auditSellerIntegrity` `$0.01` |
| MPP | service `id` `samedaydesk` | not listed among 142 services (index 0 is `apex-db`) |

Unfiltered MCP search first hit is historical Railway `1.0.0`. That is not
current. Presence listing `1.23.36` is not forced equal to registry-consumer
`1.23.45`. Live extract `$0.005` is not the fixture wrapper price `$0.02`.

## Copy-paste (offline, no spend)

From the repository root, Node >= 22:

```bash
node experiments/wave5/m13/bin/discover-invoke.mjs discover

node experiments/wave5/m13/bin/discover-invoke.mjs journey \
  --job-id vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --out-dir /tmp/w5-m13-vendor-budget
```

Usable outputs (when the wrapper analysis succeeds):

- `/tmp/w5-m13-vendor-budget/budget-impact.json`
- `/tmp/w5-m13-vendor-budget/budget-impact.md`

`sold` stays false. Live settlement is out of scope. SAMPLE/`--example` is
not a sale.

Exit `0` is analysis success, `2` is a structured refusal, `3` is transport
(CLI missing, non-JSON crash, spawn failure).

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m13/test/*.test.mjs
```

or `npm test` from this directory.

## Remaining bindings

- **W5-M12** has not published a capability/pricing document in this tree.
  Prices here are the current OpenAPI `x-payment-info` amounts and PR52
  fixture pins.
- **W5-D24** has not published a clean-environment package. Invoke uses the
  in-repo CLI.
- Discovered MCP/x402 routes are not called. Paid live invoke is a later
  owner step, not this kit.
