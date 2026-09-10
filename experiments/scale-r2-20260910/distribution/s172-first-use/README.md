# S172 — No-key first-use response adapter

Machine-readable first-use outcomes for SameDayDesk Distribution Grexal listing discovery.

```sh
npm run test:r2-distribution-s172
node experiments/scale-r2-20260910/distribution/s172-first-use/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/s172-first-use/src/cli.mjs adapt experiments/scale-r2-20260910/distribution/s172-first-use/fixtures/attempt.success-discovery.json
```

Success returns `artifact` + `nextAction` (e.g. `confirm_budget_before_paid_invoke`). Never invents traffic or executes paid invoke. Base: NL-03 tip `ff762b0d`.
