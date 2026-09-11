# Feature map — W4-commerce-05 job input preflight

| Field | Value |
| --- | --- |
| User goal | Check caller files against the useful-jobs catalog before any engine run: required flags, 8 MiB cap, sha256/bytes, `--input-root` confinement. |
| Entrypoint | `tools/job-input-preflight/` (`bin/preflight.mjs`, `lib/preflight.mjs`) |
| Command | `node tools/job-input-preflight/bin/preflight.mjs vendor-budget-impact --before vendor-budget-impact/before.json --after vendor-budget-impact/after.json --input-root tools/job-input-preflight/fixtures` |
| State | `ok: true` with per-file `digest` (`sha256:` + 64 hex) and `bytes`; refusals exit 2. `engineInvoked` is always false. `purchaseAuthority` / spend / tool-cost claims are always false. |
| Tests | `node --test --test-concurrency=1 tools/job-input-preflight/test/*.test.mjs` |
| Account prerequisite | None. Offline Node 22. No wallet, facilitator, Postgres, or live SDS HTTP. |

## Test map

| Class | What | Command / evidence |
| --- | --- | --- |
| Journey | Two valid vendor-budget-impact JSON files; `ok: true`; no `budget-impact` / `upgrade-brief` written | `test/journey.test.mjs` |
| Seeded refuse | Missing `--after` | `missing-required-inputs` |
| Seeded refuse | Path / symlink escapes `--input-root` | `input-path-escapes-root` |
| Seeded refuse | File > 8 MiB | `input-too-large` (kit cap, not F08 1 MiB) |
| Seeded refuse | Declared `digest` does not match bytes | `input-digest-mismatch` |
| Seeded refuse | Integer digest (original F01 `termsVersion` style) | `invalid-digest` (I01 `sha256:` form) |
| Local-runtime | Real `catalog.json` + archive sha/bytes; extract kit and `node --eval` `MAX_LOCAL_INPUT_BYTES` | `test/kit-alignment.test.mjs` |
| Local HTTP | Serve the real catalog on `127.0.0.1` | same file, async spawn |
| Fixture | Labeled SAMPLE copies of kit `samples/pricing/a` | `fixtures/vendor-budget-impact/` |
| External | Not claimed | No live samedaydesk.com or payment |

## Later integration (Root)

Injected `null-not-invoked` engine adapter. After `ok: true`, Root may bind `node bin/useful-jobs.mjs run <job>` or F08 `server/paid-useful-jobs/` (do not edit F08 from this package). I01 hash-terms identity is `sha256:` + 64 hex; do not cherry-pick original F01 integer `termsVersion`.
