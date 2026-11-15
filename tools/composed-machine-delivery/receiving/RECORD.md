# Composed machine delivery receiving

Private record for the integration writer. This file is excluded from the customer archive.

## Identity

- Admission host: h10
- Hostname: cursor
- Boot id: 8356954c-bf56-4fe8-a256-d104c1c7c2ea
- Session: d5661425-9fd0-41e8-9503-3a1fea34a944
- Amend run: ae14-nov06-sds-compose-amend3-20261106T163735Z
- Previous export: 7398afde20d8c71c7aedf9a3b410347cbda6b99e
- Earlier export: 4441546478d4eac3ffd80b6e0ecf21a3ad7f9463
- Catalog model declared by admission: grok-4.7
- Effort: xhigh
- Commit identity recorded on this amendment: epistemedeus / 124947147+epistemedeus@users.noreply.github.com
- GitHub login used by gh: epistemedeus
- Integration owner declared by the continuation: Lead ade90474-1dc2-4ca8-b524-21eaeb1a1fbc
- Writer: codex/n7-sds-composed-delivery-20261106
- Worktree: /home/ubuntu/ae14-work/nov06-sds-compose
- Qualified base: c60641e8ff2b94dd704307e57f5b6fe789ba0df7
- Composition parents: c60641e8ff2b94dd704307e57f5b6fe789ba0df7, 7a606b73cdc036947281182142c61f5c77fa6db8, afab23058970e88d49cbf5988fb39ef81230c0db, d413cc95d29056db80da478291d0a765a34c0556, 21fadd907c0b100905c882c9c5734e601a225c7a
- MCP and pin-refresh commit, retained: 575c850b2e01c58438686b28542f0b965d28728c
- Previous record commit, retained: 7398afde20d8c71c7aedf9a3b410347cbda6b99e
- PR base read back before the previous export: codex/h136010-machine-release-20261103 at c60641e8ff2b94dd704307e57f5b6fe789ba0df7
- Node: 22.23.4
- Official MCP client exercised by the stdio conformance test: @modelcontextprotocol/client 2.4.0

## What was composed

One retained permitted capture feeds the existing recurring decision consumer. A fitting page-change input can select the existing native workflow extension. When a decision is a useful change and the caller supplies unchanged 500 bps `new_job_gross` terms, the existing two-sided consumer posts, claims, delivers, and accepts. Walletless repeat use stays on its own command. The representative capture is a field snapshot, so the composed receipt does not pretend it is a verification result.

Public stdout and `examples/retained-output.json` omit `2000000`, `100000`, `1900000`, `earnedDebtAtomic`, and `feeBps`. The caller store keeps the private quote: platform fee `100000`, contributor net `1900000`, `thisQuoteFeeIsExactFivePercent` true, earned debt `21`.

## Corrections kept from the previous export

- MCP stdio. The 2026-07-28 transports page defines stdio as newline-delimited JSON-RPC. The linked stdio binding says one JSON-RPC message per line, logs on stderr, and stdin EOF as shutdown. The TypeScript SDK serving guide has the host parse each stdout line. `runtime/mcp-stdio.mjs` and the workflow caller write one JSON object per line. Legacy clients use `initialize` for `2024-10-07` through `2025-11-25`, then `notifications/initialized`, `tools/list`, and `tools/call`. A `2026-07-28` client uses `server/discover` and per-request `_meta`. An unsupported modern version returns `-32022`. A non-JSON line returns `-32700` and exits non-zero. Empty stdin exits 0 with empty stdout. The conformance test imports `@modelcontextprotocol/client` 2.4.0 and drives a separate `StdioClientTransport`: legacy initialize/list/call, and a pinned `2026-07-28` discover/list/call, including a fitting page-change call and a non-fitting chat call. Fragmented and coalesced writes are answered before EOF.
- The earlier caller-pin refresh remains in Git at `575c850b2e01c58438686b28542f0b965d28728c` and `7398afde20d8c71c7aedf9a3b410347cbda6b99e`. It appended one uninstalled candidate closure and is not rewritten.

