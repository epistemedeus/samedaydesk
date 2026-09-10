# R2-DISTRIBUTION-08 — Distribution conversion diagnosis

Isolated experiment under `experiments/scale-r2-20260910/distribution/08` (repo: `epistemedeus/samedaydesk`).

## Outcome

**Join only source-compatible acquisition and useful-output evidence**, showing exactly where **causation or customer independence is unknown**.

- Inputs: `acquisitionEvidence[]` (DIST-04 linkPresented/linkActivated) + `usefulOutputEvidence[]` (DIST-05 draft/listed/run/install/earnings) + optional `compatibility`
- Join when `provider` / `sourceTag` / `jobRef` / `sharedEvidenceId` align; incompatible pairs → `unjoined[]` with reason
- Per joined pair: `causationKnown` (default false), `customerIndependenceKnown` (default false), `unknowns[]`
- Never claim conversion/revenue from list price or clicks
- Capture outcomes: `available` | `partial` | `unavailable` | `no_users` — **unavailable ≠ no_users**

## Authoritative marketplace state (S149)

| Provider | State | Notes |
| --- | --- | --- |
| Grexal | **PUBLIC_ACTIVE** listed | agentId `j970cajvv6wbrmy64s2f4ajzw18e5j2q`, deployment v1; pricing Version1 `run_completed` **0.02 USD** (estimate reserve 0.025 is NOT a charge); **no customer execution/revenue/payout yet** |
| Agensi | Free **PendingReview** | 0 installs — wait real review/demand; do not invent installs/revenue |

Receipt: `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json`

DEMO joins synthetic DIST-04/05-shaped fixtures citing S149 without claiming conversion or customer revenue.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/08/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/08/src/cli.mjs diagnose experiments/scale-r2-20260910/distribution/08/fixtures/bundle.positive.json
node experiments/scale-r2-20260910/distribution/08/src/cli.mjs validate /tmp/r2-dist-08-diagnosis.json
npm run test:r2-distribution-08
```

Demo writes `/tmp/r2-dist-08-diagnosis.json`, prints compatible joins with `causationKnown=false` / `unknowns[]`, shows incompatible → unjoined, and unavailable ≠ no_users.

## Status codes

| Outcome | Meaning |
| --- | --- |
| `available` | Capture ok; source-compatible joins diagnosed (or evidence present with zero compatible pairs) |
| `partial` | Missing `acquisitionEvidence` / `usefulOutputEvidence` arrays |
| `unavailable` | Acquisition or useful-output capture **failed** — do **not** claim zero users |
| `no_users` | Capture **succeeded**; zero activations **or** zero actionable useful outputs (install/run/observed-earnings) |

## Evidence

See `evidence/INDEX.md` (S149 + DISTRIBUTION-03..07 + S124/S131 pointers). Extends existing evidence; does not invent buyers/clicks-as-intent/revenue.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price, visibility, PendingReview outcome, and merge to default. No CloudAgent. No Grexal/Agensi authenticated mutations. No invented buyers/revenue/payout. Completes DISTRIBUTION-01..08 set.
