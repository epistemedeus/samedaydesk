# W5-D27 RECEIPT — recruited independent-runtime trial kit

**Date:** 11 September 2026
**Assignment:** W5-D27
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d27-recruited-independent-runtime-trial-kit-and-first-execution-3237`
**Owned path:** `experiments/wave5/d27/`

## Tested implementation

SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`server/paid-useful-jobs/bin/cli.mjs`).
Independent runtime: `runtime/trial.py` (Python 3.12.3) subprocessing Node v22.14.0.
This packet does not claim D01 `execution.v1` (read-only SHA
`6bed72dd22a396134aa5c957933b42c3a5746698`), D08 Co14
`4641173163616b76608cbb3beb503f2d94369b25`, D24–D26, or a recruited buyer.

pstack: marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`.
Skills read from cache (prove-it-works, test-behavior, laziness, model-the-domain,
boundary-discipline). Literal slash did not run. Model: Cursor Grok 4.6 xhigh.
No extra Cloud agents.

## Current-source findings

1. PR52 CLI JSON has `ok`, `engine.status`, `receipt`. It does not emit D01
   `transport` / `analysis` / `delivery` objects. Classification uses `engine.status`
   (`actionable` / `informational` / `refused`).
2. HTML `after` on `vendor-budget-impact` is wrapper `ok: true` with analysis
   `refused` and complete artifacts. That is useful-refusal, not a crash.
3. Identical before/after is `informational` with `fieldChanges=0`. Valid
   no-change. Change vs no-change `outputsDigest` values are not forced equal.
4. Co14 acquires the PR51 archive directly. This kit does not import it.
5. The Python runtime still needs Node and a repo-relative wrapper CLI. D24
   clean-environment install is unbound.

## First execution (owner QA)

```bash
node experiments/wave5/d27/bin/d27-trial.mjs first-execution \
  --buyer-class owner-qa --out-dir /tmp/d27-first
```

Runtime-owned files (not SAMPLE): change → `useful-change`; identical pair →
`useful-no-change`; HTML after → `useful-refusal`. `sold` false. Demand claimed
false.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d27/test/*.test.mjs
```

**PASS** — 13 tests, 0 fail, 0 skipped. Node v22.14.0, Python 3.12.3.
Postgres is not a surface and was not skipped as a green gate.

## Remaining integration bind

D01 execution.v1 fields, D08 wrapper-consuming Python client, D24 clean install,
D25 buyer journey, D26 price floor, and Root recruitment of a non-owner
runtime. This kit does not claim those siblings.

No homepage, root manifest, wrapper, spend, or production deploy.
