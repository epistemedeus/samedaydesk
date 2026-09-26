# R2-CAPABILITIES-04 — Cost-aware dry-run comparison

Isolated experiment under `experiments/scale-r2-20260910/capabilities/04` in
**`epistemedeus/pilot`**.

## Outcome

Compare **caller-supplied** current quotes against existing free alternatives.
Emits a factual dry-run comparison with `priceState` and free-alternative states.
**No paid calls.** Missing-price and external-cost states are explicit.

Cap04 is the **capability-side** dry-run comparison (quotes + free baselines for
a capability job). It is **not** a full procurement brief — see
`R2-CONSUMER-JOBS-07` for need-coverage procurement briefs.

## Constraints

- Dry-run only: compare supplied fixtures; **never** fetch live paid offers
- `dryRun: true`, `paidCalls: false` on every output
- No ranking scores, reputation, buy/sell/invest advice, revenue projections,
  escrow, or custody claims
- Synthetic / public fixtures only
- Feature-branch source/tests only — Root owns merge, publication, and paid actions

## Shared cost vocabulary (`reuseFrom: R2-CONSUMER-JOBS-07`)

Authoritative Cap04-aligned vocabulary was defined in Consumer07 and is copied
here with identical string values (`sharedWith` / `reuseFrom`):

| Concept | Values |
| --- | --- |
| `priceState` | `quoted` · `missing_price` · `external_cost` · `stale_or_untrusted_source` |
| `freeAlternativeState` | `equivalent` · `not_equivalent` · `unavailable` |
| `priceSource` | `caller.supplied.quote` · `fixture.demo.not-a-live-offer` · `observed.stale` · `samedaydesk.extract-batch.quote` |

Keep **`unavailable`** distinct from empty / no-users. Price-state priority
(from Consumer07 `derivePriceState`):
`missing_price` → `stale_or_untrusted_source` → `external_cost` → `quoted`.

## Preflight (reuse decision)

| Existing | Why not reused as this package |
| --- | --- |
| `experiments/revenue-swarm-0907/c9` `quote.mjs` | Derives unpaid x402 payment offers (`payTo` / `accepts`). Payment-offer oriented — **not** Cap04 quote-vs-free comparison |
| R2-CONSUMER-JOBS-07 procurement brief | Need-coverage brief for consumer procurement — **vocabulary reused**; Cap04 focuses on capability cost/dry-run comparison only |

## Schema

- Input: `pilot.r2.capabilities.cost_dry_run_input.v1`
- Output: `pilot.r2.capabilities.cost_dry_run_comparison.v1`
- Status: `ready` | `partial_input` | `rejected`

### Input shape

```json
{
  "taskId": "…",
  "capabilityId": "optional",
  "quotes": [
    {
      "id": "quote-a",
      "label": "…",
      "amountAtomic": "25000",
      "currency": "USDC",
      "priceSource": "caller.supplied.quote",
      "stale": false,
      "externalCosts": [],
      "unit": "batch"
    }
  ],
  "freeAlternatives": [
    {
      "id": "free-a",
      "label": "…",
      "state": "equivalent",
      "basis": "free_local_script_v1"
    }
  ]
}
```

## Fresh consumer

Requires Node ≥ 20. No `npm install` (pure Node ESM, zero dependencies).

```sh
cd experiments/scale-r2-20260910/capabilities/04
npm test
npm run demo
node src/cli.mjs compare fixtures/positive.json
node src/cli.mjs compare fixtures/partial-missing-price.json
node src/cli.mjs compare fixtures/external-cost.json
node src/cli.mjs compare fixtures/free-unavailable.json
node src/cli.mjs validate fixtures/positive.json
```

Or from repo root:

```sh
node --test experiments/scale-r2-20260910/capabilities/04/tests/*.test.mjs
node experiments/scale-r2-20260910/capabilities/04/src/cli.mjs demo
```

## Mutation boundary

Exact feature-branch source only. Do not merge/publish/pay from this package.
