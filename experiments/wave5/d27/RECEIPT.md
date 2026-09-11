# W5-D27 RECEIPT — recruited independent-runtime trial kit

**Date:** 11 September 2026
**Assignment:** W5-D27
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d27-recruited-independent-runtime-trial-kit-and-first-execution-3237`
**Owned path:** `experiments/wave5/d27/`

## Tested implementation

SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`server/paid-useful-jobs/bin/cli.mjs`).
The independent runtime is `runtime/trial.py`. It subprocesses that CLI. This
packet does not claim D01 `execution.v1`, D08 Co14, D24–D26, or a recruited
buyer.

pstack: marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`.
Skills read from cache (`poteto-mode` principles prove-it-works, test-behavior,
laziness, model-the-domain, boundary-discipline, no-comments). Literal slash did
not run. Model for this run is Cursor Grok 4.6 xhigh. No extra Cloud agents.

## Tests

Pre-testing revision. Counts land in the next commit after
`node --test --test-concurrency=1 experiments/wave5/d27/test/*.test.mjs`.

No homepage, root manifest, wrapper, spend, or production deploy in this PR.
