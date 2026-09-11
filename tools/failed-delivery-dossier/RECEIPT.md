# RECEIPT — W5-D21 Co06 observation honesty on failed-delivery dossier

Tool: `tools/failed-delivery-dossier/`
Branch: `cursor/w5-d21-co06-useful-failure-dossier-with-actual-observed-source-status-2890`
HEAD: `8e1e5ff470a60bc83a08792d3d725842cbd8eeef`
Base: `f76235f32c5fe19d22f381c4b0eaab82962a56b7`
Repo: `epistemedeus/samedaydesk`
Date: 2026-09-11
Node: v22.x

## Outcome

Fixed Co06: expected 402 is not an observed response; unrun optional checks are not passing skips; official source/state needs evidence. `lib/observation.mjs` is the published contract (`OBSERVATION_CONTRACT`). Local HTTP 402 is observed; live extract stays unrun. Valid wrapper refusal is `valid-analysis`, distinct from `transport-failure`.

## Pins consumed

| Ref | SHA | Use |
| --- | --- | --- |
| Co06 export | `f76235f32c5fe19d22f381c4b0eaab82962a56b7` | starting dossier |
| F08 capture | `bae3e7cd5034b21019fb272a99d88db964b831ee` | fixture receipts; verified worktree |
| SDS52 | `aeef964fa188443078958d9d6d393afae1d542ee` | current wrapper schema/CLI; not copied |
| SDS main | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | claimed, evidence null |

F08_SHA and SDS52_SHA are unlike; not forced equal.

## Tests

```bash
npm install
node --test --test-concurrency=1 tools/failed-delivery-dossier/test/*.test.mjs
```

**PASS — 24 tests, 0 fail, 0 skipped.**

Also: `node --test server/scripts/test-checkout-http-lifecycle.js` (1 pass).

## Class labels

| Class | What |
| --- | --- |
| fixture | Copied F08 CLI receipt, stop.json, reconstructed checkout verify, catalog 402 expectation |
| local-runtime | checkout POST `/api/checkout/verify` 127.0.0.1; local GET 402 server; SDS52 CLI sample refusal |
| expected | catalog/claimed 402 without capture |
| unrun | live extract, postgres, pin checks until `--verify-pins` |
| external | Live extract / Stripe — not run |

## Next integration owner

W5-D01. Remaining binding: wrapper amendments after SDS52 `aeef964fa`. Do not import `wrapper.mjs`.
