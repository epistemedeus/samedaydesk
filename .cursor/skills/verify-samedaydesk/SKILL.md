---
name: verify-samedaydesk
description: Drive samedaydesk the way a user or agent would — doctor, host build, npm start → node server/index.js, /mcp five tools, useful-jobs 1.4.7 cold acquire, and unpaid x402 pages — and capture JSON evidence. Use when proving useful-jobs, apex MCP, or x402 pages against the real host artifact, or when running /verify-samedaydesk.
---

# Verify samedaydesk

Cold-clone this repo, pin Node **22.x**, and prove the **host** artifact. The driver is `node tools/verify/cli.mjs`. JSON always goes to stdout (one envelope); human status to stderr. `--dry-run` prints planned argv and does not spawn, pay, or call MCP tools.

Do not treat router-only `test:mcp` as shipped-process proof. Host build is `npm run build` (`test:hosted-startup` + client `tsc -b && vite build`). Start path is `npm start` → `node server/index.js`. Never POST Stripe, x402 payment, or `PAYMENT-SIGNATURE`. Live `https://agents.samedaydesk.com/mcp` stays Pilot `tools/ops/verify-samedaydesk-mcp.mjs` (`boundary.toolsCalled:false`); cite it, do not fork a second platform. Apex hcdn 403 is `cdn_challenge`, not product 200.

Feature recipes live in [features/README.md](features/README.md). Update the matching feature file in the same PR as the product change.

## Launch

From the repo root on Node 22.x:

```bash
node --version                          # must be v22.x
npm ci                                  # root Express host
node tools/verify/cli.mjs doctor --json
node tools/verify/cli.mjs build --json  # npm run build = test:hosted-startup + client tsc -b && vite build
node tools/verify/cli.mjs serve start --json
# ready: GET /api/health → {service:"samedaydesk"}
```

Ready when `doctor --json` exits 0 and `/api/health` answers `{service:"samedaydesk"}` from shipped `server/index.js`. Optional one-shot:

```bash
node tools/verify/cli.mjs serve once --json
# teardown: node tools/verify/cli.mjs serve stop --json
```

`--dry-run serve` prints `node server/index.js` / `npm start` and does not listen. Never `pkill` by process name.

## Doctor

Run first, and again after a failed drive:

```bash
node tools/verify/cli.mjs doctor --json
```

Pass means: Node major 22, root `engines.node` is `22.x`, package name `samedaydesk`, `start` is `node server/index.js`, `build` includes `test:hosted-startup`, useful-jobs **1.4.7** kit sha `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` / **5255824** bytes (kit twin of the for-agents archive), and **1.1.0** remains as negative control. Doctor never dumps `.env`.

## Drive

Always `--json` for agents. Prefer `--dry-run` before anything that would spawn a host or MCP process.

| Intent | Command |
| --- | --- |
| Host build | `node tools/verify/cli.mjs build --json` |
| Start path | `node tools/verify/cli.mjs serve start --json` (or `serve once`) |
| Public + protocol routes | `node tools/verify/cli.mjs routes --json` |
| GET local health | `node tools/verify/cli.mjs fetch --path /api/health --json` |
| Unpaid gateway | `node tools/verify/cli.mjs fetch --target gateway-unpaid --json` |
| Apex TLS | `node tools/verify/cli.mjs fetch --target apex --path /mcp --json` (403 → `cdn_challenge`) |
| OpenAPI fixture vs live | `node tools/verify/cli.mjs openapi check --json` (`--live` reports drift) |
| useful-jobs 1.4.7 acquire | `node tools/verify/cli.mjs archive acquire --json` (dest **outside** the repo) |
| 1.1.0 negative control | `node tools/verify/cli.mjs archive negative-control --json` |
| Pack CLI | `node tools/verify/cli.mjs pack run useful-jobs --json` |
| Apex MCP list | `node tools/verify/cli.mjs mcp tools/list --json` |
| Cite Pilot live MCP | `node tools/verify/cli.mjs mcp cite-pilot --json` |
| for-agents fixture read | `node tools/verify/cli.mjs presence cold-read --json` |
| Mapped feature | `node tools/verify/cli.mjs prove --feature apex-mcp --json` (hosted-readback keeps the host up for fetch) |
| Seeded fail | `node tools/verify/cli.mjs --seeded-failure sha-mismatch --json` |

`mcp tools/list` spawns shipped `server/index.js` (or reuses `serve start`) and POSTs `initialize` then `tools/list` **before** any `tools/call`. This verifier never calls tools (`boundary.toolsCalled` stays false). `mcp tools/call` is usage. Five apex tools: `check_ai_readiness`, `generate_complete_fix_pack`, `plan_taskmarket_delegation`, `browse_taskmarket_tasks`, `track_taskmarket_task`. Paid Fix Pack needs Stripe `cs_` — do not buy.

Gateway MCP is a **different** host (`x402-url-extractor`). Cite Pilot `tools/ops/verify-samedaydesk-mcp.mjs`; do not reimplement it.

## Evidence

Envelopes match `tools/verify/schema.json`:

```json
{"ok":true,"schemaVersion":1,"command":"doctor","repo":"samedaydesk","checkedAt":"ISO","node":{"wanted":"22.x","actual":"v22.23.2"},"dryRun":false,"status":"pass","feature":null,"evidence":[],"error":null,"boundary":{"paymentSent":false,"toolsCalled":false}}
```

Exit: `0` ok; `1` proof fail or verifier-fed seed; `2` usage; `64` unexpected. Product correctly refusing bad input is a mapped feature that exits 0 only with `--expect-product-reject` after observing the child refuse. Feeding the seed to the verifier (`--seeded-failure` or `--fixture`) is exit 1.

`obtain-archive.mjs` currently `process.exit(0)` on `ok:false`. The verifier **must remap** that to nonzero. SHA mismatch is the canonical seed.

Proof standards:

- Replay the advertised consumer command (`npm run build`, `node server/index.js`, `bin/useful-jobs.mjs list`, shipped `/mcp`).
- Quote HTTP status and `content-type` for `/api/health` and unpaid `/extract` 402.
- Capture action plus resulting state (`evidence[]`, child exit, body preview).
- Side effects: `client/dist/index.html` after build; five MCP names after `tools/list`; archive dest outside the git tree.
- `--dry-run` must not spawn npm, HTTP, or MCP. Confirm by absence of listen and `boundary.toolsCalled=false`.

Write optional transcripts under `tools/verify/artifacts/` (gitignored via `tools/verify/.gitignore`). Cleanup must not delete that directory.

## Cleanup

- Stop servers this run started (`serve stop`, or the ephemeral listener `serve once` / `mcp tools/list` already closes).
- Leave `/tmp/sds-uj-*` extracts unless the caller asked to keep them.
- Do not delete `tools/verify/artifacts/`, `client/dist/`, kit tarballs, or fixture files.
- Do not kill unrelated `node` processes.

## Helpers

```bash
node tools/verify/cli.mjs --help
node tools/verify/cli.mjs doctor --json
node tools/verify/cli.mjs build --json --skip-ci    # skip npm ci when node_modules already exists
node tools/verify/cli.mjs --dry-run fetch --path /api/health --origin http://127.0.0.1:3000
node tools/verify/cli.mjs --fixture tools/verify/fixtures/seeded/sha-mismatch.json --json
node --test tools/verify/*.test.mjs
```

`npm run verify` is an alias for the CLI. Seeded pointers: `tools/verify/fixtures/seeded/`. Schema: `tools/verify/schema.json`.
