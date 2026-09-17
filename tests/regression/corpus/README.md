# SameDayDesk regression corpus

Executable fixtures for known past defects on SameDayDesk merchant, buyer, verifier, and pack surfaces.

Shape (shared with the Neo corpus):

```
tests/regression/corpus/
  schema.json
  catalog.json
  run.mjs
  lib/
  cases/<id>/case.json
```

Write boundary is this tree only. `tools/verify/**` and `verify-samedaydesk` stay on their own branches.

## Run

```
node tests/regression/corpus/run.mjs --json
node tests/regression/corpus/run.mjs --seeded-failure false-accept --json
node tests/regression/corpus/run.mjs --seeded-failure false-reject --json
node --test tests/regression/corpus/*.test.mjs
```

Node 22.x. No Stripe or x402 payment. No MCP `tools/call`.

## Honest vs naive

Each case records the real product outcome, then two verdicts:

- Honest: `ok:true` (or HTTP 2xx) is accept; `ok:false` / challenge / 402 is reject.
- Naive `exit0`: process exit 0 is accept. This is the obtain-archive / s185 wrapper bug.
- Naive `http-200`: HTTP 200 is accept.
- Naive `html-body`: any HTML body is accept (hcdn challenge page).

A designated seeded false-accept (`archive-wrong-digest`) is SHA mismatch with child exit 0. A designated seeded false-reject (`offer-routing-complete-issue`) is mapped refuse with exit 2. The runner must still catch both after later verifier edits.

## Surfaces

| surface | SDS features in this corpus |
| --- | --- |
| merchant | offer-routing, apex MCP inventory, SPA unknown-path 404, hcdn challenge, unpaid 402 |
| buyer | obtain-archive, 1.1.0 negative control, result-reuse `--out`, for-agents cold-read fixture |
| verifier | evidence-record organic label, payment replay block |
| pack | useful-jobs 1.4.7 missing inputs / HTML lockfile, s185 missing input |

## Limits

Live apex TLS is not used. CDN/402 classes are fixture-classified with the retained rule in `lib/classify-http.mjs`. useful-jobs cases extract the in-tree 1.4.7 archive outside the repo.
