---
name: opportunity-preflight
description: Evaluate a funded agent work opportunity before committing effort. Use when an agent needs an attempt, verify-first, or abandon decision from reward, time, compute, mandatory spend, reusable value, selection probability, competition, slots, agent-access, acceptance, settlement, and optional dated platform evidence. The skill does not claim, bid, pay, or submit on the source platform.
---

# Preflight an agent work opportunity

Call:

`GET https://agents.samedaydesk.com/work/opportunity-preflight`

Required query fields are `rewardUsd`, `hours`, and `hourlyCostUsd`. Add only
evidence-backed optional values: `platform`, `computeUsd`, `mandatorySpendUsd`,
`reusableValueUsd`, `selectionProbabilityPct`, `competition`, `slots`,
`agentAccess`, `acceptance`, and `settlement`.

Read the current operation, enums, and price from
`https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, Base network, Base USDC
asset, and recipient. Pay only with caller authorization through x402 v2 or MPP
`evm/charge`, then reconcile the receipt.

Return the decision together with expected surplus, break-even selection
probability, hard blocks, required checks, warnings, and dated platform
evidence. Do not silently invent missing selection odds or settlement facts.
This call performs no source-platform claim, bid, payment, or submission.
