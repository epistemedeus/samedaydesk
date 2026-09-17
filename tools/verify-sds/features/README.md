# SDS feature map (useful-jobs / packs / MCP)

Maintained map of SameDayDesk surfaces that a cold clone must be able to name
before driving them. Scope is **useful-jobs**, **offline packs**, and **apex MCP**.
It is not a full product map: x402 unpaid pages, offer-routing, result-reuse,
and recurring-recipes stay out of this directory.

Write boundary: `tools/verify-sds/features/**`. This map does not mutate
publish, registry, payment, or checkout.

## Baseline preconditions

- Node 22.x (`node --version`, root `engines.node`).
- Repo root is the working directory.
- Never pay Stripe, x402, or the $39 Fix Pack. Never POST `tools/call` with a
  `cs_` license. Never treat a CDN 403 as product 200.

## Families

| id | document | shipped proof |
| --- | --- | --- |
| `useful-jobs` | [useful-jobs.md](./useful-jobs.md) | public 1.4.7 archive, ten jobs, `/for-agents/useful-jobs` |
| `packs` | [packs.md](./packs.md) | s176 record-repeat, s185 distribution-repair, s178 consumer-repeat; Fix Pack listed only |
| `mcp` | [mcp.md](./mcp.md) | Express `/mcp` five tools, protocol `2024-11-05` |

## Surfaces

The machine catalog is [catalog.json](./catalog.json). Every `id` there must
appear in the matching document **Surfaces** table. `check-map.mjs` joins the
catalog, the markdown tables, and on-disk `repoPaths`.

## Driving the map

```
node tools/verify-sds/features/check-map.mjs --json
node tools/verify-sds/features/check-map.mjs --seed missing-surface --json
node --test tools/verify-sds/features/check-map.test.mjs
```

Live map must exit 0 with `ok: true` and all three families present. The seeded
fixture omits MCP on purpose; the checker must exit 1 with
`error.code` `SEED_REJECT` and `error.productCode` `missing_surface`.

## Proof and skip reporting

- Quote the command, exit code, and envelope `ok` / `error.code`.
- A green `npm run test:useful-jobs-public` or `npm run test:mcp` is not
  substitute for documenting the shipped entrypoints in this map.
- Do not report a skipped family as verified through a different path.

## Feature entry contract

Each family file: H1, one paragraph, a compact field table (`goal`,
`entrypoint`, `command`, `state`, `tests`, `prerequisite`), a **Surfaces**
table of catalog ids, then four H2s: **Sub-features**, **How to get to it
(user POV)**, **Driving it from this map**, **Gotchas**.
