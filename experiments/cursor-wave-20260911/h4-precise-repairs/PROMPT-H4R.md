# H4R — Precise-repairs against the live defect corpus (Heavy-primary reload)

You are Native Grok Heavy. Cursor Auto launched you as launcher/collector only.
You own implementation, tests, commits, push, and a **non-truncated** final JSON receipt.

## Do not redo H4 from scratch

Base branch already has the H4 pack on disk and remote:

| Item | Value |
| --- | --- |
| Repo | `/workspace` → `epistemedeus/samedaydesk` |
| Current branch (checkout) | `fable/h4r-defect-corpus` (from `fable/h4-precise-repairs` @ `03c01edb39f4df4fad7485b0ce7ff8638034e8d6`) |
| Pack dir | `experiments/cursor-wave-20260911/h4-precise-repairs/` |
| H4 already: | src/, tests/, FEATURE-MAP.md, RECEIPT.md, 30/30 npm test, merchant pin `a143898d…`, compare URL recorded |
| Prior Heavy session | `1434eeed-5e5c-48d1-b2d1-1ea29c966400` |

**First** close remaining H4 gaps, **then** apply the pack to the real defect corpus.

## Hard outs of scope

- Do NOT implement Wave 1 F08 paid wrappers product (`server/paid-useful-jobs/` as a second F08 writer).
- Do NOT implement Wave 3 W3-* products.
- Live prices unchanged: `GET /extract` **$0.005** (atomic 5000), `GET /commerce/seller-integrity-audit` **$0.01** (atomic 10000).
- No deployment, payment, secrets, merchant PR, overage, reset redemption.
- Preserve SDS homepage styles.
- Node 22. Do not claim Neo (neomorphic-io) patches on SDS.

## Mandatory: 6–12 genuinely useful native children

Parent **must** spawn **6–12** useful native children and own them through completion. Suggested map (adapt if blocked; record honest lower count only if truly impossible):

1. Confirm pack still passes; open draft PR or record compare URL for `fable/h4r-defect-corpus`.
2. F08 SAMPLE/`--example` reserved-fixture funding (MONITOR SDS review gap) — reproduction + reject-as-not-a-sale regression in this pack; minimal patch only if you can without rewriting F08 product.
3. F18: `GET /health` unsupported on agents gateway; `/healthz` is the live probe — diagnostic + tests; do not “fix” production routes.
4. F18: compressed `Content-Length` ≠ decoded JSON byte pins — pack reproduction; no production change.
5. F18: unpaid 402 (10000 / 5000 atomic) is unpaid-held, not success — regression.
6. F18: SAMPLE / fixture completion is not customer use — keep/strengthen fixture-becomes-sale.
7. MONITOR: F01 integer `termsVersion` vs F17/F02 content hash — **repair brief only** (Neo not writable).
8. MONITOR: F07 `harness_fixture` labelled insufficient — **repair brief only**.
9. Reproductions + regressions for in-scope SDS defects.
10. Repair briefs for out-of-scope residuals (M-termsVersion, M-F07, M-F02-pr notes).
11. Guardrail: fixture-becomes-sale still rejected.
12. F16 meter vendored (Pilot likely not attached) — note / brief.

Record every child session id in RECEIPT.

## Gap close first

1. `cd experiments/cursor-wave-20260911/h4-precise-repairs && npm test` → still 30/30 (or repair).
2. Draft PR to SDS `main` from `fable/h4r-defect-corpus`, or document compare URL in RECEIPT (prior H4: `gh` integration cannot create PRs — retry; if fail, compare URL is enough).
3. **Then** corpus work. Do not stop after the PR attempt.

## Defect corpus (every id MUST appear in RECEIPT)

Disposition per id: `reproduced` | `fixed_with_regression` | `briefed_out_of_scope` | `noted`.

### From MONITOR-STATUS (wave monitor closeout ~18:55Z) — vendor quoted facts; SDS cannot push Pilot

| id | Defect | In SDS scope? | Required action |
| --- | --- | --- | --- |
| M-SDS-F08 | SAMPLE/`--example` still gets reserved-fixture funding; `RECEIPT-REVIEW.md` absent | Yes | reproduction + reject-as-not-a-sale. Do not invent a sale. |
| M-termsVersion | F01 integer `termsVersion` vs F17/F02 content hash | No (Neo) | Repair **brief** only under pack `briefs/` |
| M-F07 | `harness_fixture` labelled insufficient | No (Neo) | Repair brief only |
| M-F02-pr | F02 PR create URL only | Note | Note only |
| M-H4-api | Short API result vs delivered branch | This run | Collector must get a real non-truncated Heavy receipt |

