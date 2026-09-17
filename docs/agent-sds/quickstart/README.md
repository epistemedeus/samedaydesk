# SDS agent quickstart (Diátaxis tutorial)

This directory is the **tutorial** quadrant for SameDayDesk agents. It teaches
one unpaid first success from a clean checkout. It is not a how-to catalog,
not a flag reference, and not an explanation of merchant strategy.

| Quadrant | This folder |
| --- | --- |
| Tutorial (quickstart) | this page and [tutorial.md](tutorial.md) |
| How-to | not in this write boundary |
| Reference | not in this write boundary |
| Explanation | not in this write boundary |

Surface: in-repo free discovery, unpaid job routing, and result-reuse
**preview**. Node 22. No `npm install`. No payment, checkout, registry
publish, or live `/extract/batch`.

Fixture pins (must match `tools/presence/fixtures/for-agents-cold-read/`):

| Source | SHA-256 |
| --- | --- |
| `agents-llms.txt` | `95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d` |
| `skills-index.json` | `a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564` |

## Cold follow-the-doc run

From the repository root:

```bash
node docs/agent-sds/quickstart/follow-the-doc.mjs
```

A passing run prints JSON with `"ok": true` and exits 0. It executes the
tagged fences in [tutorial.md](tutorial.md), then replays the seeded
failures that page says must be refused.

Quote one refusal without the happy path:

```bash
node docs/agent-sds/quickstart/follow-the-doc.mjs --seeded-failure complete-issue-discussion
```

```bash
node --test docs/agent-sds/quickstart/follow-the-doc.test.mjs
```

## Out of scope

- Paid machine gateway (`POST /extract/batch`, `GET /extract`)
- Stripe or x402 checkout
- MCP Registry publish or `version=latest` selection
- Treating `ok: true` on a preview as a public-safe certificate
- Sibling product sites or their registries
