---
name: samedaydesk-cli
description: Use when an agent needs SameDayDesk capability facts, gateway route schemas, a server quote, a configured tenant's free-route execution with recovery, public market listings, a free agent-readiness report, or a bounded batch of those reads, through the samedaydesk CLI 0.1.0.
---

# samedaydesk CLI 0.1.0

Generated from the command manifest; do not edit. Source of truth: `samedaydesk commands`.

## Rules

- Run commands noninteractively and parse stdout as JSON. Check `ok`, then `schema`.
- On failure read `error.code`, `error.exit`, `error.retryable` and `error.nextAction`. Do not parse stderr for data.
- Never pass a credential on the command line; secret-named flags are refused. When a command needs the tenant credential, name an existing 0600 file with `--credential-file` or pipe it with `--credential-stdin`. It is bound to the run's origin and never printed.
- Use `--dry-run` to see the exact request, effect and required authority before sending.
- Do not retry a POST. GET retries are already bounded inside the CLI. After a lost tenant execution, run `gateway resume --state-file`: it reads back by receipt id or resends the identical request with the same key.
- On `cursor_refused`, `cursor_malformed` or `cursor_unrecognized`, restart `market discover` without `--cursor`. `error.evidence.server.code` holds the server's own code.
- Read `error.evidence.recovery` (not_sent, sent_unconfirmed, remote_refused, remote_committed, remote_cancelled) before deciding to resend anything.
- SIGINT exits 130 with `error.code` `cancelled`. It does not cancel remote work that was already sent.
- `batch run` prints JSONL: one `start`, one `item` per input line, one `summary`. Exit 0 all ok, 12 partial, 13 all failed, 130 cancelled, 14 stdout closed. Rerun with the same `--state-dir` to resume; completed items are skipped.

## Start

1. `samedaydesk help`, then `samedaydesk help <group>`, then `samedaydesk schema <command-id>`.
2. `samedaydesk capabilities` for current hosted facts.
3. `samedaydesk readiness check --host example.com --out /abs/path/result.json`, then `samedaydesk result show --file /abs/path/result.json` to recover after a lost process.

## Commands

| Id | Usage | Effect | Auth | Summary |
| --- | --- | --- | --- | --- |
| `help` | `samedaydesk help [<group>]` | none | none | Progressive help: groups, then one group's commands with usage. |
| `version` | `samedaydesk version` | none | none | Package and manifest version. |
| `completion` | `samedaydesk completion <shell>` | none | none | Print a shell completion script generated from this manifest. |
| `commands` | `samedaydesk commands [--group <string>]` | none | none | The complete command manifest. |
| `schema` | `samedaydesk schema <command>` | none | none | One command's inputs, output, effect, authority, route and recovery. |
| `capabilities` | `samedaydesk capabilities [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Gateway health and routes plus the market profile, each with its own status. |
| `gateway.routes` | `samedaydesk gateway routes [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Gateway routes with price, timeout, output bound and schema paths. |
| `gateway.schema` | `samedaydesk gateway schema --route <string> [--kind <input|output>] [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | A route's input or output JSON Schema. |
| `gateway.test` | `samedaydesk gateway test --route <string> [--recovery-file <string>] [--origin <string>] [--allow-loopback] [--dry-run]` | fixture | none | The route's labeled test fixture. No provider, payment or tenant. |
| `gateway.quote` | `samedaydesk gateway quote --route <string> --input-file <string> [--recovery-file <string>] [--credential-file <string>] [--credential-stdin] [--origin <string>] [--allow-loopback] [--dry-run]` | remote_quote | optional_tenant | Server quote for exact input (sent to the server; not a local preview). Anonymous: never executable, not a reservation. With a tenant credential: tenant-bound for 60 s, one execution per quote. |
| `gateway.execute` | `samedaydesk gateway execute --route <string> --input-file <string> --state-file <string> [--credential-file <string>] [--credential-stdin] [--origin <string>] [--allow-loopback] [--dry-run]` | tenant_execute | tenant | Configured tenant: server quote, then execution with a persisted idempotency key, then verified receipt readback. Free routes only; a paid route stops before execution. |
| `gateway.resume` | `samedaydesk gateway resume --state-file <string> [--credential-file <string>] [--credential-stdin] [--origin <string>] [--allow-loopback] [--dry-run]` | tenant_execute | tenant | Recover a tenant execution from its state file (this CLI's or the direct client's caller-state v1): read back by receipt id, or resend the identical request with the same key. |
| `gateway.result` | `samedaydesk gateway result --state-file <string> [--credential-file <string>] [--credential-stdin] [--origin <string>] [--allow-loopback] [--dry-run]` | read | tenant | Read back and verify the receipt named in a state file. Never sends a POST. |
| `market.profile` | `samedaydesk market profile [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Public machine-market source and capability fields. |
| `market.discover` | `samedaydesk market discover [--limit <integer>] [--cursor <string>] [--max-pages <integer>] [--stream] [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Public listings. --stream emits JSONL pages with a terminal record. |
| `readiness.check` | `samedaydesk readiness check --host <string> [--out <string>] [--discovery <mcp|a2a|llms-txt|skill-md|openapi|registry|search|referral|operator>] [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Free agent-readiness report for a public host. Same operation as MCP check_agent_readiness. |
| `batch.run` | `samedaydesk batch run --input-file <string> [--state-dir <string>] [--concurrency <integer>] [--max-items <integer>] [--max-line-bytes <integer>] [--timeout-ms <integer>] [--credential-file <string>] [--credential-stdin] [--origin <string>] [--allow-loopback] [--dry-run]` | read | optional_tenant | Run a JSONL batch of supported reads. One JSONL record per item plus start and summary records; per-item state persisted before dispatch; rerun skips completed items. |
| `tools.ai_readiness` | `samedaydesk tools ai-readiness --url <string> [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Free AI-readiness score for one public website. Same check as the MCP tool check_ai_readiness. |
| `tools.llms_txt` | `samedaydesk tools llms-txt --url <string> [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Free llms.txt draft from one public site's sitemap or homepage links. |
| `coverage` | `samedaydesk coverage` | none | none | Advertised normal-user actions at the release head, each classified as a CLI command, a real handoff, or unsupported by the backend. |
| `result.show` | `samedaydesk result show --file <string>` | none | none | Read a saved result record offline after a lost process or stdout. |

## Exit codes

- 0: ok
- 1: input
- 2: transport
- 3: auth
- 4: origin
- 5: not_found
- 6: conflict
- 7: funding
- 8: unavailable
- 9: retryable
- 10: unknown_mutation_outcome
- 11: pending
- 12: partial
- 13: all_failed
- 14: output_closed
- 15: remote_failed
- 130: cancelled
