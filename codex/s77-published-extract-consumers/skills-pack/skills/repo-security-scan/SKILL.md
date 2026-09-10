---
name: repo-security-scan
description: Statically scan a public GitHub repository for supply-chain risk before an agent installs or runs it. Use for MCP servers, Agent Skills, packages, or dependencies when checking exfiltration sinks, credential reads, obfuscated execution, environment harvesting plus network use, or install-time curl-pipe-shell patterns. The scanner never runs the target, and a clean result is not permission to execute it.
---

# Scan a repository before install

Call:

`GET https://agents.samedaydesk.com/scan?repo=<owner/name-or-github-url>`

Read the current operation, response contract, and price from
`https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, Base network, Base USDC
asset, and recipient. Pay only with caller authorization through x402 v2 or MPP
`evm/charge`. Preserve the source header and reconcile the protocol receipt.

Report `risk`, files scanned, the summary, and each finding. Keep this as one
static evidence layer. Review relevant code, dependencies, release provenance,
and runtime permissions separately before executing an untrusted project.
