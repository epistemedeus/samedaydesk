# G02 RECEIPT — hook regression package

**Date:** 11 September 2026
**Branch:** `fable/w3-12-g02-hook-regression`
**SDS start HEAD:** `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 merge / `main`)
**Cloud run:** https://cursor.com/agents/bc-623468c3-d80c-4c82-b87f-b4b6c03590dd
**Merchant pin:** `a143898dd1ec35c097ca7eb0b472f30dad1ee319` (`indexing-payload-continuity.mjs`, x402-url-extractor PR54)
**H4:** `experiments/cursor-wave-20260911/h4-precise-repairs/` owned by `fable/h4-precise-repairs` — imported read-only, not edited
**Secrets:** none. No deploy. No live payment.

## What

Own directory `tools/hook-regression/`. Tests + CLI freeze PR54 as **presence-only diagnostics**:

- Bazaar indexes `paymentPayload.resource` + `paymentPayload.extensions.bazaar`, not sibling `paymentRequirements`
- `@x402/evm` signs only `payload`; resource/extensions are unsigned hints
- never abort verify/settle for discovery-hint mismatch (asserted in fixtures; no live hooks)
- filling omitted route-owned hints does not change signed authority

## Commands / pass-fail

| Command | Result |
| --- | --- |
| `cd tools/hook-regression && node bin/hook-regression.mjs journey --fixture fixtures/ok-payload.json` | **PASS** (exit 0). `missing_hint` + `signed: false` on bazaar; authority unchanged; unsigned-hint-as-authority rejected. H4 fixtures imported via `git show origin/fable/h4-precise-repairs`. |
| `cd tools/hook-regression && npm test` | **PASS** — 15/15 |
| `npm run test:hook-regression` | **PASS** — 15/15 |

## Contradictions vs brief (followed current source)

- SDS at PR51 has **no** ResourceServer and **no** `verifyPayment` / `settlePayment`. Merchant continuity lives in x402-url-extractor PR54. Encoded as diagnostics only.
- H4 directory is **not** on `main`. Import uses workspace path if present, else `git show origin/fable/h4-precise-repairs:…`. Local fixtures are G02-owned copies of H4 G06 payload shapes so the journey runs standalone.
- Merchant module is **not** copied into this pack (do not duplicate PR54). Planner is imported from H4’s fixture copy when that pack is reachable.

## Scope held

Own directory only (plus a root `test:hook-regression` script). No H4 edits, no merchant-repo changes, no live prices, no payment-function reassignment, no deploy.
