# W4-commerce-14 RECEIPT — Python useful-jobs client

**Date:** 11 September 2026
**Branch:** `codex/w4-commerce-14-20260911`
**HEAD:** `e8672bb8a5c38410b3f12771e5870566bebc131f`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-14-20260911

## What

MIT Python 3 client in `tools/python-useful-jobs-client/`. It reads the current
PR51 hash terms (sha256 **and** bytes), extracts the committed tarball to a temp
dir, binds catalog job ids, and runs `list` / `help` / `run` via subprocess
Node. No job-engine rewrite. No payment.

`--example` is labeled SAMPLE. `--sold` with `--example` refuses `sample-as-sale`.
Missing Node is `missing-node`, not a payment error.

## Source checked first

| Probe | Result |
| --- | --- |
| Input paths at `5b97d1b0` | discovery, `usefulJobsKit.json`, archive, catalog, S227 FIRST-USE all present |
| PR51 archive (committed) | 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, `purchaseAuthority: false` |
| Catalog job ids | six ids including `vendor-budget-impact`; required `--before --after`; outputs `budget-impact.{json,md}` |
| F08 | Node-only paid wrappers; not edited |
| I01 earned-work | not copied |

## Useful caller journey

```bash
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs run vendor-budget-impact --example
# copy kit samples/pricing/a to caller before.json / after.json, then run without --example
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs run vendor-budget-impact \
  --before ./before.json --after ./after.json --out-dir ./out/budget
```

Executed in tests: SAMPLE envelope (`label=SAMPLE`, `sold=false`),
`budget-impact.json` / `budget-impact.md` exist; caller copy from
`samples/pricing/a` writes the same outputs with `caller-input` (not SAMPLE-as-sale).
Local HTTP serving the committed bytes acquires (`source=origin-http`).

## Seeded failures

| Case | Result |
| --- | --- |
| same-size archive with flipped byte | `wrong-digest`, no extract |
| `--example --sold` | `sample-as-sale` |
| PATH without `node` | `missing-node` (not a payment error) |
| `--origin` serving same-size wrong bytes | `wrong-digest`, no extract |

## Tests

```bash
node --test --test-concurrency=1 tools/python-useful-jobs-client/test/*.test.mjs
```

**PASS — 10 tests, 0 fail** (`duration_ms` 2053). Worker: Python 3.12.3, Node v22.14.0.

Dependencies: Python 3, Node 22, committed PR51 tarball. No pip. No Postgres
(this client has no database). Local HTTP is used for `--origin` only.

## Honestly untested

- Live `https://samedaydesk.com` GET (F18 already proved live GET; this client
  uses the committed file plus local HTTP)
- Origin connection-refused / non-200 (mismatch and matching local HTTP are tested)
- F08 paid-wrapper integration
- Windows
- Python older than 3.12.3 on this worker

## Next integration owner

Root.

## Hard stops honored

No deploy, purchase, live payment, account change, or customer messages.
Homepage and SDS/EIN/Neo brands untouched. Root `package.json`,
`server/pricing.js`, F08/W2/W3/H directories not edited. Owned path only:
`tools/python-useful-jobs-client/`.
