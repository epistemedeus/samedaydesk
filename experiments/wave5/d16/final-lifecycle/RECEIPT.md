# W5-D16 final-lifecycle RECEIPT

Independent final-input check of the real release candidate. Not a second kernel. Prior PR52 results remain in `../RECEIPT.md`.

**Date:** 12 September 2026  
**Slot:** W5-D16 final-input  
**Owned paths:** `experiments/wave5/d16/final-lifecycle/`  
**This branch head:** `5b44a8c39ceafdd548778b3a3b9d2e2dc21f9cd8`  
**Next owner:** W5-D01 (Root publishes after reconciliation)

## Exact source

| Surface | Pin |
| --- | --- |
| D01 PR74 | `epistemedeus/samedaydesk` `46f2b7f55a7fb780333073a5197b64b8fde64a33` |
| Public PR114 | `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` |
| Archive | `client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz` |
| Bytes / sha256 | `2579117` / `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` |
| Public CLI | `bin/useful-jobs.mjs` (ten jobs in catalog; this check runs four new + `vendor-budget-impact`) |
| D01 wrapper | `server/paid-useful-jobs` + `experiments/wave5/m01/lib/d01-adapter.mjs` |
| Worktree | read-only `/tmp/sds-d01-ro` (`SDS_D01_ROOT`) |

PR74 and PR114 archives are byte-identical. Kit extract is 1.2.0. D01 `lib/pins.mjs` still extracts **1.0.0** for original-six kit jobs; the four new engines run in-tree via `runEngineForD01`.

## Actual command

```bash
cd experiments/wave5/d16/final-lifecycle
SDS_D01_ROOT=/tmp/sds-d01-ro node --test --test-concurrency=1 --test-timeout=120000 test/*.test.mjs
# 11/11 pass, 0 fail, 0 skip. Node v22.14.0
node bin/final-lifecycle.mjs test
```

This package does not re-run `experiments/wave5/d16/test/*.test.mjs` or D01 `npm run test:paid-useful-jobs`.

## Verdict

Harness observation: **PASS** (facts below were executed on this Cloud VM against the pinned archive and D01 tree).

Release-candidate process/output truth: **FAIL** on three lifecycle gaps. Isolated success, cold reinstall, and HTTP identity are not those gaps.

### Observed PASS

| Check | Evidence |
| --- | --- |
| Isolated four new engines | `lockfile-pin-delta`, `json-schema-webhook-drift`, `route-table-diff`, `page-change-offline-job`: exit 0, whole-document `ok: true`, both promised files in this run's directory, `purchaseAuthority` not true |
| Original-six compat | `vendor-budget-impact` with D01 caller fixtures (not SAMPLE kit rows): exit 0, `ok: true`, `purchaseAuthority: false` |
| Unsupported lockfile v1 | exit 2, `code: unsupported-lockfile-version`, no `pin-delta.json`. Not a crash-hidden success |
| `page-change --example` | exit 2, stderr whole-document `code: sample_as_delivered_watch` (stdout empty). Documented refusal, not a lifecycle bug |
| Complete lockfile reuse of `--out-dir` | Overwrites both files; `generatedAt` is this run |
| Vendor-budget existing outputs | `lib/cli-runtime.mjs` sibling-diverts; stdout `outDir` is the sibling; requested dir still stale. CLI does not claim the stale dir |
| Cold reinstall | `tar -xzf` run lockfile; delete extract; second `tar -xzf`; second lockfile exit 0 with both files |
| D01 HTTP vs local CLI | `POST /execute` lockfile, HTTP 200, `sold: false`, `purchaseAuthority: false`, `contract: samedaydesk.paid-useful-jobs.execution.v1`. `runOutDir` ≠ caller `outDir`. Caller dir is a published copy of this run, not delivery identity. Loopback HTTP is not a live purchase |

### FAIL — minimal counterexamples

1. **Public 1.2.0 CLI nested hang orphan** (`bin/useful-jobs.mjs` has no `spawnSync` timeout; app CLI and engine bin are further `spawnSync` layers).
   - Replace `engines/lockfile-pin-delta/bin/lockfile-delta.mjs` with `fixtures/hang.mjs`.
   - `node bin/useful-jobs.mjs run lockfile-pin-delta --before … --after … --out-dir …` with outer timeout 800ms.
   - Observed: `ETIMEDOUT` / `SIGTERM` in ~801ms; hang pid still alive; `pgrep` of the isolate also showed the app CLI. Harness `SIGKILL` then left **zero** survivors.
   - D16 already saw two-level orphans on PR52 1.0.0. This is the same class on the shipped 1.2.0 three-level path.

2. **Lockfile partial write mixes generations.** Inject `fixtures/partial-crash.mjs` as the engine bin: writes `pin-delta.json` then `exit 1`, leaving previous `pin-delta.md`.
   - Exit 1, stdout is not `ok: true` (CLI does not claim success).
   - Disk: json is this run, md is `ORPHAN-MD-PREVIOUS-RUN`. D01 wrapper is not this bug: it writes an empty isolated `runOutDir` and publishes only when delivery is complete.

3. **`runEngineForD01` hardcodes `timedOut: false` and `signal: null`.** Hang via `W5_M01_ENGINE_ROOTS` + `timeoutMs: 600`.
   - `invokeEngine` `spawnSync` timeout does kill the engine (~604ms, `status: null`, pid not alive after return).
   - Adapter still returns `timedOut: false`. `classifyTransport({ engine, timeout: engine.timedOut })` is `engine-crash`, not `timeout`.

## Limits

- No purchases, customer files, production load, email, merge/deploy, overage/reset, or new Cloud agents.
- Not a ten-job benchmark. Root already smoked ten-job positive/refusal outside checkout. Sol owns four-core semantics.
- Correct unsupported/unknown is not scored as a bug.

## Next owner

W5-D01: surface M01 timeout as `timedOut: true`; kill public-CLI nested children on timeout if that CLI remains a paid execution path; do not treat mixed lockfile files in a reused `--out-dir` as this run. Root publishes after reconciliation. This slot does not.
