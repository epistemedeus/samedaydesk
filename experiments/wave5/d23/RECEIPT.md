# W5-D23 RECEIPT — Co19 unpaid/extraction test boundary

**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d23-co19-unpaid-extraction-test-boundary-with-honest-enforcement-claims-eb77`
**HEAD:** (this commit)
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/83
**Starting ref:** `f09d3886837e690890aa3c8f9574f11b0dbb65c1`
**Owned paths:** `tools/extract-unpaid-honesty/`, `experiments/wave5/d23/RECEIPT.md`
**Integration owner:** W5-D01

## Source

| Input | SHA | Use |
| --- | --- | --- |
| Co19 honesty join | `f09d3886837e690890aa3c8f9574f11b0dbb65c1` | starting implementation |
| SDS PR52 wrapper | `aeef964fa188443078958d9d6d393afae1d542ee` | read-only worktree `/tmp/ro-sds-pr52`; not imported |
| Root Co19 prediction | Pilot `overview/research/cursor-wave5-20260911/REVIEW-INTEGRATION.md` | JS hooks ≠ OS isolation; tautological preservation; shared logs/cache |

PR52 `server/paid-useful-jobs` is absent on this branch. D01 owns that wrapper. This module did not copy it. Honesty terms schema is not hashed equal to PR52 receipts.

## Reproduced predictions

- `mustNotRunPreserved` compared a copied array to itself.
- Intercept set parent `HONESTY_INTERCEPT_LOG`; nested servers mixed logs.
- Probe defaulted to the live merchant URL and relied on JS hooks to avoid a GET.
- FEATURE-MAP/RECEIPT claimed a useful-jobs run never starts extract as if OS-isolated.
- Shared tmpdir kit cache was reported as the verified archive bytes.

## Fix

Published `lib/enforcement.mjs` (`osIsolation: false`). Probe fetches the local intercept `/extract` (remote URLs rewritten). Payment-shaped attempts are logged as `payment-attempt-detected`. `mustNotRunPreserved` is a stdout/stderr text scan. Intercept logs use a per-server path. Kit cache is labelled `extractedContentsVerified: false`. Unhooked local dummy fetch is allowed to escape and is classified `js-hooks-not-os-isolation`, not as OS proof.

Valid unpaid `listing-repair-packet` remains `outcomeClass: valid-unpaid`, distinct from engine failure and from a detected payment attempt.

## Tests

Node v22.14.0. No extra install. Postgres not in this interface (not a skipped pass).

```
cd tools/extract-unpaid-honesty
node --test --test-concurrency=1 test/*.test.mjs
node bin/honesty.mjs journey
node bin/honesty.mjs probe-extract
node bin/honesty.mjs enforcement
node bin/honesty.mjs observe-must-not-run
```

`node --test --test-concurrency=1 test/*.test.mjs`: **25 pass, 0 fail, 0 skip**.

CLI: `journey` ok, `osIsolation` false, `outcomeClass` valid-unpaid, `paymentAttemptDetected` false. `probe-extract` caught, `paymentAttemptDetected` true, `liveGet` false. `enforcement` `osIsolation` false. `observe-must-not-run` exits 1 with marker `payX402 paid retry` (seeded text-scan, not OS).

## pstack

Marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`. Read `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-boundary-discipline` (all `disable-model-invocation: true`; direct file read, no slash expansion). Model: included Cursor Grok 4.6 xhigh. No extra Cloud agents.

## Remaining integration binding

D01 may still amend PR52. This consumer was tested against pin `aeef964fa188443078958d9d6d393afae1d542ee` as source-read only. Live extract `$0.005` / seller-integrity `$0.01` are merchant products this join must not start. I01 hashTermsVersion remains a later Neo PR54 binding (`sha256:` shape only). No live GET, no spend, no deploy.
