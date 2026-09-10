# R2-DISTRIBUTION-01 — Grexal Root publish-readiness staging

Isolated experiment under `experiments/scale-r2-20260910/distribution/01` (repo: `epistemedeus/samedaydesk`).

## Outcome

Stage the **existing** Grexal S124 draft for Root:

- Inventory validation (paths, pins, draft status, receipt refs)
- **Root action packet** with recommended intentional small flat price (`run_completed` **$0.10** / **100000 micros**), public-discovery checklist, no-charge owner readback
- Machine-readable statuses that keep **`unavailable` ≠ `no_users`**
- Recommendations only — **never** executes Grexal login / price / publish / visibility

## Status codes

| Code | Meaning |
| --- | --- |
| `ready_for_root` | Inputs complete; recommendations staged |
| `blocked_missing_input` | Required inventory fields missing or price worksheet mismatch |
| `unavailable` | Provider/capture **unavailable** (no user count claimed) |
| `no_users` | Capture **succeeded**; users/installs/runs are **zero** |

`audienceCapture.status` uses the same `unavailable` / `no_users` / `captured` labels so they never collapse.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/01/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/01/src/cli.mjs stage experiments/scale-r2-20260910/distribution/01/fixtures/inventory.positive.json
node experiments/scale-r2-20260910/distribution/01/src/cli.mjs stage experiments/scale-r2-20260910/distribution/01/fixtures/inventory.live-pointers.DEMO.json
node experiments/scale-r2-20260910/distribution/01/src/cli.mjs validate /tmp/r2-dist-01-packet.json
npm run test:r2-distribution-01
```

## Evidence

See `evidence/S124-INDEX.md` (absolute receipt pointers). Fixtures use `agentId_REDACTED` — never copy live IDs from `IDS.md` into redistributable files.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price set, visibility, and merge to default. No CloudAgent. No grexal authenticated mutations from this kit.
