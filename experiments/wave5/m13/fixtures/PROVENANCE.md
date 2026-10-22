Existing registry documents are read from the SameDayDesk checkout at
`aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52). This kit does not copy
those bodies.

| Document | Path |
| --- | --- |
| MCP `/versions/latest` capture | `tools/presence/fixtures/mcp-registry-consumer/versions-latest.json` |
| MCP search `version=latest` | `tools/presence/fixtures/mcp-registry-consumer/search-version-latest.json` |
| MCP unfiltered search | `tools/presence/fixtures/mcp-registry-consumer/search-unfiltered.json` |
| Older presence MCP listing | `fixtures/presence/listings/mcp-registry.json` |
| Useful-jobs discovery | `client/public/discovery/useful-jobs.json` |
| Useful-jobs catalog | `client/public/for-agents/useful-jobs/catalog.json` |
| OpenAPI + x402 | `fixtures/presence/catalog/` |
| MPP listing | `fixtures/presence/listings/mpp-services.json` |
| Bazaar merchant listing | `fixtures/presence/listings/bazaar-merchant.json` |
| Caller inputs for invoke | `server/paid-useful-jobs/fixtures/caller/` |

Kernels reused read-only: `tools/presence/registry-consumer.mjs`,
`tools/presence/catalog.mjs`, `server/paid-useful-jobs` CLI.
