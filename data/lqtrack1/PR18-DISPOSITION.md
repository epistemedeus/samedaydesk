# PR18 disposition (LQTRACK1)

Recommendation: **CLOSE**
[https://github.com/epistemedeus/samedaydesk/pull/18](https://github.com/epistemedeus/samedaydesk/pull/18)

Do not merge. Do not extend. The advertised alias root is 404 and the receipt
attribution store is not connected to runtime. Canonical `/mcp` and `/scan`
already exist, but they are not per-surface listing aliases and the existing
Stripe / pulse receipt paths have no registry `surface` field.

## Replay

```
node tools/lqtrack1/replay-pr18-disposition.mjs --live
```

Mode: `live` at 2026-09-03T10:50:21.433Z.

## HTTP

- `https://samedaydesk.com/listings` → **404** `text/html; charset=utf-8`
- `https://samedaydesk.com/listings/bazaar/mcp` → **404** `text/html; charset=utf-8`
- `https://samedaydesk.com/listings/mcp-registry/mcp` → **404** `text/html; charset=utf-8`
- `https://agents.samedaydesk.com/listings` → **404** `text/html; charset=utf-8`
- `https://samedaydesk.com/mcp` → **200** `text/plain; charset=utf-8`
- `https://samedaydesk.com/scan` → **200** `text/html; charset=utf-8`

## Why close

- Advertised /listings alias root is HTTP 404 on live apex and agents host.
- Advertised /listings/<surface>/<resource> paths are HTTP 404.
- No live response is the JSON listing catalog PR18 documents (`curl https://samedaydesk.com/listings`).
- Canonical /mcp and /scan already exist, but they are not per-surface aliases and cannot carry a registry surface without a new product path.
- PR18 receipt store is an in-process Map imported only by its test file; no MCP/scan/tools/checkout/fulfill route records surface.
- Existing Stripe email and pulse flush receipts have no registry surface field and cannot satisfy PR18 attribution without a new product surface.
- This branch (and default) do not mount /listings aliases.

## PR18 receipt wiring

- ref: `origin/gb07-per-surface-resource-aliases`
- in-process Map store: true
- mounted on `server/index.js`: true
- runtime imports of settlement-receipt: 0
- test-only imports: 5

## Existing receipt paths on default

- `server/lib/notify.js` (stripe-email): Resend order email (to, label, amount, orderId). No registry surface field. exists=true mentionsSurface=false
- `server/lib/fulfill.js` (stripe-fulfillment): Calls sendReceipt after Stripe checkout. Human commerce, not x402 listing attribution. exists=true mentionsSurface=false
- `supabase/migrations/0002_pulse_durable.sql` (pulse-flush): pulse_flush_receipts stores analytics flush hashes, not settlement surface. exists=true mentionsSurface=false
