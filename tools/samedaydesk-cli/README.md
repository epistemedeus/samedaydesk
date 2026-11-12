# samedaydesk CLI (0.1.0, source preview)

Agent CLI for SameDayDesk. Node 22.14+, ESM, no runtime dependencies beyond
files already in this repository:
`server/vendor/machine-gateway/bin/client-io.mjs` (transport, flag parser,
private files), `server/vendor/machine-gateway/src/util.mjs` (digest,
bounded JSON) and a byte-exact vendored `task-continuation` v1 (see
`vendor/task-continuation/SOURCE.json`).

Machine contract:

- stdout carries exactly one JSON envelope per run
  (`samedaydesk.cli.result.v1` or `samedaydesk.cli.error.v1`), or JSONL
  records (`samedaydesk.cli.stream.v1`) ending in a `type: "end"` record.
- stderr carries one `samedaydesk.cli.diagnostic.v1` line on failure.
- Exit codes: 0 ok, 1 input, 2 transport, 3 auth, 4 origin, 5 not found,
  6 conflict, 7 funding (reserved), 8 unavailable, 9 retryable,
  10 unknown mutation outcome, 11 pending, 12 batch partial, 13 batch all
  failed, 14 stdout closed, 15 remote execution failed, 130 cancelled.
- No prompts. Secret-named flags are refused. A tenant credential is read
  only from an existing 0600 `--credential-file` or the first line of stdin
  (`--credential-stdin`), is bound to the run's origin and the gateway path,
  and is never printed, logged or sent across origins or redirects.

Start here:

```sh
samedaydesk help
samedaydesk schema readiness.check
samedaydesk capabilities
samedaydesk readiness check --host example.com --out "$PWD/readiness.json"
samedaydesk result show --file "$PWD/readiness.json"
```

`readiness check` is the same operation as the MCP tool
`check_agent_readiness` and `GET /agent-readiness?format=json`. GET requests
retry at most three times with 200 ms and 400 ms backoff. POST requests
(`gateway test`, `gateway quote`) are never retried; pass `--recovery-file ABS`
to persist the attempt identity before sending. `--dry-run` is a local preview
(nothing sent). `gateway quote` is a server quote (`kind: "remote_quote"`, not a local preview).
Without a credential it is anonymous, never executable and not a reservation.
With a tenant credential it is tenant-bound by the server for 60 seconds.

Configured tenant (operator-enrolled credential, free routes):

```sh
samedaydesk gateway execute --route lockfile.delta --input-file in.json \
  --state-file "$PWD/task.state.json" --credential-file "$HOME/.config/tenant.credential"
samedaydesk gateway result --state-file "$PWD/task.state.json" --credential-file ...
samedaydesk gateway resume --state-file "$PWD/task.state.json" --credential-file ...
```

The state file is the direct client's caller-state v1 (`bin/caller.mjs`), so
either client can resume the other's task. It holds the quote, exact input and
idempotency key before execution. `resume` reads back by receipt id, or
resends the identical request with the same key; the gateway answers that from
its stored receipt. A paid route stops before execution
(`paid_route_requires_payment_authority`, exit 7): this CLI never pays or signs.

Batch reads: `samedaydesk batch run --input-file items.jsonl --state-dir /abs/dir`
runs the supported read and readiness operations (`samedaydesk schema
batch.run` lists them) with bounded concurrency and input caps. stdout is
JSONL only: a `start` record, one `item` record per input line and a
`summary`. Per-item state is written (0600) before each dispatch; rerun with
the same `--state-dir` to skip completed items. Changed terms for an existing
item id are refused, and archived results are never overwritten.

Generated references (bash, zsh and fish completion, man page, SKILL.md) live in
`generated/` and come from the manifest: `npm run generate`, checked by tests.

Tests: `npm test` in this directory (node:test, injected fetch, no network).

Clean-directory package: `npm run pack:clean -- /abs/out` stages the package with
the exact machine-gateway client closure (hashes in
`vendor/machine-gateway/CLOSURE.json`) and runs `npm pack`.

Market pagination: HTTP 400 on a request that carried a cursor is
`cursor_refused` (exit 1, not retried). Restart without `--cursor`.

## Root VM journey

`npm run journey:vm` (or `node scripts/vm-journey.mjs [--no-live] [--origin URL] [--keep]`) runs one installed journey from a checkout: pack, cold offline install into an empty prefix and cache, then only the installed binary for version and commands, the first credential-free task (`readiness check`, a free live GET), a batch of public reads, the configured-tenant journey against the inert authority port (server quote, execute, verified result and acceptance, a lost committed response recovered by `gateway resume` in a fresh process with the authority commit count unchanged, a tenant batch of receipts ending partial with exit 12, and the paid-route handoff refusal), a check that the credential never appears in output, and the coverage map. It prints one `samedaydesk.cli.vm-journey.v1` JSONL record per step and a summary, and exits 1 if any step fails. The real MachineGateway contract test runs when `ajv` resolves from `server/vendor/machine-gateway` (after `npm ci` there) and is reported as skipped otherwise. Tenant steps prove client behavior against a contract port with no provider and no money; they are not evidence of live funded execution.

`npm ci` in this directory is a no-op: the package has no dependencies, and `package-lock.json` records that so `npm ci` exits 0 like the rest of the repository.

The capability-compat provider pack is pinned in `vendor/packs/PACKS.json` (sha256 `66158687088ae9347a61b2b97ace25267d65e2d673d1827bf768896bc7f61f41`, not committed). `test/capability-compat.install.test.mjs` skips without `SAMEDAYDESK_CLI_COMPAT_TGZ=<absolute path>`. With it, the pin, tamper refusal and schema hash run dependency-free. `SAMEDAYDESK_CLI_COMPAT_INSTALL=1` adds the temp-dir install and `describeCapabilities` calls (VM or disposable host only), and `SAMEDAYDESK_CLI_COMPAT_ENDPOINT=http://127.0.0.1:PORT/mcp/page-change` adds the useful preview, env change, wrong tool and source change checks.

The coverage map lives in `docs/COVERAGE.md` and `generated/coverage.json` (also `samedaydesk coverage`).
