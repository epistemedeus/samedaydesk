# R2-CAPABILITIES-05 — Failure fallback plan

Isolated experiment under `experiments/scale-r2-20260910/capabilities/05` in
**`epistemedeus/pilot`**.

## Outcome

Generate a **bounded provider-neutral fallback plan** from an actual failed
capability outcome record (synthetic fixtures). Steps stay provider-neutral
(retry same contract, reduce scope, use free baseline if already compared,
human review, stop). **No paid calls. No live retries. Dry-run plan only.**

If `mutationState` is `ambiguous`, the plan **preserves that ambiguity** —
never claims `rolled_back: true` or that side effects are clean.

## Constraints

- Input: failed capability outcome (`capabilityId`, `attemptId`, `failureClass`,
  `observedState`, `mutationState`, optional `errorCode` / `notes` /
  `freeAlternativeState`)
- Output status: `ready` | `partial_input` | `rejected` with `missingInputs[]`
- Never invent missing facts or a new provider brand as the fix
- Optional Cap04 free-baseline step only when input already includes
  `freeAlternativeState` (do not invent one)
- Feature-branch source/tests only — Root owns merge, publication, and paid actions
- Forbidden fields (same spirit as Cap01 / Cap04 / Consumer07): buyerCount,
  revenue, rankingScore, reputation, escrow, custody, claimAuthority,
  investAdvice, plus provider-switch invention fields

## Preflight (reuse decision)

| Existing | Why not reused as this package |
| --- | --- |
| commons n45 | Task-memory / correspondence replay kit — not a generator of provider-neutral plans from failed capability outcomes |
| revenue-swarm-0907 c4 memory-transport | In-memory correspondence transport for work-request exchange QA — not Cap05 fallback planning |

## Schema

- Input: `pilot.r2.capabilities.failure_outcome.v1`
- Output: `pilot.r2.capabilities.failure_fallback_plan.v1`
- Status: `ready` | `partial_input` | `rejected`

### Enums

| Name | Values |
| --- | --- |
| `FAILURE_CLASS` | `timeout` · `validation` · `auth` · `dependency_unavailable` · `partial_delivery` · `unknown` |
| `MUTATION_STATE` | `none` · `known` · `ambiguous` |
| `PLAN_STEP_KIND` | `retry_bounded` · `reduce_scope` · `use_free_baseline` · `human_review` · `stop` |

## Fresh consumer

Requires Node >= 20. No npm install (pure Node ESM, zero dependencies).

```sh
cd experiments/scale-r2-20260910/capabilities/05
npm test
npm run demo
node src/cli.mjs plan fixtures/positive-known-mutation.json
node src/cli.mjs plan fixtures/ambiguous-mutation.json
node src/cli.mjs plan fixtures/partial-missing-fields.json
node src/cli.mjs plan fixtures/free-baseline-hint.json
```

## Ambiguous mutation invariant

When `mutationState === "ambiguous"`, output includes `mutationPreservation`:

- `preserveAmbiguity: true`
- `rolled_back: false` (never true)
- `sideEffectsClean: false`

