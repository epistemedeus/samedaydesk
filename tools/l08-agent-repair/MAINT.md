# MAINT handoff — L08-AGENT-REPAIR-093076

Consumer: MAINT. This is a diagnosis, a repair, and a regression. It is not a score.

## Read

`tools/l08-agent-repair/MAINT-HANDOFF.json`

Schema: `samedaydesk.maint.agent-repair.handoff.v1`.

Reject the file if it contains `score`, `grade`, `scoreDelta`, `points`, `ratio`, or `weight`. The checker that produced the finding still knows how to score a host. That number is not this handoff.

## What failed

Disposable loopback target, mode `broken`.

`POST /mcp` with `tools/call` and the name `__definitely_not_a_tool__` returned HTTP 200 and a JSON-RPC **result** whose `isError` flag was true. The received checker (`server/lib/agent-readiness/checks.js`, finding `mcp.unknownTool`) records that as `fail`: the call produced no JSON-RPC error. An agent that treats a JSON-RPC result as “the tool ran” will treat an unknown name as a completed call.

`GET /llms.txt` on the same target links `mcp-endpoint` so the checker has an MCP server to grade. That document is not the defect.

## Repair

Same target, mode `fixed`. The handler for an unknown tool name returns JSON-RPC error `-32602` and no `result`. The method `tools/call` still exists. A known tool name is unchanged.

The repair is the fixed branch in `tools/l08-agent-repair/lib/disposable-target.mjs`. It does not edit the SDS255 checker, the apex MCP route, the seller-repair catalog, or `experiments/s260-useful-jobs-public-integration/`.

## Prove

From the repo root:

```
node tools/l08-agent-repair/cli.mjs prove
```

Exit 0 means both owned endpoints ran:

1. `POST /v1/diagnose` reproduced `mcp.unknownTool` = `fail`.
2. The disposable mode was switched to `fixed`.
3. `POST /v1/regress` showed that finding, and only that finding, move `fail` → `pass`.

Seeded failures the same command must reject:

```
node tools/l08-agent-repair/cli.mjs reject-unchanged
node tools/l08-agent-repair/cli.mjs reject-scored
```

Both exit 1. `reject-unchanged` calls `POST /v1/regress` while the target is still broken and gets HTTP 409 `finding_unchanged`. `reject-scored` refuses `fixtures/scored-handoff.json` because it carries a score.

## Left unresolved

`protocolEdge` in the handoff. Unsupported `MCP-Protocol-Version` on the received `POST /mcp` returns 200. The spec requires 400. See `research/mcp-protocol-version-header.md`. Do not treat the unknown-tool repair as a fix for that header.

## Seller-repair API

Received read-only. Pin `00267aeb03c3ce01b9b318f5ee0172aee34d7e34` is not in this clone. The in-tree route `POST /api/checkout/seller-repair-session` was called with `finding_id` `not-a-catalog-id` only. `mcp.unknownTool` is not one of the catalog briefs. The catalog was not extended.