### From F18 live journeys (Pilot PR 128 `fable/f18-live-journeys`, 28 probes / 0 mismatches / 2 unpaid-held)

| id | Finding | Action |
| --- | --- | --- |
| F18-health | `GET /health` unsupported; `/healthz` is live | Reproduction; diagnostic + tests; do not change production routes |
| F18-bytes | gzip/br `Content-Length` ≠ decoded JSON pin | Reproduction in pack; no production change |
| F18-402 | unpaid 402 10000 / 5000 atomic is unpaid-held | Regression: treating 402 as success must fail |
| F18-sample | SAMPLE is not customer use | Keep H4 fixture-becomes-sale |
| F18-routes | live `routeCount` 23 vs older 22 | Observation only |

## Literal user journey (must work)

```sh
cd experiments/cursor-wave-20260911/h4-precise-repairs
npm test
node --experimental-strip-types bin/repair.ts corpus --fixtures fixtures/corpus/
```

(or equivalent CLI already present — extend `bin/` as needed)

Journey: load corpus → each defect is `reproduced` / `fixed_with_regression` / `briefed_out_of_scope` (map notes → `noted`). Fixture cannot become `provenance=customer`. Canary `authorized=false` must not settle.

## Seeded failures that must still be rejected

- fixture-becomes-sale
- live settle from canary design
- unsigned indexing hint as signature authority
- changing live prices or `verifyPayment` / `settlePayment`
- missing supplied input as completed repair
- claiming F01/F07 Neo defects were patched on SDS

## Current SDS source notes (follow source over brief)

- `/api/health` exists on SDS Express (`server/routes/health.js`). Agents gateway probe in machineEntry uses `https://agents.samedaydesk.com/healthz`. F18-health is about the **agents** live probe surface — reproduce as diagnostic distinguishing `/health` vs `/healthz` without breaking SDS `/api/health`.
- Live unpaid-402 pins: extract 5000, seller-integrity-audit 10000 (see `client/public/x402/verified.json` / pricing).
- Six useful jobs remain free offline subjects (PR51). Not F08 wrappers.
- Merchant PR54 pin already in `fixtures/merchant-pr54/`. Diagnostics only.

If `server/paid-useful-jobs/` is absent on this tree: still add pack-local reproduction fixtures + regression that fails until a wrapper rejects SAMPLE funding as not-a-sale; do not invent a second F08 product. Search branches/history for F08 context; quote facts in RECEIPT.

## Deliverables

Update pack under `experiments/cursor-wave-20260911/h4-precise-repairs/`:

- `fixtures/corpus/` — one fixture (or stub) per corpus id
- `briefs/` — Neo / out-of-scope repair briefs (M-termsVersion, M-F07, etc.)
- Corpus runner CLI path above
- Tests: prior 30 + corpus + every seeded failure + F18 reproductions
- Update `FEATURE-MAP.md` (keep four H2s; add corpus journey)
- Replace/extend `RECEIPT.md` with **H4R** section including:
  - SDS base HEAD / branch / compare or PR URL
  - Prior H4 session + this H4R session id
  - **Every child session id** (6–12) + what each did
  - Simultaneous native sessions, peak RAM/CPU, runtime, admissions/retries (best-effort from `/proc` / `grok usage` / session files — be honest)
  - Every defect id → disposition (`reproduced` / `fixed_with_regression` / `briefed_out_of_scope` / `noted`)
  - Commands pass/fail
  - No secrets

## Git

1. Commit incrementally on `fable/h4r-defect-corpus`.
2. `git push -u origin fable/h4r-defect-corpus`.
3. Draft PR to `main` (expect `gh` may fail — then compare URL).
4. Do not merge. Do not deploy.

## Final stdout (required — non-truncated)

Print a single JSON object (pretty) covering at least:

```json
{
  "assignment": "H4R",
  "branch": "fable/h4r-defect-corpus",
  "head": "<sha>",
  "testsPass": true,
  "testCounts": {"pass": N, "fail": 0},
  "parentSessionId": "<this session>",
  "childSessionIds": ["..."],
  "childCount": N,
  "corpus": [{"id":"M-SDS-F08","disposition":"...","notes":"..."}, ...],
  "compareOrPrUrl": "...",
  "runtime": {"started":"...","ended":"...","peakRssMb":null,"notes":"..."},
  "h4GapsClosed": {"tests3030": true, "prOrCompare": true}
}
```

Spawn children now. Own them through completion. Stop when Done criteria met.
