# Keep it working release check

Run this test after each release of the customer's MCP server as part of the
monthly service. It reads the tool definitions over Streamable HTTP. It uses
Python 3.9 or newer and the standard library.

On the first approved release, save the baseline in the customer's private
service record. Use a separate baseline for each endpoint.

```sh
tools/keep-it-working/test-release "$MCP_URL" > baseline.json
```

After each release, compare the new result with the approved baseline.

```sh
tools/keep-it-working/test-release "$MCP_URL" baseline.json > candidate.json
```

The result includes the negotiated protocol version, tool definitions, and a
SHA-256 fingerprint for each tool. Review `changes` for schema and description
edits, additions, and removals. Exit status 0 means the listing was captured and
there were no differences against any supplied baseline. Exit status 1 means
the probe failed. Exit status 2 means there is drift or an invalid invocation.
Keep the approved baseline until the service owner accepts the candidate.

This is the tool-definition step in the release test. Run the customer task in
the agreed client and operating system as part of the same review.

## Windows release check for an npm MCP server

`windows/stdio-release-check.mjs` checks a release the way a user installs it. It runs in the
`Keep it working, Windows release check` workflow on `windows-latest`, and runs the same way on any
machine with Node 20 or newer:

```sh
node tools/keep-it-working/windows/stdio-release-check.mjs --package sentinel-ir-mcp@stable-0.5 \
  --self-check "doctor --client claude-desktop" \
  --tool analyze_directory --tool-args '{"path":"{folder}","max_files":10}' --out report
```

It resolves the release on npm and writes the Claude Desktop and VS Code configurations. It runs
the package's own self-check through `npx`, and starts the server over stdio exactly as each
configuration says. Then it lists the tools and calls one read-only tool on a sample folder.
`report/REPORT.md` says what passed, the exact step that failed and the commands to reproduce.
The transcripts and the self-check output sit beside it. Exit status 0 means every step passed
and 1 means one failed. The check reads and runs only; it opens no issue and sends nothing.
