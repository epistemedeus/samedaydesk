# Child 09 — Guardrails (facts)

Not a corpus id. `fixtures/corpus/_guardrails.json` was not added.

## Neo F01 / F07 are not patched on SDS

- `M-termsVersion` is F01 integer `termsVersion` vs F17/F02 content hash. Neo-owned. SDS cannot patch it.
- `M-F07` is `harness_fixture` labelled insufficient. Neo-owned. SDS cannot patch it.
- Claiming either (aliases `F01`, `F07`, `termsVersion`) was patched on SDS is rejected as `neo-defect-not-patched-on-sds` with `patchedOnSds: false`.
- Guard: `refuseNeoPatchedOnSdsClaim` in `src/guardrail-h4r.ts`.

## Seeded failures still rejected

- fixture-becomes-sale — SAMPLE / `--example` / fixture cannot become `provenance=customer` or any paid/settled state
- live settle from canary design — `authorized: false` must not settle
- unsigned indexing hint as signature authority — `resource` / `extensions.bazaar`
- changing live prices or reassigning `verifyPayment` / `settlePayment`
- missing supplied input accepted as a completed repair
- claiming F01/F07 Neo defects were patched on SDS

## Live prices (read-only pins)

- `GET /extract` `$0.005` (atomic `5000`)
- `GET /commerce/seller-integrity-audit` `$0.01` (atomic `10000`)
