---
name: verify-sds
description: Cold-clone SameDayDesk lab verifier. Run doctor, then three unpaid offline jobs (useful-jobs 1.4.7, packs, MCP inventory) and reject stale receipts. Use when proving SDS lab jobs, running /verify-sds, or checking useful-jobs/packs/MCP without paying.
---

# verify-sds

From a cold clone of `epistemedeus/samedaydesk`, pin Node **22.x** and run `node tools/verify-sds/cli.mjs`. JSON always goes to stdout; human status to stderr. `--dry-run` does not extract, spawn, hash archives, pay, or call MCP tools.

Do not start the Express host. Do not POST Stripe, x402, or `PAYMENT-SIGNATURE`. Do not POST MCP `tools/call` (`boundary.toolsCalled` stays false). Pins live in `lib/pins.mjs`. Current useful-jobs is **1.4.7**; **1.1.0** is a negative control, not current.

## Launch

```bash
node --version                              # must be v22.x
node tools/verify-sds/cli.mjs doctor --json
node tools/verify-sds/cli.mjs run --all --json
```

Ready when `doctor --json` exits 0 and `run --all --json` exits 0 with jobs `useful-jobs`, `packs`, `mcp`.

## Doctor

```bash
node tools/verify-sds/cli.mjs doctor --json
```

Pass means: Node major 22, package name `samedaydesk`, `engines.node` is `22.x`, `start` is `node server/index.js`, three jobs registered, useful-jobs **1.4.7** kit matches `lib/pins.mjs`, 1.1.0 negative control is present and different, pack discovery files exist, MCP inventory file exists. Doctor never dumps `.env`.

## Drive

| Intent | Command |
| --- | --- |
| List jobs | `node tools/verify-sds/cli.mjs jobs --json` |
| useful-jobs 1.4.7 | `node tools/verify-sds/cli.mjs run useful-jobs --json` |
| Packs | `node tools/verify-sds/cli.mjs run packs --json` |
| MCP inventory | `node tools/verify-sds/cli.mjs run mcp --json` |
| All three | `node tools/verify-sds/cli.mjs run --all --json` |
| Accept a receipt | `node tools/verify-sds/cli.mjs accept --output <receipt.json> --json` |
| Seeded stale | `node tools/verify-sds/cli.mjs --seeded-failure stale-output --json` |

`--clock ISO` pins the verifier clock. `--horizon-hours` defaults to 24. `--out <file>` writes a fresh receipt after a passing `run`. `--extract-dir` must be **outside** the git tree. `--keep` leaves the extract. `--live` and `--pay` are usage errors.

`run useful-jobs` hashes the committed kit, extracts outside the repo, and runs `bin/useful-jobs.mjs list --json`. Samples (`--example`) are not customer input. `run packs` hashes record-repeat, distribution-repair, and consumer-repeat kits, then runs in-tree `distribution-repair.mjs sample --positive`. `run mcp` imports `server/lib/mcp-tool-inventory.js` and requires the five shipped names; it never talks HTTP.

## Evidence

Envelopes match `schema.json` (`samedaydesk.lab-verify.envelope.v1`). Receipts match `samedaydesk.lab-verify.receipt.v1` and bind `clock`, current pin, `inputDigest`, and `resultDigest`.

Exit: `0` ok; `1` proof fail or stale receipt; `2` usage; `64` unexpected.

A receipt is **stale** when any of these hold: pin is not current 1.4.7 / pack sha / MCP names; `inputDigest` does not recompute from the tree; `clock` is older than the horizon. Seeded fixture `fixtures/seeded/stale-output.json` must exit 1 with `error.code` `STALE_OUTPUT` and message starting `stale_output: receipt is not current`.

`--dry-run` must not spawn tar, Node child CLIs, or MCP HTTP. Confirm `boundary.paymentSent=false` and `boundary.toolsCalled=false`.

## Cleanup

- Delete tmp extracts this run created unless `--keep`.
- Do not delete `tools/verify-sds/artifacts/`, kit tarballs, or fixtures.
- Do not kill unrelated `node` processes.

## Helpers

```bash
node tools/verify-sds/cli.mjs --help
node tools/verify-sds/cli.mjs doctor --json
node tools/verify-sds/cli.mjs --dry-run run --all --json
node tools/verify-sds/cli.mjs --fixture tools/verify-sds/fixtures/seeded/stale-output.json accept --json
node --test tools/verify-sds/test/*.test.mjs
```
