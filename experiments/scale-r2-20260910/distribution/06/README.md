# R2-DISTRIBUTION-06 — After-delivery continuation recipe

Isolated experiment under `experiments/scale-r2-20260910/distribution/06` (repo: `epistemedeus/samedaydesk`).

## Outcome

Create a **bounded after-delivery continuation recipe** tied to an **actual useful job**, with **opt-in reuse** and **no unsolicited broadcast**.

- Recipe shape: `{ jobRef, afterDeliveryStep, reusePolicy: { optInRequired: true, broadcast: false }, commands[], marketplaceHints? }`
- Useful job kinds: `source_change_evidence_pack` | `agensi_provenance_compare` (generic `version_alert` rejected)
- `reusePolicy.optInRequired` must be `true`; `broadcast` must be `false`
- Capture outcomes: `available` | `blocked_missing_input` | `unavailable` | `no_users` — **unavailable ≠ no_users**
- Partial (missing opt-in / jobRef) → `blocked_missing_input`

## Authoritative marketplace state (S149)

| Provider | State | Notes |
| --- | --- | --- |
| Grexal | **PUBLIC_ACTIVE** listed | agentId `j970cajvv6wbrmy64s2f4ajzw18e5j2q`, deployment v1; pricing Version1 `run_completed` **0.02 USD** (estimate reserve 0.025 is NOT a charge); **no customer execution/revenue/payout yet** |
| Agensi | Free **PendingReview** | 0 installs — wait real review/demand; do not invent installs/revenue |

Receipt: `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json`

DEMO cites Grexal S149 as the marketplace surface for the useful job `source_change_evidence_pack` (S124 `samedaydesk-source-change-evidence`) without claiming customer revenue.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/06/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/06/src/cli.mjs build experiments/scale-r2-20260910/distribution/06/fixtures/job.positive.json
node experiments/scale-r2-20260910/distribution/06/src/cli.mjs validate /tmp/r2-dist-06-recipe.json
npm run test:r2-distribution-06
```

Demo writes `/tmp/r2-dist-06-recipe.json`, prints available recipe for `source_change_evidence_pack` with opt-in / no-broadcast, Grexal S149 hints (0.02 list price ≠ revenue), and shows unavailable ≠ no_users.

## Capture outcomes

| Outcome | Meaning |
| --- | --- |
| `available` | Prior delivery context captured; recipe ready for **opt-in** reuse |
| `blocked_missing_input` | Missing jobRef and/or opt-in reusePolicy fields |
| `unavailable` | Prior delivery capture **failed** — do **not** claim zero deliveries |
| `no_users` | Capture **succeeded**; prior delivery count is **zero** |

## Evidence

See `evidence/INDEX.md` (S149 + DISTRIBUTION-01..05 + S124 package pointers). Extends existing evidence; does not duplicate reporting.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price, visibility, PendingReview outcome, and merge to default. No CloudAgent. No Grexal/Agensi authenticated mutations. No unsolicited broadcast. No invented buyers/revenue/payout. Opt-in required for any reuse.
