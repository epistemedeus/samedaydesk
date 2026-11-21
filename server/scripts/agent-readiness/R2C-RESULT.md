# R2C readiness producer correction

Release candidate for Root. This run does not deploy, merge, or change the serving route.

## Base and head

| | |
| --- | --- |
| Repository | `epistemedeus/samedaydesk` |
| Branch | `codex/ae14-r2-checker-fix` |
| Base (`sourceHead`) | `6d6c70d73d5e3fc841b9bf90cea390e948b7e4dc` |
| Implementation parent | `3682dfcf30ad54cfb2f33c88deef30a1c63a5466` |
| Release candidate | The branch head that contains this file. Its parent is the implementation commit above. |

Writer scope stayed `server/lib/agent-readiness/**` and `server/scripts/agent-readiness/**`. `git diff --name-only 6d6c70d..3682dfc` is those trees only. `check_ai_readiness`, `server/routes/**`, the MCP inventory, client pages, config, and deploy files are untouched.

Commits, tests before each fix:

1. `e77015e` Add failing readiness regressions for linkage, redirects, x402, and no-JS text.
2. `cbd5f88` Report declared absence, redirect chains, valid x402 entries, and no-JS summary.
3. `b204726` Add a failing no-JS regression for noscript copy.
4. `3682dfc` Count noscript copy in the no-JS homepage summary.
5. The commit that adds this file.

On the base producer, 14 of the 17 regressions in `e77015e` failed. Three already passed: the captured owner-qa fixture is stored as evidence, a redirect to a loopback address is refused, and an initialize result after a redirect stays a pass. After `cbd5f88` those 17 passed. The noscript regression in `b204726` then failed with a visible word count of 1, and passed after `3682dfc`.

Logic does not branch on `neomorphic.io` or `samedaydesk.com`. Fixtures and this record name them. New modules `linkage.js`, `static-summary.js`, and `x402-entries.js` do not contain those hostnames.

## Pass semantics for `discovery.llms.links`

`linkage.passMeans` is `target-valid`. Each of API, MCP, and agent card is one of:

- `target-valid`: a fetched target is that kind. A live OpenAPI document, a live MCP `initialize` result, or a live agent card with both a non-empty `name` and a non-empty `description` counts even when `llms.txt` does not link it.
- `target-invalid`: a link was fetched and the body is not that kind. HTML is not an MCP target.
- `link-present`: a link is present and the target was not verified. This is not a pass.
- `declared-absent`: no link remains, and a line in `llms.txt` declares the surface absent. The reason quotes that line.
- `missing`: no link and no absence line.

The check status is:

- `pass` only when all three are `target-valid`.
- `na` only when all three are `declared-absent`.
- `fail` when every surface is `missing` or `target-invalid`.
- `warn` otherwise.

A valid target is chosen before an absence quote, so a live surface wins over a contradictory absence sentence. A line that says the URL is "not an MCP protocol endpoint" or "human documentation only" is not counted as an MCP link. That line is quoted as `Negated MCP link`. It is not, by itself, origin-level absence.

Declared absence on the other checks uses status `na` and additive `applicability: "declared-absent"`. The reason is `not applicable: declared absent ("<quoted line>")`. For `mcp.initialize`, the transport gap is appended when there is one. The fix is `No publish action: llms.txt declares MCP absent.` or the agent-card equivalent. `topFixes` skips `applicability` `declared-absent` and `not-probed`. `na` still scores 0, the same as `fail`, so this rewrite does not move the score.

## Items

### D1 linkage

Reproduced. Owner-qa for `neomorphic.io` (score 45) marked `discovery.llms.links` `pass` with "llms.txt links the API, the MCP endpoint and the agent card." The fetched `llms.txt` describes `https://neomorphic.io/mcp/` as human documentation and "not an MCP protocol endpoint", and the origin line declares that no A2A agent endpoint or MCP server is advertised. `/.well-known/agent-card.json` is 404. `/openapi.json` is a real OpenAPI document, so the API surface is `target-valid`.

Fixed. Expected status is `warn`, not `pass` and not `na`: API `target-valid`, MCP and agent card `declared-absent`. The live cold run matches that.

Tests:

- `records the owner-qa false pass and the redirect misreport`
- `does not pass when the MCP link is negated and A2A is declared absent`
- `passes only when each linked target was fetched and is the declared kind`
- `does not treat a bare MCP word, or an HTML target, as a valid MCP link`
- `keeps a real same-origin MCP, OpenAPI and agent card link as a pass`

