# S56 RESULT — SameDayDesk

## Composition
| Item | Value |
| --- | --- |
| Branch | `codex/s56-final-commerce-composition-20260909` |
| Current `main` | `1b01c26a0995af9fced515b2f551d2dbd949bcb2` |
| S37R final-review | `4a516f973eb65b0154aebe7ebfe666e128f713ff` |
| Tip | `90a60a15e1ddcf0e9e3d0ec3415ca4b32767d426` (two-parent merge) |
| Conflict | `package.json` scripts — union of PR43 `test:public-entry` + S37R recipe scripts |

## Preserved
- PR #42 bounded Hostinger TLS fallback (`8b31ff549da9b1e47c914113429459b7e25de97f`)
- PR #43 README public entry (`1b01c26a0995af9fced515b2f551d2dbd949bcb2`)
- Manual redirects / finalURL / 1MiB / 8s single-attempt free fetch
- Issue constraints, body hash + identity, generatedPrior alignment; legacy baseline explicit

## Excluded
- `codex/s49-live-market-delivery-20260909`
- `codex/s51-shared-host-correspondence-20260909`

## Integration fix (latent S37R)
`issue-to-work-brief` shared prior is intentionally incomplete (legacy). `recipes.test.mjs` incorrectly expected `unchanged`; aligned with s21-e2e / s37r-release (`changed` + complete fingerprint emission + prior bytes immutable). Not a test relaxation.

## Tests (this tip)
- `test:recurring-job-recipes`: **81 pass / 0 fail** (with `MERCHANT_INPUT_ROOT` → S56 x402 tip)
- `test:public-entry`: **4 pass**
- `test:presence`: **25 pass** (1 skipped in suite accounting) / exit 0
- `test:result-reuse`: **23 pass**
- client `build`: exit 0
- browser desktop 1280 smoke: **2 pass**
- browser mobile 390 smoke: **2 pass**

Node `v22.14.0`. No payment mutation; pending/unknown writes preserved.
