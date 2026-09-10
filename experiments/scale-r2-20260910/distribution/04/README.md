# R2-DISTRIBUTION-04 — Agent acquisition intent links

Isolated experiment under `experiments/scale-r2-20260910/distribution/04` (repo: `epistemedeus/samedaydesk`).

## Outcome

Add **explicit source tags** to existing product entry links and emit **privacy-bounded result events**, **never equating click with buyer intent**.

- Source tags: `source=grexal|agensi|catalog|manual` plus opaque campaign/ref ids
- Events may record `linkPresented` / `linkActivated` / `sourceTag` only
- Forbidden: `buyerIntent`, `purchaseIntent`, and any activation-equals-intent claim
- Capture outcomes: `recorded` | `unavailable` | `no_users` — **unavailable ≠ no_users**

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/04/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/04/src/cli.mjs tag experiments/scale-r2-20260910/distribution/04/fixtures/entries.positive.json
node experiments/scale-r2-20260910/distribution/04/src/cli.mjs event /tmp/r2-dist-04-tagged.json experiments/scale-r2-20260910/distribution/04/fixtures/signal.recorded.json
node experiments/scale-r2-20260910/distribution/04/src/cli.mjs validate /tmp/r2-dist-04-events.json
npm run test:r2-distribution-04
```

Demo writes `/tmp/r2-dist-04-tagged.json` + `/tmp/r2-dist-04-events.json`, prints source tags, shows click≠intent and unavailable≠no_users.

## Capture outcomes

| Outcome | Meaning |
| --- | --- |
| `recorded` | Capture ok; presentations/activations recorded (synthetic unless cited) |
| `unavailable` | Capture **failed** — do **not** claim zero activations |
| `no_users` | Capture **succeeded**; activations are **zero** |

## Evidence

See `evidence/INDEX.md` (absolute receipt + DISTRIBUTION-01/02/03 + S124/S131 pointers). Extends existing evidence; does not duplicate reporting.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price, visibility, PendingReview outcome, and merge to default. No CloudAgent. No Grexal/Agensi authenticated mutations. No invented live traffic.
