# R2-EXCHANGE-03 — Revision-aware work agreement

Isolated experiment under `experiments/scale-r2-20260910/exchange/03`.

## Outcome

Bind a proposal (and later deliverable) to an **exact acceptance-brief revision**.

- Scope drift vs a newer brief is visible (`scope_changed` + structured diff)
- New terms are **not** silently accepted — `acceptRevision` requires `{ explicit: true }`
- Deliverables are checked against the **bound** revision

## Reuse

Builds on R2-EXCHANGE-01 (`buildAcceptanceBrief`, `runAcceptanceChecks`) and proposal shapes from 02.

## Fresh consumer

```sh
npm run test:r2-exchange-03
node experiments/scale-r2-20260910/exchange/03/src/cli.mjs demo
```

## Mutation boundary

Feature-branch source/tests only. Root owns merge, publication, and paid actions.
