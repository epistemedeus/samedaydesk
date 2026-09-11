# W5-D27 independent-runtime trial kit

Owner-labelled field kit. A Python 3 process submits **its own** files to the
current SDS PR52 paid wrapper CLI. It does not copy engines, the wrapper, or
the W4-commerce-14 Python client.

Buyer classes: `owner-qa` (this packet's first execution), `recruited-independent`
(refused without operator-held evidence), `unknown` (refused). Demand is never
inferred from a successful scan.

## Literal first execution (owner QA)

From the repository root, Node >= 22 and Python 3:

```bash
node experiments/wave5/d27/bin/d27-trial.mjs first-execution \
  --buyer-class owner-qa \
  --out-dir /tmp/d27-first
```

That run uses `fixtures/runtime-owned/vendor-budget/` (not SAMPLE, not the
wrapper's caller fixtures):

1. changed pricing rows → `useful-change`
2. identical before/after → `useful-no-change` (valid analysis, not a crash)
3. HTML after file → `useful-refusal` with complete artifacts (valid analysis)

## Independent runtime (copy-paste)

```bash
python3 experiments/wave5/d27/runtime/trial.py \
  --cli server/paid-useful-jobs/bin/cli.mjs \
  --repo . \
  --job vendor-budget-impact \
  --before experiments/wave5/d27/fixtures/runtime-owned/vendor-budget/before.json \
  --after experiments/wave5/d27/fixtures/runtime-owned/vendor-budget/after.json \
  --out-dir /tmp/d27-runtime
```

## Remaining live steps (Root / journey owner)

1. Recruit a non-owner independent runtime operator. This worker does not send
   messages or invent that operator.
2. Bind D08 so the installed Python client calls this wrapper CLI.
3. Bind D24 so the kit can be installed without a full SDS checkout.
4. D01 `execution.v1` fields, D25 buyer journey, and D26 price floor stay sibling
   work. This kit classifies the PR52 pin it actually spawned.

No spend, payout, deploy, or live settlement.
