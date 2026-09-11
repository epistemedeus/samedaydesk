# RECEIPT — W5-D21 Co06 useful failure dossier

Tool: `tools/failed-delivery-dossier/`
Branch: `cursor/w5-d21-co06-useful-failure-dossier-with-actual-observed-source-status-2890`
HEAD: `8e1e5ff470a60bc83a08792d3d725842cbd8eeef`
Repo: `epistemedeus/samedaydesk`
Starting ref: `f76235f32c5fe19d22f381c4b0eaab82962a56b7`
Date: 2026-09-11
Node: v22.x

## Outcome

Catalog or fixture `expectedStatus`/`httpStatus` 402 is packed as `observationStatus: expected`, never `observed`. Unrun checks (`live-extract-http`, `postgres`, pin worktrees until `--verify-pins`) have `pass: false` and `observed: false`. Actual local HTTP 402 is `observed-paywall` while live extract stays unrun. Claimed official source without sha/gitHead/http evidence is refused. SDS52 CLI sample refusal is `valid-analysis`, not `transport-failure`.

## Pins tested (not forced equal)

| Ref | SHA | Class |
| --- | --- | --- |
| F08 fixture capture | `bae3e7cd5034b21019fb272a99d88db964b831ee` | verified read-only worktree + historical CLI fixture |
| SDS52 current wrapper | `aeef964fa188443078958d9d6d393afae1d542ee` PR52 | verified read-only worktree; CLI `sample-not-a-sale` exit 2 |
| SDS main | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | claimed in honesty.sourceStatus, not re-verified as official here |
| I01 terms pin | `819fa637ecf5e5177c84efc16fcaa18d57017631` | integer `termsVersion` refused; golden hash not re-verified at Neo54 `346bbd3c` |

Remaining binding: W5-D01 may amend `server/paid-useful-jobs`. This packer consumes `samedaydesk.paid-useful-jobs.receipt.v1` only and does not import `wrapper.mjs`. Live production extract GET remains unrun.

## Tests

```bash
npm install
node --test --test-concurrency=1 tools/failed-delivery-dossier/test/*.test.mjs
```

**PASS — 24 tests, 0 fail, 0 skipped** on this VM.

Also ran `node --test server/scripts/test-checkout-http-lifecycle.js` (1 pass). Local HTTP checkout capture and local HTTP 402 capture are process tests. Postgres is not used; honesty lists it as `unrun` with `pass: false`, not a skipped passing gate.

## pstack

Plugin cache present at `~/.cursor/plugins/cache/cursor-public/9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8/skills/`. Read fully: prove-it-works, test-behavior-not-implementation, tdd, typescript-best-practices, type-system-discipline, fix-root-causes, subtract-before-you-add, boundary-discipline, setup-pstack. Invocation was direct SKILL.md reads (`disable-model-invocation: true`), not slash `/swarm`. No extra Cloud agents. Parent model: Cursor Grok 4.6 xhigh. Did not write `pstack-models.mdc` (setup-pstack requires interactive role confirmation).

## Honestly untested

- Live extract GET against production (unrun, not observed)
- Live Stripe / facilitator / PAYMENT-SIGNATURE (refused)
- Neo54 `346bbd3c` golden terms hash recomputation
- W5-D01 wrapper amendments after `aeef964fa`

## Next integration owner

W5-D01. Keep receipt schema. Do not copy the wrapper kernel.
