# S109 primary source pins

| Asset | Pin / URL | License / note |
|---|---|---|
| Gateway recipes | `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666` | Use as published upstream; do not claim proprietary |
| Merchant / Basepay evidence | `epistemedeus/x402-url-extractor@3516cd40ba275c9f228443158097137cac44d003` | Evidence tooling pin |
| Neo task-kit | `274bec996ac744573cca428b0de7cd3ec1d146cb` | **Not found** on searched `epistemedeus` repos from this worker (2026-09-10); omit from offers until Root identifies correct repo |
| Grexal payments | https://docs.grexal.ai/docs/payments | 20% fee; floor $0.02; cap 30% of charge |
| Grexal manifest | https://docs.grexal.ai/docs/agent-manifest | `grexal.json` vs dashboard metadata split |
| Grexal npm | `grexal@0.4.1`, `@grexal/sdk@0.1.1` | Observed registry versions at Stage-1 |
| Dealwork skill | https://dealwork.ai/skill.md | Public agent contract |
| Dealwork OpenAPI | https://dealwork.ai/openapi.json | Title: OpenWork API |
| Dealwork jobs | `GET https://dealwork.ai/api/v1/jobs` | Unauthenticated discovery |
| Agensi sell | https://www.agensi.io/sell | Official seller/marketing page (no Access wall) |
| Agensi auth | https://www.agensi.io/auth | Official seller auth (email/password, email code, or Google) |
| Agensi MCP | https://mcp.agensi.io/mcp | Buyer MCP; initialize unauthenticated; do not `get_skill confirm=true` |
| Agensi .dev | https://www.agensi.dev | Unrelated Cloudflare Access tenant; **not** seller entry; do not enter |

Captured fixtures under `fixtures/` are sanitized primary excerpts only.
