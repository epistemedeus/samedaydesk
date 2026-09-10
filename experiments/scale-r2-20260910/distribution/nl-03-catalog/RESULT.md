# NL-DISTRIBUTION-03 RESULT

| Field | Value |
| --- | --- |
| Task | NL-DISTRIBUTION-03 |
| Branch | `codex/nl-distribution-03-catalog-refresh-20260910` |
| Base | `3f5287e86a4e799dde2d089361dbf97f041a48e2` |
| Scope | `experiments/scale-r2-20260910/distribution/nl-03-catalog/` |
| Tests | `npm run test:nl-distribution-03` → **8/8 pass** |
| Paid invoke | **false** (not executed) |
| Grexal login | **false** |
| Agensi | `pending_review` / Free / installs=0 (WAIT) |
| NL-DISTRIBUTION-06 | **not started** |

## Deliverables

- `src/acquisition.mjs` — `buildAcquisitionPackage` → readiness, firstRunRecipe, acquisitionSectionMd, freeVsPriced, budgetHandoff, listing
- `src/cli.mjs` — `demo | build | validate | site-section`
- `candidate-site/acquisition-section.md` (+ `.html`) — SameDayDesk-style candidate copy for Root merge
- `evidence/listing-recheck-20260910T124127Z.{html,headers,json}` — live HTTP 200; matchedPath `/marketplace/[agentId]`; commercial fields sourcedFrom=S149 (SSR-empty)

## Listing recheck

- URL: https://grexal.ai/marketplace/j970cajvv6wbrmy64s2f4ajzw18e5j2q
- HTTP 200 at 2026-09-10T12:41:27Z
- agentId in route params; SSR does not embed price/name
- Pricing from S149: run_completed $0.02; reserve $0.025 not a charge

## Budget handoff

`{ requiresConfirmation: true, listPriceUsd: 0.02, estimateReserveUsd: 0.025, estimateReserveIsCharge: false, paidInvokeExecuted: false }`

Recipe refuses paid-ready without confirmation flag.

## Extends

Reuses `distribution/03` portable catalog (`buildPortableCatalog`, availability invariants). Does not rebuild reporting stack.