## Isolation in this amendment

Runtime startup run 42246667573 on `7398afde20d8c71c7aedf9a3b410347cbda6b99e` failed in the H145/H147 source-bound acquisition step. Live `hostSourceSha256` was `662cae8e29890dcd4fd7f990bf68ed672af24d8960a1571a6594a94fe513a12c`. The committed proposal still requires `7a8cc6b0c2e55dffda9dcbc4664c39e2e9042de4de0d2f658d2be0196d48de23`. Those tests were not edited and the new digest was not written into them.

Compared with `c60641e8ff2b94dd704307e57f5b6fe789ba0df7`, the only production-root and server changes on that export were `package.json` (one `test:composed-machine-delivery` script) and `server/foundry/activation/private-control-pin.json` (the matching package hash, plus one closure). Root lock, server code, and `.github` had no other changes. The pin binds 1323 files, none under `tools/`.

This amendment restores those two files to their exact `c60641e8ff2b94dd704307e57f5b6fe789ba0df7` bytes. The restored pin has the same 36 received caller closures and base `4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134`. Measured source stays `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`. Measured host returns to `7a8cc6b0c2e55dffda9dcbc4664c39e2e9042de4de0d2f658d2be0196d48de23`.

The retired closure stays in the previous commits: base `4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134`, source pin `02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15`, closure digest `sha256:964ccc9d7603964b45acb45a90327c8bedd91ff4e6dde2be9940f089e4d3242b`.

The check now belongs to this package:

```text
npm test --prefix tools/composed-machine-delivery
node --test --test-concurrency=1 tools/composed-machine-delivery/test/*.test.mjs
```

## Preserved findings

- 380 actor labels. `independentReuse` comes from the portable import verdict. Control `label-not-reuse` stays false when permission is absent.
- 382 proof replay. Replay requires the same subject and sequence and leaves the stored proof in place on conflict.

## Commands and exits

Committed tree `af390a13ea9d3661ff1b5a0f985b1b64ec106321`, serial, 2026-11-06T16:44:42Z through 2026-11-06T16:45:28Z. This record commit does not change those sources.

```text
node --test --test-concurrency=1 tools/task-repeat-use/test/*.test.mjs
EXIT 0, tests 13, pass 13, fail 0

node --test --test-concurrency=1 tools/workflow-owned-extensions/test/*.test.mjs
EXIT 0, tests 37, pass 37, fail 0

node --test --test-concurrency=1 tools/two-sided-work-consumer/test/*.test.mjs
EXIT 0, tests 17, pass 17, fail 0

node --test --test-concurrency=1 tools/recurring-decision-consumer/test/*.test.mjs
EXIT 0, tests 63, pass 63, fail 0

node --test --test-concurrency=1 tools/composed-machine-delivery/test/*.test.mjs
EXIT 0, tests 13, pass 13, fail 0

npm test --prefix tools/composed-machine-delivery
EXIT 0, tests 13, pass 13, fail 0

npm run test:proxy-addr
EXIT 0, tests 13, pass 13, fail 0

npm run test:hosted-startup
EXIT 0, tests 4, pass 4, fail 0

node --test server/scripts/test-correspondence-startup-diagnostic.js
EXIT 0, tests 7, pass 7, fail 0

npm run test:correspondence-mount
EXIT 0, tests 10, pass 9, fail 0, skipped 1
The skipped test requires CORRESPONDENCE_TEST_DATABASE_URL.

npm run test:machine-discovery
EXIT 0, tests 6, pass 5, fail 0, skipped 1
The skipped test needs an explicit client build.

node --test server/scripts/test-machine-guide-links.js
EXIT 0, tests 4, pass 4, fail 0

npm run test:agent-readiness
EXIT 0, tests 185, pass 185, fail 0

npm run test:l08-agent-repair
EXIT 0, tests 28, pass 28, fail 0

npm run test:mcp
EXIT 0, tests 46, pass 46, fail 0

node --test server/scripts/test-public-readiness-load-failure.js
EXIT 0, tests 1, pass 1, fail 0

npm run test:observatory
EXIT 0 on the committed source when NO_COLOR and FORCE_COLOR are not both set.
The session first saw tests 102, pass 99, fail 1, skipped 2. The one failure was
server/scripts/test-observatory-positioning.js expecting empty stderr while Node
warned that NO_COLOR is ignored because FORCE_COLOR is set. The same test then
passed alone with those variables unset. Two skips are the unconfigured historical
capture and OBSERVATORY_LIVE.
```

