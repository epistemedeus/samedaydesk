# useful-jobs-cold (W0-X71)

SDS cold sha+bytes gate for useful-jobs **1.4.7**.

| Field | Value |
| --- | --- |
| version | `1.4.7` |
| sha256 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| bytes | `5255824` |
| sources | `client/public/kit/` or `client/public/for-agents/useful-jobs/` |
| dest | outside repo (tmpdir) |
| obtain | `experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs` |

## Commands

```bash
node tools/verify-sds/useful-jobs-cold/cli.mjs acquire --json
node tools/verify-sds/useful-jobs-cold/cli.mjs --seeded-failure wrong-sha --json
node tools/verify-sds/useful-jobs-cold/cli.mjs --seeded-failure wrong-bytes --json
node tools/verify-sds/useful-jobs-cold/cli.mjs run --json
node tools/verify-sds/useful-jobs-cold/run-harness.mjs
node --test tools/verify-sds/useful-jobs-cold/cli.test.mjs
```

## Boundaries

- Write only: `tools/verify-sds/useful-jobs-cold/**`
- Cite-only W0-B2 PR148 `tools/verify/**` (never edit)
- Never Stripe/x402 pay; never write catalog/public
- Never `--live` / `--live=true` (LIVE_REFUSE, fail-closed)
- Never `--stripe` / `--x402` / `--checkout` / `--payment` / `--neo` / `--publish`
- obtain-archive product exits 0 on refuse → verifier remaps to exit 1 (`SEED_REJECT`)
- dest/extractDir may not resolve (via symlink) into the checkout; sha+bytes are hashed on disk after copy
- Value flags do not swallow `--json`
- Unknown `--source` is USAGE (does not silent-default to kit)
- User `--dest` does not extract into `dirname(dest)` (no `/tmp/useful-jobs-1.4.7` dump); auto mkdtemp dest may extract in-dir; `--extract-dir` is explicit
- `--buy-now` / `--pay=now` / `--cdp` refuse (payment / live)
