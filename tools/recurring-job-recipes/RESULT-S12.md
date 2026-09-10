# S12 / S05 RESULT — recurring job recipes E2E

## Identity

- repo: `epistemedeus/samedaydesk`
- branch: `cursor/pilot-scale-s12-repeat-job-end-to-end-delivery-d262`
- base: `main` @ `dac81817d21e6035b992af8743477460caf78d52`
- S05 candidate reviewed: `032b8a95d2beb3142b8bcdb2ebf23d6660f91a3a` (cherry-picked + extended)
- merchant input (read-only): `epistemedeus/x402-url-extractor@f9dd59aeeb200881bc1313ed846ba002e7081258`
- pilot context `73ba858363ab8f9ba4968659ffde2695625ae47c`: not present on accessible remotes (unresolved)
- `SCALE-EXECUTION-PLAN`: not located in accessible org repos (unresolved)

## Delivered

Integrated `tools/recurring-job-recipes/` on current main with:

- C31 page-change alignment (`pilot/page-change-brief/v1`, `POST /recipes/page-change`)
- C34 extract-batch + skills discovery (`samedaydesk.extract-batch.v0`, `GET /.well-known/skills/index.json`)
- Local mounted HTTP fixture origin (no express.json on page-change raw body)
- Official `examples/customer-x402` CLI bridges for page-change + record
- Exact recipe result validation (`lib/validate.mjs`)
- `/for-agents` Job 5 machine discovery with required operator fields
- Costs labelled `costs_unknown` (no assumed margin)

Homepages, brands, payment authority pins (`MERCHANT_PIN`), unrelated branches: untouched.

## Tests (actual)

```bash
export MERCHANT_INPUT_ROOT=/path/to/x402-url-extractor  # checkout f9dd59ae
npm run test:recurring-job-recipes   # 19 pass, ~0.37–0.46s wall
npm run test:spa-route-shells        # 9 pass
```

Mounted E2E covers: unchanged/changed/partial/stale/payment-replay blocked, immutable prior + sequenced artifact, C31 HTTP+CLI parity, C34 schema + record CLI partial exit 1.

## Measurements

See `/tmp/admission-snapshot.json` and `/tmp/completion-snapshot.json`.

| Phase | memory.current | memory.peak | MemAvailable | disk free % | OOM |
| --- | --- | --- | --- | --- | --- |
| admission | ~826MB | 838MB | ~11.7GB | 97.42 | 0 |
| completion | (see snapshot) | (see snapshot) | (see snapshot) | (see snapshot) | 0 |

Recipe test wall time: **0.46s** (19 tests). No deploy, merge, spend, or secret export.

## Proposed repeat-use trial (owner-controlled)

1. Keep sequence-1 prior at `fixtures/priors/source-change.prior.json`.
2. Weekly operator clock: run `source-change-alert` with `--current-fixture` then optional `--live-safe` against `https://example.com/`.
3. On `changed`, write sequence-2 via `--write-artifact --out-dir /tmp/recipe-run` without touching sequence-1.
4. Kill if only agent self-runs; revise watched source first.

## Handoff

Branch pushed; root creates PR after acceptance. No PR approval wait requested.
