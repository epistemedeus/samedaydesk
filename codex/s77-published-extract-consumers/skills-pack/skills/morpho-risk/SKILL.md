---
name: morpho-risk
description: Inspect Morpho on Base with deterministic, read-only evidence. Use for borrower position and stress analysis, unsigned protection planning, market underwriting, or historical PreLiquidation replay. Never treat the output as transaction authorization, a forward profit forecast, or a substitute for fresh direct-chain verification before financial action.
---

# Inspect Morpho risk evidence

Choose one live route:

- `/defi/morpho-position?address=&shocks=` for LTV, health, liquidation
  headroom, and price-shock scenarios.
- `/defi/morpho-protection?address=&targetHealthFactor=&protectAgainstShockPct=&executionBufferBps=`
  for exact repair amounts and unsigned templates.
- `/defi/morpho-market-underwrite?marketId=` for parameter integrity,
  liquidity, utilization, concentration, health bands, bad debt, history, and
  PreLiquidation supply.
- `/defi/morpho-preliquidation-replay?transactionHash=` for block-time event,
  oracle, gross incentive, and gas reconstruction.

Use the canonical base `https://agents.samedaydesk.com`. Read the selected
operation and current price from `/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, Base network, Base USDC
asset, and recipient. Pay only with caller authorization through x402 v2 or MPP
`evm/charge`. Reconcile the protocol receipt before using the response.

Preserve source timestamps, verification flags, decision checks, and boundary
fields. Re-read current direct RPC state and simulate separately before any
signature or capital action. Protection templates are unsigned and must remain
unsigned unless a separate caller policy authorizes execution.
