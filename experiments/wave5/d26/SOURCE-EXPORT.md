# Exact source export — W5-D26

Replay pins, not a production-capacity claim.

| Item | Value |
| --- | --- |
| Merchant | `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f` |
| Version | 1.23.47 |
| Route | `POST /lockfile-pin-delta` |
| Price | 5000 atomic USDC ($0.005), x402-only |
| Facilitator in source | default `xpay` → `https://facilitator.xpay.sh`; `cdp` → CDP v2 x402 (keys required, not used here) |
| Hosting | Railway, per-second CPU/RAM (official pricing 2026-09-12) |
| H04 corpus | `epistemedeus/samedaydesk@7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc` |
| Pair digests | `fixtures/corpus/h04-lockfile-pairs.json` |
| Measurement | spawn `server.js` + fake facilitator on 127.0.0.1; `/proc` CPU+RSS; no public load |

Machine-readable export: `node bin/price-floor.mjs source-export` and `measured/source-export.json` after `profile`.
