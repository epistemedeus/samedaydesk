# R02-stripe-openapi-routes

Status: **complete**. Tests: **10 pass / 0 fail**.

## Source

- Official repo: `stripe/openapi` path `openapi/spec3.yaml` (MIT)
- `af5309cae53e5f666f9686dfed306d6d3b5fdc67` (2026-07-29.dahlia) → `30d3391cc09a0f67ad29bee002f570811b19e1da` (2026-08-26.dahlia)
- Full YAML sha256: `707de00b…f76e` (6364174 bytes) → `2e0ce56f…d203` (6409430 bytes). Specs not stored; bounded excerpts + provenance in `SOURCE.md`.

Used pins are 13 real method+path ops around `/v1/customers`, `/v1/charges`, `/v1/payment_intents`. That set is identical in both snapshots. Nested requestBody still differs (`touch_n_go` enum add; `billie` subscription payment-method option).

## Engine vs witness

| | Engine (`api-upgrade-brief` 1.4.0) | Independent witness |
| --- | --- | --- |
| Identity | used-op fingerprint | HTTP method + path |
| Add/remove | none | none |
| Changed | none (summary: no structural delta) | 3 ops whose operation object digest differs |
| Status | `partial` (57 missing-local-ref gaps; component graph omitted from excerpts) | changed list above |

Kit engines were not edited. See `regression-artifact.json` for the fingerprint-depth gap.

## Honesty

Fixture OpenAPI, not live Stripe, not purchase authority, not a runtime compatibility proof. OpenAPI method+path is not an SDS route table. Not OpenAI.

Receiving owner: H6D parent catalog + `bin/select-job.mjs`.