The composed file includes the cold extraction. From an empty directory the archive ran `deliver`, `show`, `recur`, `result-reuse preview`, `task-repeat-use walk --case fitting`, and `walk --case nonfitting-capture`. `npm test` in the package repeats that suite. The l08 repair command rewrote its own handoff files during the run. Those files were restored and are not part of this amendment.

Measured on this restored closure: source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`, host `7a8cc6b0c2e55dffda9dcbc4664c39e2e9042de4de0d2f658d2be0196d48de23`. That host is the value already required by `docs/receiving/h155030-sds-consumer-composition-20261106/proposed-anchor.json`. Every pin member matches its `c60641e8ff2b94dd704307e57f5b6fe789ba0df7` blob. No bound path differs. Every path that differs from that baseline is under `tools/`.

This machine has no `pg_config`. These Runtime startup steps are received from the GitHub workflow on the exported head: `server/scripts/test-postgres-bin.mjs`, the H145/H147 source-bound selection, the acquisition receive step, `npm run test:pulse`, and `npm run test:original-task`. The pull-request path filter does not select this head, because `package.json`, the caller pin, and the other production paths match the baseline. The workflow is dispatched on the exact head.

Human assets:

```text
git diff --exit-code c60641e8ff2b94dd704307e57f5b6fe789ba0df7 -- client/dist client/public client/src vendor/hosted-wallet-market/src/fee.mjs
EXIT 0
```

## Artifact

- Archive: `tools/composed-machine-delivery/dist/composed-machine-delivery.tar.gz` (367837 bytes, 422 members)
- Input: `tools/composed-machine-delivery/examples/changed-request.json`
- Output: `tools/composed-machine-delivery/examples/retained-output.json`
- Command: `node tools/composed-machine-delivery/cli.mjs deliver --request tools/composed-machine-delivery/examples/changed-request.json --store <dir> --out <public.json>`
- Package check: `npm test --prefix tools/composed-machine-delivery`
- Workflow conformance install: `npm ci --ignore-scripts --omit=dev --prefix tools/workflow-owned-extensions`

The archive omits this receiving directory, the dist directory, `node_modules`, and the package operator notes `TERMINAL.md`, `N7-RECEIVING.md`, and `whole-effort-receipt.json`.

## Limits

Local PostgreSQL client binaries are absent, so the workflow steps that call `pg_config` are not repeated on this machine. The correspondence suite skips its live database test unless `CORRESPONDENCE_TEST_DATABASE_URL` is set. Machine discovery skips the explicit client-build case. Observatory skips its live GETs unless `OBSERVATORY_LIVE=1`, and skips the optional historical capture. The H145 and H147 tests were not rewritten. Their expected host remains the restored measurement `7a8cc6b0c2e55dffda9dcbc4664c39e2e9042de4de0d2f658d2be0196d48de23`.

Root keeps release, public acquisition, and money authority. This writer does not merge to the default branch, publish human copy, install a host, create an account, or move a payment. Original jobs and earned obligations are unchanged. Ghost, Dify, and n8n installers stay unsupported. The composed command does not run walletless repeat use on the representative field snapshot.
