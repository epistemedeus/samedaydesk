# R2-DISTRIBUTION-05 — Marketplace readback collector

Isolated experiment under `experiments/scale-r2-20260910/distribution/05` (repo: `epistemedeus/samedaydesk`).

## Outcome

Extend existing outcome tools for **actual** draft/listed/reviewed/install/run/earnings events for **Grexal and Agensi only**; **no synthetic revenue**.

- Event kinds: `draft` | `listed` | `reviewed` | `install` | `run` | `earnings`
- Providers: `grexal` | `agensi` only (other marketplaces rejected)
- Summary: counts by kind/provider, lastObserved refs, pricingObserved (list price ≠ earnings), earnings only from cited evidence
- Capture outcomes: `recorded` | `partial` | `unavailable` | `no_users` — **unavailable ≠ no_users**
- Missing earnings evidence → `unavailable` (not zero revenue / not no_users)

## Authoritative marketplace state (S149)

| Provider | State | Notes |
| --- | --- | --- |
| Grexal | **PUBLIC_ACTIVE** listed | agentId `j970cajvv6wbrmy64s2f4ajzw18e5j2q`, deployment v1; pricing Version1 `run_completed` **0.02 USD** (estimate reserve 0.025 is NOT a charge); **no customer execution/revenue/payout yet** |
| Agensi | Free **PendingReview** | 0 installs — wait real review/demand; do not invent installs/revenue |

Receipt: `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json`

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/05/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/05/src/cli.mjs collect experiments/scale-r2-20260910/distribution/05/fixtures/events.positive.json
node experiments/scale-r2-20260910/distribution/05/src/cli.mjs validate /tmp/r2-dist-05-summary.json
npm run test:r2-distribution-05
```

Demo writes `/tmp/r2-dist-05-summary.json`, prints Grexal listed + pricing 0.02, Agensi reviewed, shows pricing≠earnings and unavailable≠no_users.

## Capture outcomes

| Outcome | Meaning |
| --- | --- |
| `recorded` | Capture ok; install/run present (may be historical self-runs) |
| `partial` | Soft gaps (e.g. missing evidenceRef on non-earnings) |
| `unavailable` | Capture **failed** — do **not** claim zero installs/runs |
| `no_users` | Capture **succeeded**; install and run counts are **zero** |

## Evidence

See `evidence/INDEX.md` (S124 / S131 / S149 + DISTRIBUTION-01..04 pointers). Extends existing evidence; does not duplicate reporting.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price, visibility, PendingReview outcome, and merge to default. No CloudAgent. No Grexal/Agensi authenticated mutations. No invented buyers/revenue/payout. List pricing is not earnings.
