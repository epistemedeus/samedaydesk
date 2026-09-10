# R2-DISTRIBUTION-02 — Agensi Free skill Root handoff staging

Isolated experiment under `experiments/scale-r2-20260910/distribution/02` (repo: `epistemedeus/samedaydesk`).

## Outcome

Stage existing **S131** Agensi offline skill entry for Root:

- Free skill draft readiness (`offline-package-provenance`)
- Exact DEMO pointer
- **PendingReview** handoff — Root owns next provider-review event
- **Do not** Bot-login or re-submit

## Status codes

| Code | Meaning |
| --- | --- |
| `pending_review_handoff` | Inputs complete; PendingReview owned by Root |
| `ready_for_root` | Ready without PendingReview flag |
| `blocked_missing_input` | Required evidence missing |
| `unavailable` | Provider/capture unavailable (no user count) |
| `no_users` | Capture succeeded; zero users/installs/runs |

`unavailable` and `no_users` never collapse.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/02/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/02/src/cli.mjs stage experiments/scale-r2-20260910/distribution/02/fixtures/inventory.positive.json
node experiments/scale-r2-20260910/distribution/02/src/cli.mjs validate /tmp/r2-dist-02-packet.json
npm run test:r2-distribution-02
```

## Mutation boundary

Feature-branch source/tests only. No Agensi login, no review re-submit, no paid listing, no merge to default, no CloudAgent.
