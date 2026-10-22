---
name: explicit-record
description: Project already-held SameDayDesk GET /extract or POST /extract/batch JSON into buyer-named records using explicit JSON Pointers and a local JSON Schema. Use when the caller already has observation JSON plus mapping and schema files. Do not fetch, pay, infer entities, or treat payment as useful output. Partial, missing, ambiguous, and invalid outcomes stay explicit.
---

# explicit-record

SDS `mcp-skills-list` pin. List this skill over MCP `skills/list`. Project only
already-held extract JSON with caller-supplied pointers and schema. Do not fetch,
pay, or treat settlement as useful output.
