# NL-DISTRIBUTION-03 — Acquisition package (catalog refresh)

Isolated experiment under `experiments/scale-r2-20260910/distribution/nl-03-catalog`.

Extends the portable catalog (`distribution/03`) into an **actionable customer acquisition package**: no-key readiness, first-run recipe, free-vs-priced labels, budget confirmation handoff, and candidate SameDayDesk-style site copy.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/nl-03-catalog/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/nl-03-catalog/src/cli.mjs build experiments/scale-r2-20260910/distribution/nl-03-catalog/fixtures/inventory.positive.json
node experiments/scale-r2-20260910/distribution/nl-03-catalog/src/cli.mjs validate /tmp/nl-dist-03-acquisition.json
node experiments/scale-r2-20260910/distribution/nl-03-catalog/src/cli.mjs site-section
npm run test:nl-distribution-03
```

## Public listing (rechecked)

- URL: https://grexal.ai/marketplace/j970cajvv6wbrmy64s2f4ajzw18e5j2q
- agentId: `j970cajvv6wbrmy64s2f4ajzw18e5j2q`
- Live capture: HTTP 200, matched path `/marketplace/[agentId]`
- Commercial fields: **sourcedFrom=S149** (SSR does not embed price/name)

## Free vs priced

| Action | Cost |
| --- | --- |
| Browse / read listing | Free |
| Local offline pack (`npm test` / `pack_evidence`) | Free |
| Marketplace Run | $0.02 on run_completed; reserve $0.025 is **not** a charge |

Budget handoff requires confirmation **before** any paid invoke. This kit never logs in or runs paid invoke.

## Candidate site

`candidate-site/acquisition-section.md` (+ `.html` fragment) — Root owns public merge. No adoption/revenue claims. Agensi stays `pending_review` / installs=0.

## Mutation boundary

No CloudAgent. No Grexal login. No paid Grexal invoke. No NL-DISTRIBUTION-06. Feature-branch source/tests only.
