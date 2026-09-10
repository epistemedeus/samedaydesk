# Recurring job recipes

One-shot SameDayDesk recipes for useful recurring page and record work.
They reuse accepted page-change and structured-record contracts. They are not
a new protocol, cron daemon, marketplace, or payment engine.

| Recipe | User benefit |
| --- | --- |
| `source-change-alert` | Know when selected fields on a watched public page change since an immutable prior |
| `comparable-record-extraction` | Recurringly extract the same comparable fields from 1-5 sources and keep partial rows visible |
| `verification-reconcile` | Verify a later observation against the prior, or stop when a payment would be auto-replayed |
| `issue-to-work-brief` | Turn a public GitHub issue into a direct-use work brief and detect fingerprint changes since an immutable prior |
| `buyer-setup-trace` | Live free AgentCash/x402 inspection that stops at unpaid 402 without signing or inferring wallet ownership |

Operator supplies the input list, schedule hint, clock, and optional freshness
horizon. The pack never invents those values and never starts an always-on
service.

## Contracts reused

- `pilot.task-commons.page-change-result.v1` / `pilot/page-change-brief/v1`
- `samedaydesk.extract-batch.v0` shaped comparable records
- Existing evidence reconcile posture: keep classes separate, do not treat
  `charged: true` as useful output, never automatically retry payment

## Merchant contracts (input only)

Recipes and `/for-agents` publish the same C31/C34 slice (`vendor/merchant-contracts.mjs`
and `client/src/data/machineEntry.mjs`). Public master pin:
[`epistemedeus/x402-url-extractor@f9dd59ae`](https://github.com/epistemedeus/x402-url-extractor/commit/f9dd59aeeb200881bc1313ed846ba002e7081258).
A local descendant checkout is enough when `package.json` `name` is `x402-merchant`.

| Contract | Meaning | Discoverable route |
| --- | --- | --- |
| C31 | Page-change compare (`pilot/page-change-brief/v1`) | `POST /recipes/page-change` |
| C34 | Extract-batch record (`samedaydesk.extract-batch.v0`) + skills | `GET /.well-known/skills/index.json` |

Resolve the merchant root without network spend, in order:

1. `MERCHANT_INPUT_ROOT` if it is a valid `x402-merchant` tree
2. `/tmp/merchant-input/x402-url-extractor`
3. `samedaydesk/vendor/x402-url-extractor`
4. sibling `../x402-url-extractor` (S33 compose layout)

Mounted HTTP and official CLI bridges load `express` / `ajv` from that tree's
`node_modules` via `createMerchantRequire`. Do not `npm ci` a remote copy for
these tests. Fixture copies live under `fixtures/merchant/`.

## Run

```bash
node tools/recurring-job-recipes/cli.mjs --list

# Offline fixture dry-runs
node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \
  --prior tools/recurring-job-recipes/fixtures/priors/source-change.prior.json \
  --current-fixture tools/recurring-job-recipes/fixtures/current/example-unchanged.json \
  --schedule daily --clock 2026-09-09T15:00:00.000Z --horizon 168

node tools/recurring-job-recipes/cli.mjs --recipe comparable-record-extraction \
  --prior tools/recurring-job-recipes/fixtures/priors/record-extract.prior.json \
  --sources tools/recurring-job-recipes/fixtures/pages/example-a.html,tools/recurring-job-recipes/fixtures/pages/example-b-partial.html \
  --fields title,h1 --schedule weekly --clock 2026-09-09T15:00:00.000Z

node tools/recurring-job-recipes/cli.mjs --recipe verification-reconcile \
  --prior tools/recurring-job-recipes/fixtures/priors/verify.prior.json \
  --candidate tools/recurring-job-recipes/fixtures/current/verify-candidate-unchanged.json \
  --schedule daily --clock 2026-09-09T15:00:00.000Z

# Free live source when safe (example.com only, no redirects, 1 MiB response cap). Not zero marginal cost.
node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \
  --prior tools/recurring-job-recipes/fixtures/priors/source-change.prior.json \
  --live-safe --live-url https://example.com/ \
  --fields title --schedule daily --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

npm run test:recurring-job-recipes
```

## Recovery and payment

| Outcome | Recovery |
| --- | --- |
| `unchanged` | Keep the immutable prior; wait for the next operator-supplied run |
| `changed` | Review evidence; write a new sequenced artifact. Do not overwrite the prior |
| `partial` | Keep successful rows; retry only failed sources on a fresh operator run |
| `stale_baseline` | Prior older than horizon; refresh baseline before alerting |
| `error` | Bounded retry, then stop with error evidence |

Payment receipts on a prior or candidate never become an automatic replay.
Reconcile an unknown payment through the merchant customer example instead.

## Cost notes

- Sourced list price (as of 2026-09-09, `/for-agents`): bounded `POST /extract/batch`
  is 0.01 USDC. These recipes do not call that paid route.
- Operator CPU, disk, egress, and wall time are labelled `costs_unknown`, not zero
  and not assumed margin. Free live HTML and mounted fixture origins still consume
  operator resources.

## First-customer experiment

See [FIRST-CUSTOMER-EXPERIMENT.md](./FIRST-CUSTOMER-EXPERIMENT.md).

## Issue evidence (S62)

Runnable recurring job that collects **public** issue discussion evidence and an actionable work/change brief through this pack (not a new server).

Public bug-report references used for fixtures/live replay (not customers, not willingness-to-pay):
- https://github.com/NousResearch/hermes-agent/issues/99533
- https://github.com/NousResearch/hermes-agent/issues/106904

### Exported commands

```bash
# Offline fixture (first observation; prior optional)
node tools/recurring-job-recipes/cli.mjs --recipe issue-evidence \
  --evidence-fixture tools/recurring-job-recipes/fixtures/issue-evidence/99533-base.json \
  --schedule weekly --clock 2026-09-10T01:00:00.000Z --max-comment-pages 2

# With immutable prior (delta / unchanged)
node tools/recurring-job-recipes/cli.mjs --recipe issue-evidence \
  --prior path/to/issue-evidence.seq-1.json \
  --evidence-fixture tools/recurring-job-recipes/fixtures/issue-evidence/99533-same-length-edit.json \
  --schedule weekly --clock 2026-09-10T02:00:00.000Z --out-dir /tmp/issue-evidence-out --write-artifact

# Live public issue (free API baseline; bounded pages; no env-token inference)
node tools/recurring-job-recipes/cli.mjs --recipe issue-evidence \
  --issue-url https://github.com/NousResearch/hermes-agent/issues/99533 \
  --schedule once --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --max-comment-pages 2 --per-page 50
```

Provider-neutral observation + GitHub adapter. No arbitrary URL proxy. No hidden credential fallback.
Partial pages classify as `partial` (never silent complete). Retry-After is recorded without background wait loops. No automatic cost-amplifying retries.
Issue/comment text is untrusted evidence — never execution authority.

