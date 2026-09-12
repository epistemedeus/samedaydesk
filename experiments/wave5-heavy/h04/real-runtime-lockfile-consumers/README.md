# Real-runtime lockfile consumers

Prove maintained ordinary clients can consume live
`POST /lockfile-pin-delta` (merchant **1.23.48**, pin
`7aaf00410900dc41fb523d1b7b4469b40ded7981`, **0.005 USDC** / 5000 atomic).

This is not generic buyer research. The new POST exists, body is bound, and
three current clients were installed and run.

## Pins

| Client | Pin | Role |
| --- | --- | --- |
| `examples/customer-x402` | merchant `7aaf004` (`@x402/fetch` 2.16.0) | control: inspect / `--approve` / receipt / reconcile |
| `@x402/fetch` + `@x402/evm` | **2.25.0** | official Coinbase/x402-foundation payer |
| `@agentcash/discovery` | **1.7.5** (npm latest 1.8.0 at probe) | fundless inspect |

Merchant HTTP for paid proofs: local `server.js` + fake facilitator + throwaway
viem signer. Live origin: **unpaid/read-only only**.

## How to run

```bash
export MERCHANT_ROOT=/tmp/w5-h04/merchant-7aaf004
export X402_FETCH_INSTALL=/tmp/w5-h04/rr-x402fetch-hfAe
cd experiments/wave5-heavy/h04/real-runtime-lockfile-consumers
npm test
```

`SKIP_LIVE=1` skips production unpaid probes.

## Limits

- No live payment. No real wallet keys.
- H01 owns merchant discovery copy (`mcp-tool-metadata.mjs`, `lockfile-pin-delta-config.mjs`).
- D01 owns SDS kit / M06–09 engines.
- Official `wrapFetchWithPayment` auto-pays on 402 and may mint a second payload on `recovered`.
- AgentCash cannot sign. Empty `{}` is 400 before 402.
- Agent402 is classified unsupported as a payer here (settlement floor; not exercised as a fourth stack).
