# Grexal price-estimate worksheet (offline)

Primary formula from [Payments](https://docs.grexal.ai/docs/payments) (captured 2026-09-10):

```
platform_fee  = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)
your_earnings = buyer_charge − platform_fee
```

This file is a **local estimate**. It is **not** a `grexal.json` field. Live `npx grexal agent price add` / `price estimate` require login and a first `push` — **not run from this worker**.

## This agent has no LLM cost

The packager only runs `git diff` (or accepts a supplied unified diff) and writes an acceptance report. `paidModelCalls = 0`. Do **not** copy the docs $0.18 worked example (that one assumed ~$0.04 Claude tokens).

Backsolve with zero upstream cost:

```
buyer_charge = target_net / 0.80
```

| Target net | Upstream LLM | Raw charge | Suggested list |
| ---------- | ------------ | ---------- | -------------- |
| $0.08      | $0.00        | $0.10      | `run_completed 0.10` |
| $0.10      | $0.00        | $0.125     | round to $0.13 if Root wants a dime net |

Suggested (not applied) line item after a future Root push:

```
npx grexal agent price add run_completed 0.10
```

Do not run that here.

## Docs worked table (recomputed)

| Buyer pays | 20%    | Floor | 30% cap | Fee charged | Seller keeps | Effective % | Binding      |
| ---------- | ------ | ----- | ------- | ----------- | ------------ | ----------- | ------------ |
| $5.00      | $1.00  | $0.02 | $1.50   | $1.00       | $4.00        | 20%         | nominal-20%  |
| $1.00      | $0.20  | $0.02 | $0.30   | $0.20       | $0.80        | 20%         | nominal-20%  |
| $0.20      | $0.04  | $0.02 | $0.06   | $0.04       | $0.16        | 20%         | nominal-20%  |
| $0.10      | $0.02  | $0.02 | $0.03   | $0.02       | $0.08        | 20%         | nominal-20%  |
| $0.08      | $0.016 | $0.02 | $0.024  | $0.02       | $0.06        | 25%         | floor $0.02  |
| $0.05      | $0.01  | $0.02 | $0.015  | $0.015      | $0.035       | 30%         | cap 30%      |
| $0.02      | $0.004 | $0.02 | $0.006  | $0.006      | $0.014       | 30%         | cap 30%      |
| $0.18      | $0.036 | $0.02 | $0.054  | $0.036      | $0.144       | 20%         | nominal-20%  |

`$0.08` is **not** a docs table row; it is the derived floor band (`~$0.0667 ≤ charge < $0.10`) from G1. `$0.18` is the docs backsolve for a *different* agent that calls Claude.

## Covered vs not

Covered by the 20% fee: sandbox compute, `push`/`publish`/`deploy`, storage, listing.

Not covered: third-party LLM/API spend. This scaffold does not incur that.

No earnings on self-runs, failed runs, never-started cancels, or refunds.

## Recompute

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs --table
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.10
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.18
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.05
```
