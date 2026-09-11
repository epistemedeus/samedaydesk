# W5-D16 RECEIPT

**Date:** 11 September 2026
**Slot:** W5-D16
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d16-engine-lifecycle-failure-harness-for-install-start-timeout-exit-json-boundaries-4d24`
**Head:** filled at commit time
**Base / pinned implementation:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52 `fable/f08-paid-wrappers`)
**Owned paths:** `experiments/wave5/d16/`
**Integration owner:** W5-D01
**Contract:** `samedaydesk.wave5.d16.engine-lifecycle.v1`

## What

Process harness around the current PR52 wrapper and `runEngineJob`. It does not vendor useful-jobs or a second runner. Positive engine success is a real wrapper CLI run. Broken install/start/timeout/exit/JSON cases cannot be accepted as lifecycle success even if the wrapper returns `ok: true`.

## Commands

```bash
cd experiments/wave5/d16
node --test --test-timeout=120000 test/*.test.mjs
node bin/lifecycle-harness.mjs test
```

**PASS** — `node --test` 22/22, 0 fail, 0 skip. `lifecycle-harness.mjs test` exit 0, 15/15 cases, `ok: true`. Node v22.14.0. No skipped gates.

## Current-source findings at aeef964

Reproduced against `server/paid-useful-jobs/lib/{wrapper,engine}.mjs`, not against a copy.

| Prediction | Observed | Lifecycle kind |
| --- | --- | --- |
| Positive supplied-input engine | Wrapper CLI `vendor-budget-impact` exit 0, `ok: true`, 2 outputs, `sold: false`, domain `actionable` | `engine-ran` accepted |
| `ensureUsefulJobsKit` before the try block | Cache path as a file: uncaught `EEXIST` mkdir, no success JSON | `engine-install-failure` |
| Engine `status !== 0` | Exit 7 → `ok: false`, `code: engine-refused` | `engine-nonzero-exit` |
| Missing JSON | Empty stdout exit 0 → wrapper `ok: false` | `engine-missing-json` |
| Invalid JSON | `not-json` exit 0 → wrapper `ok: false` | `engine-invalid-json` |
| `ok === false` | Structured refuse, wrapper keeps `code: missing-required-inputs` | `engine-refused-json` |
| `parseEngineJson` slice | `noise { "ok": true, "decoy": true } trailing` → wrapper `ok: true`, 0 outputs | `engine-invalid-json`, `hiddenByWrapperSuccess: true` |
| Stub `{ok:true}` no files | Wrapper CLI exit 0, `ok: true`, 0 outputs | `broken-engine-hidden-by-wrapper-success` |
| CLI path is a directory | `Cannot find module`, wrapper `ok: false` | `engine-start-failure` |
| `runEngineJob` timeout | Direct hang: `status: null` in ~500ms. `error`/`signal` are not returned | `engine-timeout` |
| Grandchild after timeout | App CLI still running after useful-jobs is killed. Harness kills the pid file | `engine-timeout` (orphan observed) |
| Deleted extracted CLI | Archive re-extracts; run succeeds | `engine-ran` (missing extract is not lasting while the archive exists) |
| `status: refused` is not a product crash | Copied `samples/evidence/refused.json` (not a kit path): wrapper `ok: true`, engine `ok: true`, `status: refused`, 2 outputs | `engine-ran`, `domainOutcome: refused` |

stderr-only JSON is wrapper `ok: false` (classified `engine-nonzero-exit` because stdout is empty and status is 2). Not success.

## Remaining D01 binding

Do not treat this harness as a future D01 wrapper. Tested behavior is PR52 `aeef964` as it exists now.

1. Catch kit acquisition inside `runPaidOffer` and return a structured rejection.
2. Success predicate is `engine.json.ok === true`, not `ok !== false`.
3. Parse engine stdout as a whole JSON document. A sliced object inside noise is not success.
4. Surface `error.code` and `signal` from `runEngineJob`.
5. On timeout, kill the useful-jobs child and the app grandchild. `spawnSync` timeout currently leaves the app CLI.
6. Do not set wrapper `ok: true` when required output files are missing. D03 owns completeness identity. D16 only requires a broken engine not to be hidden.

D17 owns whether a domain `refused` report is useful delivery. This slot only proves it is not an install/start/timeout/exit failure.

## Limits

- No Postgres, HTTP server, or live settlement. None of the claims depend on them.
- Wrapper `runPaidOffer` does not take `timeoutMs` (engine default 120s). Timeout cases use `runEngineJob({timeoutMs:500})` and an outer wrapper-CLI `spawnSync` timeout of 800ms.
- Terms hashes are not compared.
- No homepage, live price, or root `package.json` change.

## pstack

Read installed skills from plugin cache `9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8` (`setup-pstack`, `principle-prove-it-works`, `tdd`, `principle-test-behavior-not-implementation`, `blast-radius`, `principle-boundary-discipline`, `figure-it-out`, `how`, `principle-fix-root-causes`, `unslop`). No `~/.cursor/rules/pstack-models.mdc`. No Task/Cloud children (Root counts the cohort). No literal `/swarm` invocation. Model: Cursor Grok 4.6 xhigh as assigned.
