# W5-M19 — one maintained distribution integration

Owner path: `experiments/wave5/m19/` only.

Reads current SameDayDesk partner/registry events from SDS PR52
`tools/presence` and `tools/presence/registry-consumer.mjs`. Selects one
supported contribution (MCP Registry version-only). Dry-runs submit,
consumes latest through the official latest paths, and invokes the current
useful-jobs offer through the PR52 wrapper CLI.

It does not copy those kernels. It does not repeat closed generic outreach
scans. Unlike snapshot hashes are not forced equal.

```bash
cd experiments/wave5/m19
node --test --test-concurrency=1 test/*.test.mjs
node bin/distribute.mjs journey
```

`--live` publish is refused. Fixture `--apply` on mcp-registry stays on the
presence fixture fetch (`write-not-sent`). Bazaar and MPP `--apply` remain
protected-field refusals.
