# SDS agent reference

Lookup only. Commands assume repository root, Node 22, no install.

## Follow runner

| Command | Exit | Meaning |
| --- | --- | --- |
| `node docs/agent-sds/follow.mjs` | 0 | Quickstart bash ran and expects held |
| `node docs/agent-sds/follow.mjs --scan` | 0 | Every `bash` fence in this set is path-allowed |
| `node docs/agent-sds/follow.mjs --seed <fixture>` | 2 | Seeded wrong path refused, nothing executed |

`--seed` exits 1 when the fixture schema is wrong or the seed contains no
wrong path. Follow exits 1 when a quickstart step fails its expect.

`bash` fences in this set are cold-followable. Live or refusing examples that
must not be auto-run use `text` fences.

## Unpaid SDS helpers

| Helper | Command | Notes |
| --- | --- | --- |
| Cold-read | `node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; ...'` | `{preferFixture:true}` is offline |
| Router | `node tools/offer-routing/route-job.mjs <job.json>` | Advice only |
| Matrix dump | `node tools/offer-routing/route-job.mjs --matrix` | Schema `samedaydesk.offer-capability-limits.v1` |
| Reuse preview | `node tools/result-reuse/cli.mjs preview --input ... --task-id ... --subject ... --sequence ... --clock ...` | No write |
| Reuse export | same with `export --opt-in --out ...` | Writes only with `--opt-in` |

## Cold-read outcomes

| `outcome` | `paid` | `liveObserved` | When |
| --- | --- | --- | --- |
| `offline_fixture` | false | false | `preferFixture: true` |
| `apex_live` | false | true | Apex `/for-agents` body usable |
| `alternate_live` | false | true | Apex failed, agents.* partial catalog usable |
| `unavailable` | false | false | No usable live body; no silent fixture swap |

## Route outcomes

| Field | Contract |
| --- | --- |
| `ok` | Whether an eligible offer was selected |
| `selected` | Offer slice or `null` |
| `paid` | Always `false` for this router |
| `paymentRequired` | Selected offer would cost money if the caller later chose it |
| `executionAuthorized` | Always `false` |
| `criteriaAssessment` | Always `not_evaluated` |

Exit 0 when `ok: true`. Exit 2 when `ok: false` (including
`complete_issue_acquisition_unavailable`).

### SDS offer ids

| Id | Job types | Hosting |
| --- | --- | --- |
| `sdd.cold_read_discovery` | `free_discovery` | live free HTTP or offline fixture |
| `sdd.page_change_offline` | `page_change_evidence` | offline local |
| `sdd.result_reuse_offline` | (export of an existing result) | offline local |
| `sdd.paid_html_extract` | `bounded_html_observation` | live paid HTTP (not executed here) |

### Named, not executed here

`neo.agent_task_kit`, `neo.moltjobs_openai_agents_sample`,
`neo.trial_brief_builder` appear in the matrix so agents do not confuse them
with SDS execution. This set refuses their archives, vendor trees, and
`--live` runners.

## Path policy

Allow prefixes: `tools/presence/`, `tools/offer-routing/`,
`tools/result-reuse/`, `docs/agent-sds/`.

| Match | Reason |
| --- | --- |
| `vendor/neomorphic` | `neomorphic_out_of_scope` |
| `neomorphic.io` | `neomorphic_io_out_of_scope` |
| `/extract/batch`, `/extract` | `paid_extract_not_cold_follow` |
| `/api/checkout`, `server/routes/checkout` | `checkout_mutation_refused` |
| `buy.stripe.com` | `payment_mutation_refused` |
| `server/pricing` | `pricing_mutation_refused` |
| `registry.modelcontextprotocol.io` | `registry_live_not_cold_follow` |
| other `tools/` or `server/` paths | `unlisted_sds_path` |
| other http(s) URLs | `unlisted_live_or_route_path` |

A filename such as `accepted-extract-batch.json` under
`tools/result-reuse/fixtures/` is an already-held fixture, not a paid extract
route.

## Apex MCP (lookup)

Free Streamable HTTP MCP on `https://samedaydesk.com/mcp` exposes
`check_ai_readiness` (free), `generate_complete_fix_pack` (paid license),
`plan_taskmarket_delegation`, `browse_taskmarket_tasks`, and
`track_taskmarket_task`. Paid machine gateway MCP is
`https://agents.samedaydesk.com/mcp`. This set does not call either endpoint
and does not redeem a Fix Pack license.

## Fixtures in this set

| File | Role |
| --- | --- |
| `fixtures/free-discovery.job.json` | SDS `free_discovery` job for the router |
| `fixtures/seeded-wrong-path.md` | Wrong-path seed (markdown) |
| `fixtures/seeded-wrong-path.json` | Wrong-path seed (JSON) |
