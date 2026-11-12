---
name: samedaydesk-cli
description: Use when an agent needs SameDayDesk capability facts, gateway route schemas or a free quote preview, public market listings, or a free agent-readiness report for a public host, through the samedaydesk CLI 0.1.0.
---

# samedaydesk CLI 0.1.0

Generated from the command manifest; do not edit. Source of truth: `samedaydesk commands`.

## Rules

- Run commands noninteractively and parse stdout as JSON. Check `ok`, then `schema`.
- On failure read `error.code`, `error.exit`, `error.retryable` and `error.nextAction`. Do not parse stderr for data.
- Never pass a credential on the command line. This version needs none and refuses secret-named flags.
- Use `--dry-run` to see the exact request, effect and required authority before sending.
- Do not retry a POST. GET retries are already bounded inside the CLI.
- On `cursor_refused`, `cursor_malformed` or `cursor_unrecognized`, restart `market discover` without `--cursor`. `error.evidence.server.code` holds the server's own code.
- Read `error.evidence.recovery` (not_sent, sent_unconfirmed, remote_refused, remote_committed, remote_cancelled) before deciding to resend anything.
- SIGINT exits 130 with `error.code` `cancelled`. It does not cancel remote work that was already sent.

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
| `gateway.quote` | `samedaydesk gateway quote --route <string> --input-file <string> [--recovery-file <string>] [--origin <string>] [--allow-loopback] [--dry-run]` | remote_quote | none | Remote anonymous quote from the gateway for exact input (sent to the server; not a local preview, not a reservation). Never executable; execution needs an operator-enrolled tenant bearer. |
| `market.profile` | `samedaydesk market profile [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Public machine-market source and capability fields. |
| `market.discover` | `samedaydesk market discover [--limit <integer>] [--cursor <string>] [--max-pages <integer>] [--stream] [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Public listings. --stream emits JSONL pages with a terminal record. |
| `readiness.check` | `samedaydesk readiness check --host <string> [--out <string>] [--discovery <mcp|a2a|llms-txt|skill-md|openapi|registry|search|referral|operator>] [--origin <string>] [--allow-loopback] [--dry-run]` | read | none | Free agent-readiness report for a public host. Same operation as MCP check_agent_readiness. |
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
- 130: cancelled
