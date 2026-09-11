# RECEIPT — W4-commerce-05 job input preflight

**Repo:** epistemedeus/samedaydesk
**Branch:** `codex/w4-commerce-05-20260911`
**Pack HEAD:** `96e1027c4b6b06bf4778f2daaabbd53911c99fc4`
**Base / source head:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51)
**Owned path:** `tools/job-input-preflight/`
**Integration owner:** Root

## What

Public CLI preflights caller files against `useful-jobs.catalog.v1` `requiredInputs`. It reads size, sha256, and `--input-root` confinement. It does not run the useful-jobs engine, F08 wrappers, or any payment path. No spend, tool-cost, or pre-spend savings claims.

8 MiB cap is the extracted kit constant `MAX_LOCAL_INPUT_BYTES` from `lib/validate-next-run.mjs`, not F08's 1 MiB Express-aligned cap. Digest identity follows I01 (Neo PR54) `sha256:` + 64 hex. Bare 64-hex from validate-next-run `currentInputs.sha256` is accepted. Integer digest is rejected.

## Pins (read-only)

| Input | Location at `5b97d1b0` |
| --- | --- |
| Catalog | `client/public/for-agents/useful-jobs/catalog.json` |
| Archive | `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz` (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`) |
| Kit json | `client/src/data/usefulJobsKit.json` |

F08 `server/paid-useful-jobs/lib/input-guard.mjs` was read only and not copied. validate-next-run was not copied into this module; tests extract the archive and `node --eval` the exported cap.

## Caller journey

From the repository root (Node >= 22, no extra install):

```bash
node tools/job-input-preflight/bin/preflight.mjs vendor-budget-impact \
  --before vendor-budget-impact/before.json \
  --after vendor-budget-impact/after.json \
  --input-root tools/job-input-preflight/fixtures
```

Expect `ok: true`, `engineInvoked: false`, I01 `digest` fields, and no `budget-impact.json` / `upgrade-brief.json`. Optional `--out-dir` writes only `preflight.json`.

## Commands / counts

```bash
node --test --test-concurrency=1 tools/job-input-preflight/test/*.test.mjs
```

**PASS** — 16 tests, 0 fail, Node v22.14.0.

Dependencies: Node 22, `tar` (kit-alignment extract only), in-tree catalog + archive. No npm package added. Root `package.json` untouched.

## Seeded failures

| Attempt | Code |
| --- | --- |
| Missing `--after` | `missing-required-inputs` |
| `../outside.json` or symlink out of `--input-root` | `input-path-escapes-root` |
| File of 8 MiB + 1 | `input-too-large` |
| `--declared-inputs` digest `sha256:0{64}` / bytes `1` | `input-digest-mismatch` |
| `--before-digest 7` | `invalid-digest` |

A 1 MiB + 1 file is accepted (proves this is not F08's cap).

## Untested / not claimed

- Live samedaydesk.com catalog HTTP (local `127.0.0.1` used instead).
- Postgres: no local server on 5432/55432/55433; this package has no DB surface.
- F08 wrapper invocation after `ok: true` (later Root binding; adapter is `null-not-invoked`).
- Other catalog jobs' engines (`api-upgrade-brief` flags are parsed; journey is vendor-budget-impact).
- `--example` sample substitution (refused on purpose).
- External settlement, spend, or tool-cost (explicitly out of scope).

## Next integration owner

Root. Bind engine run only after `ok: true`. Do not merge this as a live paid offer. Do not edit F08 / homepages / `server/pricing.js` from this package.
