# lockfile-pin-delta - caller guide

Compare two npm `package-lock.json` files (lockfileVersion 2 or 3) and emit
`pin-delta.json` plus `pin-delta.md`. Pin equality uses `name`, `version`,
`integrity`, and `resolved`. Does not run npm, audit, or purchase.

## Required inputs

| Flag | Meaning |
|------|---------|
| `--before` | Path to before package-lock.json |
| `--after` | Path to after package-lock.json |

Optional: `--out-dir <dir>`.

## `--example` vs caller files

`--example` uses the packaged journey fixture (labeled SAMPLE, not a customer).
Caller files: `samples/lockfile/h04-pub-lock-01/{before,after}.json` (H04 public mocha excerpt).

## Honesty

HTML, package.json-only, yarn/pnpm/bun, and SAMPLE-as-customer refuse (exit 2).
No network. `purchaseAuthority` is false.
