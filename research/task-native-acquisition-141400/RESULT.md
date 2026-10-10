# 141400 original-task acquisition

One writer. Section 141400 of Pilot carrier `367986b11e14012575649aed32f43f74f3adac84`. Product baseline `3db8220c9008bc315ab6e25a970bcf7ea3559312`. Branch `codex/task-native-acquisition-141400`.

The machine entry already served a public original-task archive and the apex MCP inventory. Those two surfaces did not decide a next action. MCP tools, OpenAPI `x-mcp-tools`, and A2A skills stay the readiness and TaskMarket inventory. `plan_taskmarket_delegation` does not spend, and it is the wrong action for one public original task. This package adds a `map` decision on the existing correspondence client. It does not add an MCP tool, an A2A skill, a payment route, or a second task protocol.

## Source pins

| Pin | Value |
| --- | --- |
| Pilot carrier | `367986b11e14012575649aed32f43f74f3adac84` |
| samedaydesk baseline | `3db8220c9008bc315ab6e25a970bcf7ea3559312` |
| Caller closure base | `08b90bdef8dbd198023be447942a3119cb268235` |
| Source pin sha256 | `02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15` |
| Current caller closure | `sha256:1e43f06ccb6158d9e676f1e4737285dcbf0e85ed5b162f21d846112abbee513e` |
| Retained prior closure | `sha256:7c5d16672e263c2f8672bbfe0a1065dac94f2cb057d6fe6e44b8a8a37ceb0a61` |
| Prior closures accepted | 13, including the baseline above |
| Predecessor archive | `e586c3201bf29796ae0bfc0e32f822d63f590d92556bdb66068dda81707e955d`, 19152 bytes, still in git history at the baseline |
| Published archive | `d9d7c1a4cb426e89eed2ac12b2df22305d81ed0933fdc2ef5785d86ed5f6be08`, 23506 bytes |
| Discovery document | `a0217f49145a76ceb6afd3770b0ed6a002fe881d27f16cf4143cc20b76c5d32e` |
| skill.md | `46a5a9ef0cf9394a6d68f4a541b5e89c2dee3b702d0c8eff454636018211b5e9` |
| openapi.json | `afd1d544c84370d56f6f84945b912a97e05f1be4d7f0b03fbe3a94fe17c5deb8` |
| api-catalog | `5cad917c648659c5880216cb113b4c16348f32f99ebb6d90a76e9ac39594328b` |

`describe` still omits `acquisition.archive.sha256`. The binding document is the fetched discovery JSON. Commands in discovery must match the constants in `server/lib/original-task/action.mjs`. A hostile discovery cannot replace `nextCommand`.

## What changed

- `server/lib/original-task/action.mjs` maps one inquiry to submit, read, bind, or refuse.
- `cli.mjs` gains `map`. It reads discovery, the task file, and an optional archive. It stats `registration.secret` and does not print secret bytes.
- Discovery, the bundled descriptor, and `original-task-client.tar.gz` carry the same action. The archive is the static import closure plus `action.mjs`.
- `skill.md`, the OpenAPI info description, and the agent-card interface say this is a no-spend correspondence action. A2A skill ids stay `MCP_TOOL_NAMES`.
- `private-control-pin.json` records the new bytes and keeps received caller closures. The pin base is unchanged.
- `package.json` `test:original-task` runs `server/scripts/test-original-task-action.mjs` with the existing intake, acquisition, and correspondence tests.

Observatory paths, `llms.txt`, homepages, offers, payment, checkout, pool admission, and useful-jobs immutable archives were not edited.

Supported intents are `original_correspondence` (four-field task) and `retrieve_continuation` (`task` null, private directory with attempt, secret size 32 through 200, and continuation `projectId`). Refusals are exit 0 JSON. Unreadable files and missing flags are exit 1. `payment`, `fundedJob`, `deliveryPromise`, `acceptance`, `universalCapability`, `mcpSkill`, `authenticated`, `executionAuthority`, and `declaredSourceAccepted` stay false. A safe declared source may be echoed. It is not authentication.

## Cold fixture

Owner QA on loopback. The published submit command still names `https://samedaydesk.com/api/correspondence`. The fixture host was `127.0.0.1`.

