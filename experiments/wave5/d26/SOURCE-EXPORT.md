# Exact source export — W5-D26

Replay pins, not a production-capacity claim.

| Item | Value |
| --- | --- |
| Merchant | `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f` |
| Version | 1.23.47 |
| Route | `POST /lockfile-pin-delta` |
| Price | 5000 atomic USDC ($0.005), x402-only |
| Facilitator in source | default `xpay` → `https://facilitator.xpay.sh` (not production) |
| Facilitator in production | `cdp` (Root Railway allowlist, 2026-09-12 ~02:00 UTC). Also `EXTRACT_BATCH_ENABLED=1`, `LOCKFILE_PIN_DELTA_ENABLED=1`. No other values exposed. No mutation. |
| Unread | CDP balance, remaining free-tier quota, Railway plan |
| Hosting | Railway, per-second CPU/RAM (official pricing 2026-09-12) |
| CDP official schedule | verify free; first 1000 onchain txs/month free, then $0.001. Free tier is not unit cost. |
| H04 corpus | `epistemedeus/samedaydesk@7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc` |
| Pair digests | `fixtures/corpus/h04-lockfile-pairs.json` |
| Measurement | spawn `server.js` + fake facilitator on 127.0.0.1; `/proc` CPU+RSS; no public load. Local mean wall is not production latency. |

Machine-readable export: `node bin/price-floor.mjs source-export`. Rebind an already-captured profile without remounting: `node bin/price-floor.mjs rebind-measured`.
