# F18-health — agents `GET /health` unsupported; `/healthz` is live

Pack diagnostic only. Disposition: **reproduced**. Authorized: false. Provenance: fixture. Sale state: not_a_sale.

Do **not** change production routes. Do **not** rewrite SDS Express `GET /api/health`.

## Source facts

### Agents gateway live inventory (`client/src/data/machineEntry.mjs`)

Gateway origin:

```js
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
```

LIVE_INVENTORY health href is `/healthz`, not `/health`:

```js
  Object.freeze({
    label: "Health, prices, and protocol route counts",
    href: `${GATEWAY_ORIGIN}/healthz`,
  }),
```

Recipe C31 uses a different health path (not the gateway live probe):

```js
    health: `${GATEWAY_ORIGIN}/recipes/page-change/health`,
```

### SDS Express app health (`server/routes/health.js`)

SDS still has `router.get("/health"`:

```js
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "samedaydesk",
    time: new Date().toISOString(),
    configured: {
      supabase: isSupabaseConfigured(),
      stripe: isStripeConfigured(),
      email: isEmailConfigured(),
    },
  });
});
```

Mounted at `/api` in `server/app.js`:

```js
app.use("/api", healthRouter);
```

That yields `GET /api/health` on the SDS Express process. It is **app** health, not the agents live probe, and it is **not** the F18 defect.

## Reproduction (pack-local recorded probes)

| Origin | Path | Surface | supported | liveProbe | F18 defect |
| --- | --- | --- | --- | --- | --- |
| `https://agents.samedaydesk.com` | `/health` | agents-gateway | false | false | yes |
| `https://agents.samedaydesk.com` | `/healthz` | agents-gateway | true | true | no |
| `https://samedaydesk.com` | `/api/health` | sds-express | true | false | no |

Evaluator: `src/f18-health.ts` (`diagnoseHealthSurface`, `reproduceF18Health`). Tests: `tests/f18-health.test.ts`. Fixture: `fixtures/corpus/F18-health.json`.

Live network is optional (2s fetch) and not required. Recorded fixture rows are the reproduction.
