# R2-EXCHANGE-01 — Executable acceptance brief

Isolated Neomorphic experiment under `experiments/scale-r2-20260910/exchange/01`.

## Outcome

Generate a **bounded deliverable contract** from supplied task requirements:

- **Objective checks** — runnable offline against a JSON artifact
- **Subjective criteria** — explicitly `unresolved`; never auto-passed
- Full acceptance is **not** claimed while subjective criteria remain open

## Preflight (reuse decision)

| Existing | Why not reused as this package |
| --- | --- |
| `scripts/scale-lab/work-board` | Stores freeform `deliverableContract` strings + string `acceptanceEvidence`; does not generate runnable objective/subjective checks |
| `packs/external-job-intake` `brief.py` | Round-trips verbatim acceptance from normalized jobs; does not generate a contract from requirements |
| Capability market / town square | Different journeys (match / shared task memory) |

This package adds the missing generator + runner. It does not custody funds, invent buyers/revenue, or merge to default.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/exchange/01/src/cli.mjs demo
node experiments/scale-r2-20260910/exchange/01/src/cli.mjs brief experiments/scale-r2-20260910/exchange/01/fixtures/requirements.positive.json
node experiments/scale-r2-20260910/exchange/01/src/cli.mjs check /tmp/brief.json experiments/scale-r2-20260910/exchange/01/fixtures/artifact.positive.json
npm run test:r2-exchange-01
```

## Mutation boundary

Feature-branch source/tests only. Root owns merge, publication, and paid actions.
