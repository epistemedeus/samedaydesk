# ROOT-SOL-RETAINED-PLATFORM-100502

Continued native session `01a10c36-95c6-7d81-ba6c-edd7587eb57f`, gpt-6.1-sol/xhigh, from SameDayDesk main `1132af16054e4639e57827c7e521e2a9ff9f052e` on `codex/sol-retained-platform-100502`. No owning AGENTS was present in the repository/parent chain. Read receiving-100501, managed activation documents, exact vendored execution/ports/verification sources and pins. Receiving-100501 artifacts, both lockfiles, PROFILE/CAPS/`contracts.mjs`/`child.py`, private-path/TLS/product-isolation code and client sources remain unchanged.

**Reproduced:** in a private mount namespace with system Python and `/usr/bin/prlimit` genuinely absent, fresh materialization returned `ok:true, action:cpython-standalone`; the previous probe then exited 2 with `referenceFailure:spawn_failed`. This matches Root's reported Hostinger build `01a10c80-7238-73f3-859a-2277f2a110bb`. Bundled child execution was available; the optional launcher executable was missing. The namespace neither removes parent binaries nor changes parent mounts.

**Repair:** the unchanged Wasmtime Python profile now uses explicit `vf08.python-setrlimit-exec.v1`. Its trusted bootstrap starts with `-I -S -B`, reads no stdin and imports no Wasmtime, sets and verifies both soft/hard limits, then execs the same installed Python into the unchanged worker. Exact reference ceilings remain AS 512 MiB, CPU 2 s, stack 8 MiB, file 1 MiB, FDs 32, core 0; artifact limits and Wasmtime fuel/memory/import/output bounds remain sealed. No external runtime executable or new dependency is required. Installer archive utilities remain available in the managed-build replay, matching the reported successful installation.

The supervisor explicitly owns a detached process group, kills it on cancellation/failure or direct-child exit, and waits for exit **and pipe close**. Unwitnessed exit or undrained pipes cannot admit completion. Receiver identity still commits before guest bytes; exec preserves that PID. `installation().pins.launcher` binds both adapter/bootstrap bytes; the supervisor hash and runtime/environment pins change. Old verification fails closed until explicitly renewed. [SOURCE-PIN.json](../../../../vendor/visitor-foundry-receiver/SOURCE-PIN.json) records the three local execution amendments and received/current hashes. No C guest engine, loader rewrite, profile rename or automatic policy migration was introduced.

The probe reports optional `python3`/`prlimit` separately from `installedPython`, `bundledPython`, launcher identity/stability, exact enforcement, PID preservation and reference execution. Fixed codes distinguish missing interpreter, resource/enforcement/exec failure, and incomplete execution; stderr/paths/environment values are not emitted. Success keeps HOLD, `activation:false`, `notProduction:true`, `wholeHostSandbox:false`. [Python resource](https://docs.python.org/3.12/library/resource.html) specifies soft/hard set/get behavior; [Python exec](https://docs.python.org/3.12/library/os.html#os.execv) preserves PID; [Linux getrlimit](https://man7.org/linux/man-pages/man2/getrlimit.2.html) specifies inheritance across exec. Kernel/stdlib availability still needs actual-host measurement.

Remote Cursor VM validation: **115 tests passed, 0 failed, 0 skipped; all commands below exited 0**. [receipt.json](receipt.json) binds source digests, tests/counts/exits, original reproduction, ordinary and bundled runtime provenance, three direct invocation witnesses, and the namespace build/restart receipt.

| Command | Passed / result |
| --- | --- |
| `npm ci` | owning root lock |
| `npm run test:managed-node` | 41 |
| `npm run test:managed-platform` | 15 |
| `npm run test:foundry-host` | 22 |
| `npm run test:foundry-activation` | 16 |
| `node server/foundry/activation/receiving-100501/replay.mjs correspondence` | 10; disposable PG |
| `npm run test:hosted-startup` | 4 |
| `node --test --test-concurrency=1 server/scripts/test-foundry-entry-server.js server/scripts/test-foundry-claimed-sigterm.js server/scripts/test-foundry-drain.js` | 7 |
| `npm run foundry:managed-probe` | ordinary installed interpreter + enforced launcher |
| `node server/foundry/activation/receiving-100502/replay.mjs build` | fresh bundled install + actual named `build:managed-foundry`, no system Python/prlimit |
| `node server/foundry/activation/receiving-100501/replay.mjs managed-install` | named build + disposable installer/replay |
| `npm run foundry:cold` | two visitors/restart, disposable PG |
| `node server/foundry/activation/receiving-100502/replay.mjs cold` | fresh bundled runtime, same two-visitor journey without optional utilities |

New regressions inspect OS limits at the first target instruction, test actual memory/file/FD refusal and CPU termination, lower inherited hard-limit refusal, missing/lying/failing resource calls, failed exec, bounded malformed arguments, cancellation with owned descendant termination/direct-child reaping, close-without-exit refusal, changed launcher pin rejection before spawn, and diagnostic failure secrecy. Original private-path, TLS, product-isolation and SIGTERM/drain negatives replayed. Useful, changed admitted input (`unknown`) and useful-negative (`unsupported`) execute with compile/instantiate/execute and fresh observations after restart; changed input outside admitted evidence is refused before invocation on both visits. Tables/rows survive disabled rollback. No real/product/retained DB or Hostinger access, broad process listing, human-page/payment change, PR or deployment occurred.

Root's remaining procedure: receive this exact head, select the package script name `build:managed-foundry` on cloud-f, and inspect the **actual-host** typed receipt. Optional utility absence may remain false; require installed/bundled interpreter, stable expected launcher hashes, exact limits, preserved PID, reference execution and no unsupported reasons. If enforcement is denied, keep HOLD and do not lower limits. Root then owns authorized retained installation/explicit old-evidence renewal, private file placement, safe individual environment-key edits/readback preserving all sixteen keys, listener opt-in, and actual visitor A publication followed by visitor B acquisition/execution after restart. Do not use the stale fifteen-key full-replacement PUT. VM success supplies no Hostinger activation proof.
