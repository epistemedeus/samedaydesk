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
(nothing sent). `gateway quote` is a remote anonymous quote (`kind:
"remote_quote"`, not a reservation); execution needs an operator-enrolled
tenant bearer, which this version does not handle.

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