```
original-task-action-evidence {"archiveSha256":"d9d7c1a4cb426e89eed2ac12b2df22305d81ed0933fdc2ef5785d86ed5f6be08","archiveBytes":23506,"action":"submit_existing_correspondence","payment":false,"archiveBound":true,"restartedAction":"read_existing_attempt","continuation":"same_private_read","handleScope":"private_directory","laterDisposition":"scoped_result","wrongHandle":"handle_scope","fixtureHost":"127.0.0.1","publishedSubmitHost":"samedaydesk.com"}
```

Journey: catalog, discovery, archive download, bind, extract under a CommonJS parent using the capsule `package.json`, `map`, `submit` to the fixture origin, a second process `map` for retrieve, `read` pending, operator `scoped_result`, stdout without the result sentence, `retrieval.json` with that sentence, wrong handle `handle_scope`.

## Gates that passed

Command, from the product worktree: `npm run test:original-task`. Result: 14 passed, 0 failed.

- Positive: four-field task maps to `submit_existing_correspondence` with `payment` false. Unbound archive maps to `bind_public_archive`.
- Positive: cold installed client submit, restart, and continuation, above.
- Positive: discovery `taskAction` deep-equals `TASK_ACTION`. Live skill text still says fetching does not submit a task.
- Hostile: JSON-RPC `tools/call`, `paid_gateway`, `observatory`, `mcp_tool`, and `other` return `unrelated_task`.
- Hostile: intent `spend` and a payment field return `no_spend`.
- Hostile: `hosted_execution` returns `missing_execution_authority`.
- Hostile: a source label on the task returns `source_label_untrusted`. A bearer declared source is not echoed.
- Hostile: bundled describe output and a rewritten visitor entry or submit command return `stale_discovery`.
- Hostile: a flipped archive byte returns `archive_refused`. A gzip whose sha256 and length match, and whose ustar member contains `require("pg")`, returns `dependency_refused`.
- Hostile: receipt-only directory returns `missing_private_authority`. A handle on submit, a handle other than the directory project id, and a receipt project id that differs from continuation return `handle_scope`.
- Positive: two processes with the same private directory return the same handle.
- `npm run test:machine-discovery`: 4 passed. `server/scripts/agent-readiness/http-mcp.test.js`: 4 passed. Skill ids remain the MCP inventory.
- `server/scripts/test-proxy-addr-patch.js` caller-closure tests: 2 passed. `verifyCallerClosure()` accepted the current pin and all 13 priors. A mutated runtime member throws `caller_source_changed`.

The machine-discovery checker recorded no response for `/llms.txt` and `/.well-known/x402`. Those documents were not read. That is not evidence they are valid or absent.

## Root publication and measurement

This VM could not push `epistemedeus/samedaydesk`. The GitHub integration token reports `admin`, `maintain`, `pull`, `push`, and `triage` false. The exact push attempt is recorded in the Pilot export beside this file. No product pull request was opened.

Root applies `samedaydesk-141400.patch` with `git apply --binary` onto a clean worktree at `3db8220c9008bc315ab6e25a970bcf7ea3559312`, on branch `codex/task-native-acquisition-141400`. `git apply --check --binary` passed on a detached worktree at that baseline before export. Root owns main merge, deployment, and any public submission.

After a deploy Root chooses, fetch `https://samedaydesk.com/discovery/original-task-correspondence.json` and compare `acquisition.archive.sha256` with `d9d7c1a4cb426e89eed2ac12b2df22305d81ed0933fdc2ef5785d86ed5f6be08` and `bytes` with 23506. Until that readback, the live URL is unknown. The predecessor archive bytes remain at the baseline commit. Do not overwrite useful-jobs immutable archives.

## Unknown gates

- Live production discovery and archive bytes after deploy.
- Whether an outside agent selects this action.
- Caller acceptance, settlement, recognized income, and later recurrence.
- Hermes or ClawHub distribution.
- Run token counts and `chargedCents`. Cursor run-info for `bc-801f3b4c-45ac-41c7-95fb-fb289cd84f4d` returned model `grok-4.7` and no charge or token fields.

The fixture is owner QA. It is not a customer, a signup, or revenue. Encounter, request, refusal, task preparation, and fixture delivery happened. Acceptance and settlement did not.
