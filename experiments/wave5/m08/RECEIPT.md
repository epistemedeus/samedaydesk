# RECEIPT — W5-M08 independent route consumers

Repo: `epistemedeus/samedaydesk`
Owned path: `experiments/wave5/m08/`
Feature branch: `cursor/w5-m08-independent-route-consumers-for-claimed-supported-frameworks-c2e5`
Feature tip: `b3f89470dc87e413c779c8ca11fc038da25409df`
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/89
Starting ref: SDS52 `aeef964fa188443078958d9d6d393afae1d542ee`
Engine tested: Co12 / W5-M04 pin `7387eb677abd442dfab9081cb0ad95451fd2a762` (`codex/w4-commerce-12-20260911`, PR 64)
Engine source this run: existing git worktree, CLI
`/tmp/readonly-worktrees/co12-7387eb67/tools/route-table-diff/bin/route-diff.mjs`
Integration owner: W5-M01
Kernel owner: W5-M04

## What this is

Thin CLI consumer of the pinned route-table-diff engine. It gates claimed JSON
catalog formats, runs the real Co12 process, and writes Co12 `route-diff.json`
plus `route-diff.md`. It does not copy `tools/route-table-diff/`, edit
`spa-route-shells.js`, or settle payment (`paid=false`, `settled=false`).

## Commands

Node v22.14.0. No extra npm packages. No env secrets. Loopback HTTP only.

```bash
cd experiments/wave5/m08 && node --test --test-concurrency=1 test/*.test.mjs
node experiments/wave5/m08/bin/route-consumer.mjs \
  --before experiments/wave5/m08/fixtures/supported/routes-before.json \
  --after experiments/wave5/m08/fixtures/supported/routes-after.json \
  --out-dir /tmp/w5-m08-cli-journey
```

Missing Co12 is `engine_unavailable` (incomplete), never a skipped pass.

## Test counts

`node --test --test-concurrency=1 experiments/wave5/m08/test/*.test.mjs`

27 passed, 0 failed, 0 skipped.

Direct CLI journey: `ok=true`, `analysis=change`, added `/x402`, `/terms` canonical
change, engine SHA `7387eb67`.

## Source-only findings reproduced

- Permutation of the same SDS routes: added/removed/changed are 0 (`no-change`).
  Current pin `tableDigest` still changes with order. Reported as
  `digestOrderSensitive: true`. Hashes are not forced equal. Remaining M04 work.
- Duplicate path is engine `duplicate_path`, not an unsupported format.
- Removing `/for-agents/useful-jobs` is a listed removal.
- Integer `termsVersion` is engine `integer_terms_version_refused`. Not mapped
  onto I01 `hashTermsVersion`.
- Relative canonical is engine `invalid_canonical`, not a crash.
- Co12 at this pin accepts Next.js-shaped `{routes:[{path:"/blog/[slug]", ...}]}`.
  This consumer refuses `unsupported_format` / `nextjs`. That is the owned fix.
- HTML, YAML, CSV, Express, Next page, FastAPI, OpenAPI, HTTPS locators refuse
  with explicit format names. Co12 would mostly say `invalid_catalog`.
- `catalog-wrapper` works on this pin though Co12 FEATURE-MAP prefers `routes`.
- Live `SPA_ROUTE_SHELLS` on SDS52 includes `/x402` and account shells (15
  records). Co12's copied PUBLIC_SHELLS snapshot had 7 paths. This consumer
  uses the live module, not that snapshot.

## Analysis vs transport

Identical catalogs: `analysis=no-change` (useful). Missing engine root:
`analysis=engine-failure`. Valid Co12 refusals stay `analysis=refused`.

Postgres is unused. A missing database is not a skip.

## Remaining integration binding

W5-M04 still owns `tools/route-table-diff`. A later order-stable digest or
kernel-side Next.js refusal is not claimed here. W5-M01 wires catalog/offer
selection. Direct Co12 CLI without this consumer still accepts Next.js-shaped
JSON.

## pstack

Account plugin cache present:
`~/.cursor/plugins/cache/cursor-public/9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8`.
Skills were read as files (`disable-model-invocation: true`): tdd,
principle-prove-it-works, principle-test-behavior-not-implementation,
principle-boundary-discipline, principle-subtract-before-you-add,
principle-sequence-verifiable-units. Literal slash commands were not used.
No `~/.cursor/rules/pstack-models.mdc`. Run model field:
`cursor-grok-4.6-xhigh`. No extra Cloud agents.

## Non-claims

No default-branch push, deploy, spend, payout, or customer messages.
