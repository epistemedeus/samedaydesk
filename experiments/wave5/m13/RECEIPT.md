# W5-M13 RECEIPT

**Date:** 11 September 2026
**Task:** W5-M13 SameDayDesk machine-discovery surface integration using existing registries
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-m13-samedaydesk-machine-discovery-surface-integration-using-existing-registries-a817`
**Starting ref:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)
**Owned path:** `experiments/wave5/m13/`

## What

Thin consumer against current PR52 interfaces. Discovers MCP / useful-jobs /
OpenAPI / MPP / Bazaar from existing registry documents, selects by stable
identity, then invokes `server/paid-useful-jobs/bin/cli.mjs`. Does not copy
engines or presence kernels.

## Tested versions

| Interface | Version tested |
| --- | --- |
| SDS kernel | `aeef964fa188443078958d9d6d393afae1d542ee` PR52 |
| MCP latest capture | `1.23.45` remote `https://agents.samedaydesk.com/mcp` `isLatest: true` |
| Presence MCP listing | `1.23.36` (not forced equal to 1.23.45) |
| Useful-jobs package | `1.0.0` archive sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| Wrapper CLI | `server/paid-useful-jobs/bin/cli.mjs` |

## Remaining integration binding

- M12 capability/pricing document: absent; consume OpenAPI + PR52 pins.
- D24 clean-env package: absent; invoke is in-repo CLI.
- Live MCP/x402 invoke: not executed (no spend).

## Tests

Pending first execution on this revision.
