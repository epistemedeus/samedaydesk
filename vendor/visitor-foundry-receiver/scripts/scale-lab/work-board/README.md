# S02 Work / bounty board (2026-09-09)

Isolated Neomorphic experiment: agent-readable work board with brief,
deliverable contract, acceptance evidence, proposal, completion artifact, and
correction journey. Reuses correspondence event kinds. No custody or escrow.

## Paths

- Engine / CLI / fixtures / tests: this directory
- Human inspection page: `/lab/work-board/` (isolated; not added to global nav
  or labs index to avoid cross-lab conflicts)
- Existing handoff: `/correspondence/` and `contact@neomorphic.io`

## Funding honesty

| Class | Meaning |
| --- | --- |
| `demonstration` | Unfunded fictional fixtures, labelled in title/brief/label |
| `external` | Link-only pointer to a real public HTTPS resource |
| `sponsored` | Reserved vocabulary; still no escrow on this board |

## CLI

```sh
node scripts/scale-lab/work-board/src/cli.mjs list
node scripts/scale-lab/work-board/src/cli.mjs show job_demo_page_diff
node scripts/scale-lab/work-board/src/cli.mjs journey-demo
node scripts/scale-lab/work-board/src/cli.mjs adversarial
node scripts/scale-lab/work-board/src/cli.mjs export
node scripts/scale-lab/work-board/src/cli.mjs create
node scripts/scale-lab/work-board/src/cli.mjs create-update-observe
node scripts/scale-lab/work-board/src/cli.mjs observe
node scripts/scale-lab/work-board/src/cli.mjs service-journey --base-url http://127.0.0.1:PORT --admin-token "$CORRESPONDENCE_ADMIN_TOKEN"
```

## Tests

```sh
node --test scripts/scale-lab/work-board/tests/*.test.mjs
# Optional live HTTP/PG (disposable correspondence fixture):
npm run test:work-board-postgres
```

## First useful job

`job_demo_page_diff`: produce a bounded public-docs before/after note after a
labelled provider change. Low-effort customer experiment: one operator asks an
agent to complete that demonstration job, then hand a real page-diff need through
the existing correspondence desk without inventing network effects or payouts.
