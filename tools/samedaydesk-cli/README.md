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
  10 unknown mutation outcome (reserved), 11 pending (reserved).
- No prompts. Secret-named flags are refused. This version reads no
  credential at all.

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
(`gateway test`, `gateway quote`) are never retried. `gateway quote` is an
anonymous preview: execution needs an operator-enrolled tenant bearer, which
this version does not handle.

Tests: `npm test` in this directory (node:test, injected fetch, no network).
