# ROOT-SOL-RETAINED-HOST-100501 — receiving receipt

Received PR273 at `0e491bc5307b32a40a1117752859b0ad45db5013`, base `e1d03aedbc6a5a65b8d38ed11e8a09e475171231`, on `codex/sol-retained-host-receive-100501`. Native gpt-6.1-sol, xhigh; October 5, 2026. Corrections and regressions are committed on this isolated branch for Root to receive. No PR, merge, deployment, Hostinger write, product database or retained-store access occurred.

No owning `AGENTS.md` was present in the repository or parent chain. `docs/FOUNDRY-HOST.md` was absent; the owning [FOUNDRY-HOST-RECEIVER.md](../../../../docs/FOUNDRY-HOST-RECEIVER.md), activation documents, changed runtime sources and their vendored execution/store/visitor dependencies were read. The entire vendored receiver and both lockfiles remain byte-identical to the received head.

**Result: disposable hosted contribution, publication, second visitor acquisition/execution after HTTP restart passed. Actual cloud-f activation remains HOLD.** [receipt.json](receipt.json) binds source hashes, original reproductions, exact runtime provenance, test names/counts, diagnostic output and the cold receipt.

## Reproduced and repaired

1. Materialization deadlocked on noisy stdout and waited indefinitely on a hanging interpreter; downloading allocated the full response before checking its ceiling. Both pipes now drain, setup/readiness/purelib children have deadlines and output budgets, and owned process groups are killed and direct children reaped. Downloads enforce 40 MiB/11 MiB ceilings during streaming, cancel on failure, and have a deadline. Readiness actually compiles and instantiates Wasmtime. Existing incomplete runtimes are refused; newly incomplete runtimes are removed.
2. The managed diagnostic hung with undrained stderr. It now uses bounded children, discards stderr, emits fixed failure codes, checks `/proc` identity access, and compiles/instantiates/executes a fixed no-import program with fuel and pre-exec OS limits. CLI failures exit 2; VM success retains `activation:false`, `wholeHostSandbox:false` and HOLD.
3. Different incoming JSON was silently reused, and a symlink to a disposable `public_html` directory caused chmod. Private inputs now use fd-anchored no-follow opens, exact modes, regular/single-link identity checks and bounded reads. JSON/key/CA replay must match. All payloads are validated first; injected partial-write failure removes only files this call created. Existing files and public paths are never chmodded or overwritten.
4. An unreadable optional CA globally broke product `pg.Pool`. The global patch is removed. Only the foundry URL gets a validated private CA and `sslrootcert`; configured CA requires `verify-full`, DNS, no host override, no weaker/conflicting TLS option and no global verification bypass. Disposable TLS PostgreSQL accepts the valid CA and rejects wrong CA and hostname mismatch. Official provider CA/actual-host validation remains Root's step.
5. The loader replaced an unrelated supervisor by URL substring and rewrote a changed, unrelated contracts module by regex. Removed the optional C embedding, loader and bootstrap; stale runtime selectors fail closed. Sealed reference PROFILE/`child.py`/`supervisor.mjs`/`contracts.mjs` are unchanged. There is one received profile, with actual changed-payload execution and mixed module/profile/runtime-pin rejection before spawn.
6. Inspected the received C source/binary against [Wasmtime's C API](https://docs.wasmtime.dev/c-api/wasmtime_8h.html). The binary matched its received PIN, but invocation did not enforce that PIN; the builder did not enforce the claimed C API archive hash, and integer/parser bounds were weaker than the reference. No C rebuild or acceptance claim is exported. Reference regressions cover raw pre-parse bounds, malformed WASM, all imports including WASI, fixed memory, fuel, invalid pointers/output, missing OS limits, cancellation, every phase deadline, and an apparent successful result whose process remains alive. Direct diagnostic PID and descendant liveness assertions passed.

## Commands and observations

Node `v22.14.0`, npm `10.9.7`, PostgreSQL `17.11`; owning root/client locks. All commands below exited **0**. Tests: **100 passed, 0 failed, 0 skipped**.

| Command | Passed |
| --- | ---: |
| `npm ci` | 165 packages installed |
| `npm run test:managed-node` | 41 |
| `npm run test:foundry-host` | 22 |
| `npm run test:foundry-activation` | 16 |
| `node server/foundry/activation/receiving-100501/replay.mjs correspondence` | 10 |
| `npm run test:hosted-startup` | 4 |
| `node --test --test-concurrency=1 server/scripts/test-foundry-entry-server.js server/scripts/test-foundry-claimed-sigterm.js server/scripts/test-foundry-drain.js` | 7 |
| `npm run foundry:runtime` | pinned reference materialized |
| `npm run build:managed-foundry` | client build/runtime/probe |
| `node server/foundry/activation/receiving-100501/replay.mjs managed-install` | named build + disposable inline-input installer |
| `npm run foundry:cold` | two visitors, restart, canonical DB readback, rollback |
| `git diff --check` / unchanged vendor and lockfile comparison | clean |

Both replay modes create and destroy their own PostgreSQL cluster. Standalone fallback used the actual pinned CPython archive (SHA256 `731af898886c5f821890dc901eca3c651cca8e51fa7308c159d12a1194aeac91`) and Wasmtime wheel (`94f0288f9e1c33924995a72bb769f4c4e2885002391589dd6992cdaa35d1990a`). Reference runtime pin on this VM: `sha256:acc6b6e98390fa0230fe133f27f466fdac7222622636f5b8ca7edf6c782d4db4`.

The cold journey retained the published contribution and used the official visitor CLI from distinct projects before/after HTTP restart. Useful-negative input returned `unsupported` through a fresh, bound `compile/instantiate/execute` observation with exit 0. Changed input outside exact admitted evidence was refused before invocation on both visits, with zero canonical invocation rows. Direct sealed invocation separately demonstrated changed input producing changed output. Disabled rollback retained tables/rows. Seven seeded false-green/product-reuse/secret/unbound-task negatives exited 2 as expected. No fixture result enables deployment.

## Actual-host boundary

The [official Hostinger control](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md) takes a package.json script **name**. Tested names: `build:managed-foundry` and explicit `build:managed-foundry-install`. Root owns actual cloud-f build/probe, official CA, authorized retained installation, safe environment readback, listener enablement and actual visitor restart evidence. No actual-host probe establishes missing Python. Cloud-d's pre-RUN refusal supplies no model/runtime evidence.

Use [individual hPanel key edits](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/); never replace the masked 16-key environment from the stale 15-key backup. Removed the unused full-replacement planner. Product auth/Pulse/payment links/Stripe/mail/human source pages are unchanged; existing build output was disposable and not deployed. One overly broad cleanup process listing included unrelated daemon authentication arguments in tool output; none were copied into repository artifacts, and subsequent checks were scoped.
