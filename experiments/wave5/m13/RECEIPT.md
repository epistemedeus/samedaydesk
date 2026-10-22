# W5-M13 RECEIPT

**Date:** 11 September 2026
**Task:** W5-M13 SameDayDesk machine-discovery surface integration using existing registries
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-m13-samedaydesk-machine-discovery-surface-integration-using-existing-registries-a817`
**Starting ref:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)
**PR:** https://github.com/epistemedeus/samedaydesk/pull/102 (draft)
**Owned path:** `experiments/wave5/m13/`

## What

Thin consumer against current PR52 interfaces. Discovers MCP / useful-jobs /
OpenAPI / MPP / Bazaar from existing registry documents, selects by stable
identity, then invokes `server/paid-useful-jobs/bin/cli.mjs`. Does not copy
engines or presence kernels.

Proof command:

```bash
node experiments/wave5/m13/bin/discover-invoke.mjs journey \
  --job-id vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --out-dir /tmp/w5-m13-vendor-budget
```

Changed caller rows produce `status: actionable` with `fieldChanges=2`.
Identical before/after is `status: informational` with `fieldChanges=0`
(valid analysis, not transport failure). `sold` stays false.

## Tested versions

| Interface | Version tested |
| --- | --- |
| SDS kernel | `aeef964fa188443078958d9d6d393afae1d542ee` PR52 |
| MCP latest capture | `1.23.45` remote `https://agents.samedaydesk.com/mcp` `isLatest: true` |
| Presence MCP listing | `1.23.36` (not forced equal to 1.23.45) |
| Useful-jobs package | `1.0.0` archive sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| Wrapper CLI | `server/paid-useful-jobs/bin/cli.mjs` |
| Live extract | OpenAPI `extractUrl` amount `0.005` |
| Live seller-integrity-audit | OpenAPI `auditSellerIntegrity` amount `0.01` |
| Fixture wrapper pin | `0.02` (not equal to live amounts) |

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m13/test/*.test.mjs
```

**PASS** 21 pass / 0 fail / 0 skipped. No skipped gates.

Includes real CLI spawn of the PR52 wrapper, local HTTP discovery of registry
documents, shuffled-catalog identity, MCP naive-first-hit rejection, MPP
index-0 trap, missing-CLI transport vs structured refusal, and SAMPLE not a
sale.

## Remaining integration binding

- **W5-M12** capability/pricing document: absent in this tree. Prices consumed
  from OpenAPI `x-payment-info` and PR52 pins. Do not hash those documents
  together.
- **W5-D24** clean-environment package: absent. Invoke uses the in-repo CLI.
- Live MCP/x402 invoke: not executed (no spend). Discovered remote remains
  `https://agents.samedaydesk.com/mcp`.
- MPP `id=samedaydesk` is not in the current 142-service listing.

## pstack on this VM

Plugin cache `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`.
Parent model `cursor-grok-4.6-xhigh`. Skills used by reading installed files
(`tdd`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`,
`principle-boundary-discipline`). No extra Cloud agents. Slash text was not
the invocation path.

## Limits

No homepage or root manifest change. No production deploy. No new spend.
