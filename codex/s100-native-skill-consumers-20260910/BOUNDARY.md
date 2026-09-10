# S100 handoff boundary

## Package layout
All S100 source for independent verification lives under this directory:

`codex/s100-native-skill-consumers-20260910/`

Root-collected commit `8da8d615090ecf46b02e20a7189bbe2563f80e29` already contained
`consumers/native-s100/*` **inside this package directory**. Ads that said
`consumers/native-s100/run-harness.mjs` without the package prefix were
ambiguous if resolved from the SameDayDesk repo root.

## Offline verification (Root acceptance path)
```bash
cd codex/s100-native-skill-consumers-20260910
node consumers/native-s100/run-harness.mjs --verify-only
# equivalent:
node consumers/native-s100/verify-only.mjs
```

`--verify-only`:
- reads `consumers/native-s100/cases.json`
- validates each case against `evidence/sanitized-artifacts/<id>.json`
- uses `consumers/native-s100/accept.mjs`
- writes `evidence/verify-only-report.json`
- **never** launches models, opens network, signs, or calls paid gateways
- **never** requires merchant checkout or Grok auth

## Local model re-execution (optional; out of Root acceptance scope)
`run-harness.mjs` without `--verify-only` can launch native Grok children.
That path needs:
- authenticated local Grok binary
- skills pin checkout (`S100_SKILLS_ROOT`)
- merchant pin checkout for owner-qa fixtures (`S100_MERCHANT_DIR`)
- unpaid live gateway discovery for 402-stop cases

Prompt text for local re-execution is built from public `SKILL.md` + the
public `task` strings in `cases.json`. No Pilot/Neo private packets or
inherited private prompts are included in this package.

## Owner-qa fixtures
`consumers/native-s100/owner-qa/run-fixture.mjs` is source for local
deterministic merchant fixture generation. It is **not** required for
`--verify-only` against the already-exported sanitized artifacts.

## Timing provenance
See `evidence/run-provenance.json`. Cohorts were sequential:
9 then +3 then +4. Per-cohort peak process samples were 11 / 3 / 4.
That is overlap within a cohort, not 16 concurrent, and not a permanent ceiling.