### Declared absence

Reproduced. The same owner-qa top fixes told `neomorphic.io` to expose `/mcp` and publish an A2A agent card.

Fixed. Those checks are `na` / `declared-absent`, and the live top fixes do not say to add them. The quoted line is the advertised-absence line. An origin that declares nothing still gets the publish fixes: live `example.com` does. A line that only declares absence, plus one valid API, stays `warn` (`plain.example` in the regression). It is not a universal pass.

Tests:

- `reports MCP and the agent card as not applicable and keeps them out of top fixes`
- `does not turn a declared-absent line into a universal pass`

### D3 redirects

Reproduced. Owner-qa said `No MCP server (/mcp returned 200).` The GET is `301` to `/mcp/` and then `200 text/html`. The final 200 is the document status. The missing handshake is a separate fact.

Fixed. The probe keeps `redirects` (`{ status, location }`) and `finalUrl`. `describeMcpTransport` reports `301 → /mcp/ 200 text/html (no MCP handshake)` only when there is no initialize result. A document that is `301` then `200 text/plain` still passes. An initialize result after a redirect still passes, and its reason does not contain "no MCP handshake". A redirect to a private address is still refused before it is fetched.

Tests:

- `records the redirect chain separately from the final status`
- `keeps the chain on the probe response and does not fail a final document`
- `still refuses a redirect to a private address`
- `does not treat a redirect followed by a real handshake as a failure`

### D4 x402 manifest

Reproduced. Owner-qa for `agents.samedaydesk.com` (score 75) warned `x402.resources` with "The manifest has no resources and does not say whether that is intentional." The live manifest has 26 Bazaar `items` and no `resources` array. Each item has a nested resource URL and `accepts[].scheme`. Owner-qa for `neomorphic.io` used the same "has no resources" warning. Its manifest has `resources: []` and instructions that begin "No x402 payable resources are currently published".

Fixed. Valid entries are objects with a resource URL and a payment (`accepts[].scheme`, or network plus asset/amount/`maxAmountRequired`/`payTo`). Count is unique payable URLs. A non-array `resources` object contributes nothing. "Has no resources" is used only when no valid entry exists and the document does not declare the list empty.

Live results: agents `pass`, `26 valid paid resources are published.`, `x402Entries` `{ valid: 26, invalid: 0, items: 26, resources: 0 }`. Neomorphic `pass`, reason starts `The manifest declares no paid resources: No x402 payable resources...`.

Tests:

- `counts valid Bazaar items instead of saying the manifest has no resources`
- `does not count invalid entries or object keys as resources`
- `accepts an explicit empty declaration and still warns when the list is silently empty`

### No-JS summary

Added. Check id `static.summary`, category `discovery`. Visible text is the homepage after comments, scripts, and styles are removed. `noscript` is kept, because that is what a no-JS client sees. The reason includes the word count, whether the first sentence of 4 to 40 words says what the product is, and whether the remaining hrefs or URLs point at API, OpenAPI, MCP, or `llms.txt`. Evidence is the additive `staticSummary` object (`wordCount`, `saysWhatItIs`, `excerpt`, `pointers`).

Scoring is documented in `score.js` as `STATIC_SUMMARY_SCORING`. Category weights are unchanged and still sum to 100. The check is one share of the discovery weight (14). A homepage that was not probed is `na` with `applicability: "not-probed"`, is omitted from the category average, and is omitted from top fixes, so the pinned empty-bundle score stays 2. When `/` was recorded, the measured swing between a script-only shell and a described page is greater than 0 and at most 4.

The first cold run showed `samedaydesk.com` keeping its product sentence inside `<noscript>`. Stripping `noscript` left the title only (6 words). `b204726` / `3682dfc` keep that copy. The second cold run reports 553 words and `pass`, with pointers to `/llms.txt` and the MCP URL.

Tests:

- `reports visible text, whether it says what the product is, and machine links`
- `counts noscript copy, which is what a no-JS client sees`
- `ignores script text and passes a static sentence that links llms.txt`
- `uses a conservative discovery share and does not rescore an unprobed homepage`

## Remote cold / direct comparison

Run at 2026-10-15 01:06 UTC. Local `runAgentReadinessCheck` against the public origins. An independent client fetched the same paths (GET, follow redirects, 200000-byte cap) and sent one `initialize` POST to `https://<host>/mcp` with `Accept: application/json, text/event-stream`. No payment and no paid tool call. The producer still performs its existing `initialize`, `tools/list`, and unknown-tool probe.

