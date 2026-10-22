---
name: web-extract
description: Read credential-free public webpages as structured JSON or clean LLM-ready Markdown. Use GET /extract for one public HTTPS page, one bounded POST /extract/batch for 2–5 caller-supplied public HTTPS URLs with explicit desired fields, or GET /read for Markdown. A caller may explicitly request a one-item batch. Do not use for authenticated or private-network content.
---

# web-extract

SDS `mcp-skills-list` pin. A skills-capable client lists this skill via MCP
`skills/list` with a resource digest of this file.

This verifier does not fetch URLs, does not POST `/extract` or `/extract/batch`,
does not send payment headers, and does not POST MCP `tools/call`.
