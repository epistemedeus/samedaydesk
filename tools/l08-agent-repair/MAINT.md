# MAINT handoff — L08-AGENT-REPAIR-093076

Consumer: MAINT. This is a diagnosis, a repair, and a regression. It is not a score.

Continuation `L08-MAINT-093083` reuses operation `6dd8b73d-e58c-47c7-b2cb-e630167d21f1`.
Prior session `0936c075-cc31-4d98-8300-f8231baafc59`.
Prior seal `ac7e0c75c224a062d9ed4e58332e9c2f34b90895` (draft PR #263 on this same branch).

## Read

`tools/l08-agent-repair/MAINT-HANDOFF.json`

Schema: `samedaydesk.maint.agent-repair.handoff.v1`.

Reject the file if it contains `score`, `grade`, `scoreDelta`, `points`, `ratio`, or `weight`. The checker that produced the finding still knows how to score a host. That number is not this handoff.

The listener returns the handoff JSON from `POST /v1/regress`. It does not write the file. The cold client is the writer. There is no second writer process.

## What failed

Disposable loopback target, mode `broken`.

`POST /mcp` with `tools/call` and the name `__definitely_not_a_tool__` returned HTTP 200 and a JSON-RPC **result** whose `isError` flag was true. The received checker (`server/lib/agent-readiness/checks.js`, finding `mcp.unknownTool`) records that as `fail`: the call produced no JSON-RPC error. An agent that treats a JSON-RPC result as “the tool ran” will treat an unknown name as a completed call.

`GET /llms.txt` on the same target links `mcp-endpoint` so the checker has an MCP server to grade. That document is not the defect.

## Repair

Same target, mode `fixed`. The handler for an unknown tool name returns JSON-RPC error `-32602` and no `result`. The method `tools/call` still exists. A known tool name is unchanged.

The repair is the fixed branch in `tools/l08-agent-repair/lib/disposable-target.mjs`. The cold client reaches it through `POST /v1/repair` on the owned listener. It does not edit the SDS255 checker, the apex MCP route, the seller-repair catalog, or `experiments/s260-useful-jobs-public-integration/`.

## Prove

From the repo root, one owner listener and a separate cold client:

```
node tools/l08-agent-repair/cli.mjs cold
```

Exit 0 means the cold client, not the listener, did all of the following:

1. `POST /v1/diagnose` reproduced `mcp.unknownTool` = `fail`.
2. `POST /v1/repair` switched the disposable target to `fixed`.
3. `POST /v1/regress` showed that finding, and only that finding, move `fail` → `pass`, and the client wrote `tools/l08-agent-repair/MAINT-HANDOFF.json`.

The same command then runs the seeded failures. `reject-unchanged` and `reject-scored` exit 1. `seller-repair` exits 0.

Run the client commands themselves when a listener is already up, or for the checks that need no listener:

```
node tools/l08-agent-repair/cold-client.mjs run --origin http://127.0.0.1:PORT --out tools/l08-agent-repair/MAINT-HANDOFF.json
node tools/l08-agent-repair/cold-client.mjs reject-unchanged --origin http://127.0.0.1:PORT
node tools/l08-agent-repair/cold-client.mjs reject-scored
node tools/l08-agent-repair/cold-client.mjs seller-repair
```

`run` exits 0. `reject-unchanged` exits 1: `POST /v1/regress` while the target is still broken returns HTTP 409 `finding_unchanged`. `reject-scored` exits 1: `fixtures/scored-handoff.json` carries a score. The origin must be `http://127.0.0.1`. Any other host exits 2.

`node tools/l08-agent-repair/cli.mjs prove` is the in-process owner check from the prior seal. It writes the same handoff document. Use `cli.mjs cold` when MAINT consumes the file, so the listener and the writer are not the same process.

## Left unresolved

`protocolEdge` in the handoff. Unsupported `MCP-Protocol-Version` on the received `POST /mcp` returns 200. The spec requires 400. See `research/mcp-protocol-version-header.md`. Do not treat the unknown-tool repair as a fix for that header.

## Seller-repair API

Received read-only. Pin `00267aeb03c3ce01b9b318f5ee0172aee34d7e34` is not in this clone. The catalog was not extended. `mcp.unknownTool` is not one of the catalog briefs.

```
node tools/l08-agent-repair/cold-client.mjs seller-repair
```

Exit 0 in this clone means `POST /api/checkout/seller-repair-session` with `finding_id` `not-a-catalog-id` returned HTTP 503 `Payments not configured`, and one real catalog id returned the same 503. The route reads Stripe before it reads the finding id, so the 503 is before the allowlist. Neither response contains a checkout URL. The catalog files are unchanged before and after the calls.

When Stripe is configured, the same command sends only `not-a-catalog-id`, expects HTTP 400 `Invalid finding ID`, and does not send a catalog id.

## Seller-repair journey

Two ordinary callers, one `paid_get` and one `paid_post`, receive the catalog brief's maintenance scope. The result is not the MCP protocol header, not the disposable unknown-tool repair, and not a second wallet.

```
node tools/l08-agent-repair/cold-client.mjs journey
node tools/l08-agent-repair/cold-client.mjs journey --finding hypernatt-liq-radar-20260830
node tools/l08-agent-repair/cold-client.mjs journey --finding blockrun-exa-search-20260830
node tools/l08-agent-repair/cold-client.mjs journey-negative
```

`journey` exits 0. Each caller line is `useful maintenance-scope` and includes the brief's first required-contract sentence. Neither caller gets a checkout URL. When Stripe is unset, each real catalog id is posted and returns HTTP 503 `Payments not configured`. When Stripe is configured, those ids are not posted.

`journey-negative` exits 1. It refuses `not-a-catalog-id` (`unknown_finding`), `--wallet create` (`second_wallet_refused`), `--echo-header` (`echo_header_refused`), `--disposable-only` (`disposable_only_refused`), and `mcp.unknownTool` (`disposable_finding_refused`). None of those commands write `MAINT-HANDOFF.json`.

`node tools/l08-agent-repair/cli.mjs cold` runs `journey` and `journey-negative` after the disposable repair. The listener still does not write the handoff. The cold client writes the journey onto the same file.

## Success-contract repair

Offline. No checkout, no charge, and no request to a seller endpoint. A suggestion is not an owner-applied verified repair. The cold client still writes `MAINT-HANDOFF.json`. The listener does not.

Two independent callers submit different local contracts and redacted success bodies. The catalog briefs stay input examples. These callers are not those briefs:

1. `local-paid-get-object` — OpenAPI `GET /local/desk/quote` has no success schema. Two object bodies. The patch requires `price` and `symbol` and leaves `venue` optional.
2. `local-paid-post-array` — JSON Schema `{ "type": "object" }` does not match array bodies. The patch is an array of objects that requires `id` and `ok` and leaves `note` optional.

Each caller writes a patch and a regression under its own directory. The regression applies the patch in memory and shows the prior mismatch, the new accept, and a decoy the new schema rejects. `ownerApplied` and `verifiedRepair` stay false.

```
node tools/l08-agent-repair/cold-client.mjs contract-repair --in tools/l08-agent-repair/fixtures/contract-repair/paid-get-object.json --out /tmp/l08-paid-get
node /tmp/l08-paid-get/regression.mjs
node tools/l08-agent-repair/cold-client.mjs contract-repair --in tools/l08-agent-repair/fixtures/contract-repair/paid-post-array.json --out /tmp/l08-paid-post
node /tmp/l08-paid-post/regression.mjs
node tools/l08-agent-repair/cold-client.mjs contract-repair-limits
node tools/l08-agent-repair/cold-client.mjs contract-repair-negative
```

`contract-repair` exits 0 for those two callers. `contract-repair-limits` exits 0. It asks a concrete question for one sample, conflicting object/array types, null mixed with an object, a declared branch that was not supplied, empty arrays, empty objects, `oneOf`, and a non-local `$ref`. Two null bodies produce a `{ "type": "null" }` suggestion. `contract-repair-negative` exits 1. It rejects an unchanged schema, an incorrect submitted schema, a second wallet, checkout, malformed input, oversized input, and a tampered regression. Supplied secrets and example values stay out of the patch, the regression, and the handoff.

Schema checks use `client/scripts/validateJsonSchema.mjs`. OpenAPI success lookup follows the local `$ref` and `application/json` rules in `experiments/s134-record-jobs/modules/openapi-impact/cli.mjs`. The patch does not close `additionalProperties` and does not copy `const`, `enum`, or examples from the supplied bodies. Fields present in every supplied body are required. Fields present in only some bodies stay optional. The owner confirms that intersection before applying it.