Origins:

- `neomorphic.io`, `samedaydesk.com`, `agents.samedaydesk.com`: the three first-use hosts.
- `modelcontextprotocol.io`: unrelated public origin that publishes an agent card and answers MCP `initialize`. Chosen after other public MCP hosts returned HTML, 401, 404, 406, or 530 on the card or `/mcp`.
- `example.com`: IANA documentation origin with no `llms.txt`, no MCP server, and no agent card.

Fetched paths, both sides: `/`, `/llms.txt`, `/openapi.json`, `/skill.md`, `/mcp`, `/.well-known/agent-card.json`, `/.well-known/agent.json`, `/.well-known/x402`, `/.well-known/api-catalog`. Status, content type, and redirect chain matched on every compared path for all five hosts. Primary rows:

| Host | Path | Both sides |
| --- | --- | --- |
| neomorphic.io | `/mcp` | `301 → /mcp/` then `200 text/html` |
| neomorphic.io | `/.well-known/agent-card.json` | `404 text/html` |
| neomorphic.io | `/.well-known/x402` | `200 application/json` |
| neomorphic.io | `/openapi.json` | `200 application/json` |
| samedaydesk.com | `/mcp` | `200 text/plain` |
| samedaydesk.com | `/.well-known/agent-card.json` | `200 application/json` |
| samedaydesk.com | `/.well-known/x402` | `404 text/plain` |
| agents.samedaydesk.com | `/` | `200 application/json` |
| agents.samedaydesk.com | `/mcp` | `200 application/json` |
| agents.samedaydesk.com | `/.well-known/x402` | `200 application/json` |
| modelcontextprotocol.io | `/` | `308 → /docs/2026-07-28/getting-started/intro` then `200 text/html` |
| modelcontextprotocol.io | `/mcp` | `405 application/json` |
| modelcontextprotocol.io | `/.well-known/agent-card.json` | `200 application/json` |
| example.com | `/llms.txt`, `/openapi.json`, `/mcp`, agent card, x402 | `404 text/html` |

Producer outcomes:

| Host | Score | Linkage | MCP initialize | Agent card | x402 | Static summary |
| --- | --- | --- | --- | --- | --- | --- |
| neomorphic.io | 42 | warn: API target-valid; MCP and card declared-absent | na, includes `301 → /mcp/ 200 text/html (no MCP handshake)` | na, same quoted absence line | pass, empty declaration, valid 0 | warn, 288 words, product sentence, no machine pointer |
| samedaydesk.com | 84 | pass, all three target-valid | pass, JSON result from `https://samedaydesk.com/mcp` | pass, name and description | na, no parsable manifest | pass, 553 words, pointers `/llms.txt` and the MCP URL |
| agents.samedaydesk.com | 74 | pass, all three target-valid | pass, result from `https://agents.samedaydesk.com/mcp` | pass, name and description | pass, 26 valid items, resources 0 | warn, 1566 words, no machine pointer |
| modelcontextprotocol.io | 50 | warn: API missing, MCP target-valid, card link absent | pass, result from `https://modelcontextprotocol.io/mcp` | warn, parsed, missing name or description | na, no parsable manifest | fail, body cut at the 200000-byte budget |
| example.com | 3 | na, no `llms.txt` | fail, `No MCP server (/mcp returned 404).` | fail, no card | na, no parsable manifest | warn, 27 words, no machine pointer |

Owner-qa scores were 45, 84, and 75 for the three first-use hosts. `samedaydesk.com` stayed 84. The other two moved after `static.summary` joined the discovery average. Turning a false `fail` into `na` does not move the score, because both values are 0.

Live `neomorphic.io` top fixes are the RFC 9727 catalog, the read-only idempotency note, and the linkset content type. They do not say to expose MCP or publish an agent card. Live `example.com` top fixes do say to add an `mcp-endpoint` line and expose `/mcp`, which matches an origin that declared nothing.

`modelcontextprotocol.io` linkage says the agent-card link is absent because `llms.txt` does not link the card and the card has `name` but no `description`, so the unlinked card is not `target-valid`. `agentCard.present` still warns that the parsed card is missing name or description. The independent card read is `{ name: true, description: false }`.

The independent URL scan of `agents.samedaydesk.com` `llms.txt` listed API and agent-card links and no URL whose path ends in `/mcp`. The producer still marks MCP `target-valid` because `initialize` returned a result at `https://agents.samedaydesk.com/mcp`. That is the live-target rule. GET `/mcp` matched on both sides (`200 application/json`).

