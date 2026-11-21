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

## Release check for an npm MCP server

`windows/stdio-release-check.mjs` checks a release the way a user installs it. It runs in the
`Keep it working, release check` workflow on Windows, macOS and Linux, and runs the same way on any
machine with Node 20 or newer:

```sh
node tools/keep-it-working/windows/stdio-release-check.mjs --package sentinel-ir-mcp@0.5.13 \
  --self-check "doctor --client claude-desktop" --self-check-config \
  --tool analyze_directory --tool-args '{"path":"{folder}","max_files":10}' --out report
```

It resolves the release on npm and writes the Claude Desktop and VS Code configurations. It runs
the package's own self-check through `npx`, and starts the server over stdio exactly as each
configuration says. Then it lists the tools and calls one read-only tool on a sample folder.
`report/REPORT.md` says what passed, the exact step that failed and the commands to reproduce.
The transcripts and the self-check output sit beside it. Exit status 0 means every step passed
and 1 means one failed. The check reads and runs only; it opens no issue and sends nothing.

Use an approved exact npm version. The report names the resolved version, machine,
Node and npm versions, both client commands, the self-check and the actual tool result.
A failed step remains a failure. No reload or second payment conceals it.
Keep the HTTP probe baseline and the stdio report in the existing service record.
The next MCP maintainer can reuse this runner by supplying their approved package,
read-only tool and sample input; a later independently retained report demonstrates reuse.

## Subscription release proof

Run the production preview and its real PostgreSQL acceptance with
`npm run release:check`. With the existing Stripe test key file and CLI configured,
use `npm run release:stripe -- --lane SENTINEL --offers keep_it_working --cases readback,success,renewal,cancel --headed`.
This creates a test clock customer before hosted Checkout, pays 100 USD,
advances one billing cycle and its invoice-finalization window, then cancels
through the receipt's hosted customer portal. Each case retains the buyer's view,
provider readback, Stripe-sent webhook and stored row. Test data is not customer demand.

An initial invoice may precede the Checkout webhook. The receiver reconciles the
stored Checkout session from Stripe with the same payment and identity checks.
It refuses an unconfirmed payment instead of treating the invoice as authority.
A portal can schedule cancellation using an exact `cancel_at` timestamp while
`cancel_at_period_end` remains false. Treat either form as canceled renewal and
read the current provider state before updating the receipt.

The key sweep accepts `--key-pages` and `--fixtures` for the existing private
state server's `state-links.private.json`. A fixture description alone is never
a paid receipt. Capability links remain local; commit only redacted reports and
screenshots. Wrap every Lighthouse invocation in
`flock -n /tmp/pilot-grand-phase-lighthouse.lock` and start it only below load 1.
The runner leaves performance unmeasured if the shared VM is busy.
