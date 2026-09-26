# R2-EXCHANGE-02 — Bid-to-requirement comparison

Isolated experiment under `experiments/scale-r2-20260910/exchange/02`.

## Outcome

Compare multiple supplied proposals against an R2-EXCHANGE-01 acceptance brief:

- Terms + claimed requirements + optional artifact evidence
- Statuses: `meets` | `partial` | `missing_evidence` | `conflicts` | `malformed`
- **No** reputation, stars, winner, or invented ranking (`ranking: null`, input order only)
- Subjective brief criteria cannot be cleared by a proposal claim

## Reuse

Imports `buildAcceptanceBrief` / `runAcceptanceChecks` from `../01`. Fixtures reuse `../../01/fixtures/requirements.positive.json` and the positive artifact shape.

## Fresh consumer

```sh
npm run test:r2-exchange-02
node experiments/scale-r2-20260910/exchange/02/src/cli.mjs demo
```

## Mutation boundary

Feature-branch source/tests only. Root owns merge, publication, and paid actions.
