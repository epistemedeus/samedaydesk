# Feature map — interrupted-output atomicity and portability

| Field | Value |
| --- | --- |
| User goal | A mailbox/archive consumer can tell a complete receipt-bound useful-job package from leftover partial files, including after copy to a new root. |
| Entrypoint | `tools/job-output-atomicity/` (`lib/verify.mjs`, `bin/verify-complete.mjs`) |
| Command | `node tools/job-output-atomicity/bin/verify-complete.mjs --root <dir>` |
| State | `complete` / `partial` / `unknown`. Never treats missing receipt or truncated JSON as complete. `sold` remains false. |
| Tests | `node --test tools/job-output-atomicity/test/*.test.mjs` |
| Account prerequisite | None. Offline wrapper + local disk. Optional loopback HTTP. No wallet, facilitator, or live settle. |
| Producer | Injected F08 CLI from worktree `aeef964` (`fable/f08-paid-wrappers`). I02 owns producer amendments. |
| Hash identity | I01 Neo PR54 `hashTermsVersion` (`sha256:` + 64 hex), vendored hasher only, not the earned-work kernel. |

## Caller journey

1. Spawn pinned `paid-useful-jobs` `run vendor-budget-impact` with caller files into an isolated `--out-dir`.
2. `verify-complete --root <that dir>` → `complete`.
3. Copy the directory to a new root (or fetch it over loopback HTTP).
4. `verify-complete --root <new dir>` → `complete` (absolute producer paths are rebound by basename).
5. Interrupt the wrapper around receipt publication, or drop/truncate/mutate files → `verify-complete` refuses.

## Later integration bindings

| Binding | Owner |
| --- | --- |
| F08 atomic publish (temp dir + rename, no absolute `outDir` in receipt) | I02 |
| Live `@neomorphic/funded-task-terms` package import instead of vendored hasher | Root / Neo I01 |
| Hosted mailbox HTTP and Postgres-backed archive index | Root |