### Mismatches that remain

1. Automated flag on `agents.samedaydesk.com` and `modelcontextprotocol.io`: `mcp initialize result: independent false vs producer true`. The comparator `JSON.parse`d the raw body. Both servers answer `text/event-stream` (`event: message` plus a `data:` line). A separate POST with the same Accept header, saved at 2026-10-15 01:04 UTC, has a `result` object: agents `serverInfo.name` `x402-data-gateway`, `protocolVersion` `2025-11-25`; modelcontextprotocol.io `serverInfo.name` `Model Context Protocol`, `protocolVersion` `2025-11-25`. The producer pass matches those bodies. This is a comparator parse gap, not a producer defect.
2. Visible word counts differ by a few words where the conclusions agree. Neomorphic independent 289 vs producer 288. Samedaydesk independent 547 vs producer 553. Agents 1566 and 1566. Example.com 27 and 27. The threshold that flags a mismatch is 40 words, so these were not flagged. Product-sentence and pointer conclusions agree. Title and skip-link text are included in the producer count.
3. `modelcontextprotocol.io` homepage is larger than the existing 200000-byte probe budget. Both clients stored 200000 bytes. The independent counter still produced 526 words from the cut body. The producer refuses to summarize and fails `static.summary` with the budget reason. The `308` chain matched and is not the failure.
4. Independent `initialize` POST to `example.com` `/mcp` returned `405 text/html` and no result. The producer reports the GET, which is `404 text/html`, and the reason stays `No MCP server (/mcp returned 404).` GET status matched. Both sides agree there is no handshake.
5. Independent `initialize` POST to `neomorphic.io` `/mcp` stored status `301`, `text/html`, and no JSON-RPC result. GET on both sides is the followed chain `301 → /mcp/` then `200 text/html`. The producer reports that chain plus "no MCP handshake" and does not claim an initialize result.

x402 counts matched where a manifest exists: neomorphic valid 0 with the empty-declaration instructions; agents 26 items, 0 resources, 26 valid. Samedaydesk, modelcontextprotocol.io, and example.com have no parsable manifest on either side.

## Unchanged contract

- Check `status` is still `pass`, `warn`, `fail`, or `na`. `formatAgentReadiness` is still `[status] title - reason`, the evidence URL, and `Top fixes:`. New text is additional reason lines.
- Existing payload field names and types stay. Additive check fields: `applicability`, `linkage`, `staticSummary`, `redirects`, `x402Entries`. Additive evidence fields: `contentType`, `finalUrl`, `redirects`. Evidence `status` stays the final numeric status.
- `schema.js` accepts optional `redirects` and `finalUrl`. The existing test still rejects an unknown field such as `bodyText`.
- SSRF behaviour is unchanged. `still refuses a redirect to a private address` expects `Redirect target is not a public address`. `rate-limit.js` is untouched.
- `CATEGORY_WEIGHTS` are unchanged. `na` scores 0. Pinned demo order and the empty-bundle score of 2 still hold. `fixpack.js` is untouched, so its ein snapshot still drafts an agent card.

Exact suite on this tree, after `3682dfc`:

```
npm run test:agent-readiness
# tests 168
# suites 39
# pass 168
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 608.343987
```

Node printed `The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` That warning is environmental. The suite exit code was 0.

## Limits

- `server/scripts/agent-readiness/probeScript.js` still uses curl without `-L`, so the offline shell probe records the first redirect status. The JavaScript probe follows up to three redirects and records the chain. The shell script was left unchanged.
- `fixpack.js` still drafts an agent card for a demo origin whose `llms.txt` declares A2A absent. Declared-absence handling in this change is the report and its top fixes. The fix pack was left unchanged so its snapshots stay.
- `na`, including `declared-absent`, still scores 0. A declared-absent surface does not raise the score.
- `static.summary` is one discovery share. It is evidence, not a gate. An unprobed homepage is omitted from the average and from top fixes.
- Agent-card `target-valid` requires both `name` and `description`. `modelcontextprotocol.io` is therefore incomplete.
- Bodies over `MAX_BODY_BYTES` (200000) are not summarized. `modelcontextprotocol.io` `/` hit that budget.
- `check_ai_readiness` in `server/routes/tools.js` was not edited and is not repaired by this run. The serving route already calls `runAgentReadinessCheck`, so the release is this producer. A smaller direct edit of the route is not faster, and it is outside this writer scope. Root deploys separately. This run does not deploy.
