# samedaydesk CLI coverage map (0.1.0)

Generated from src/coverage.mjs; do not edit. Machine-readable copy: generated/coverage.json and `samedaydesk coverage`.

Release head read: `epistemedeus/samedaydesk@1199727fb014ad1a41fb294a322f852d274e28bf`.

Counts compare advertised normal-user actions with executable commands, real handoffs and unsupported backend capability. Command count and generated help are not completion.

Normal-user actions: 56. cli 16, handoff 36, unsupported 1, gap 3.

| Id | Surface | Action | Class | Audience | Commands or batch ops | Reference or note |
| --- | --- | --- | --- | --- | --- | --- |
| gateway.health | machine-gateway | GET /healthz (gatewayHealth) | cli | normal_user | capabilities, batch:gateway.health |  |
| gateway.discover | machine-gateway | GET /v1/discover (discoverRoutes) | cli | normal_user | gateway.routes, capabilities, batch:gateway.routes |  |
| gateway.route_schemas | machine-gateway | GET /v1/routes/{route}/{input,output}.schema.json | cli | normal_user | gateway.schema, batch:gateway.schema |  |
| gateway.test | machine-gateway | POST /v1/test (testRouteFixture) | cli | normal_user | gateway.test | Labeled fixture; no provider or payment. |
| gateway.quote_anonymous | machine-gateway | POST /v1/quote without bearer (quoteRoute) | cli | normal_user | gateway.quote |  |
| gateway.quote_tenant | machine-gateway | POST /v1/quote with tenant bearer (quoteRoute) | cli | normal_user | gateway.quote, gateway.execute |  |
| gateway.execute_free | machine-gateway | POST /v1/execute free route with Idempotency-Key (executeBoundQuote) | cli | normal_user | gateway.execute, gateway.resume | Routes at the head: lockfile.delta, http.capture, url.extract.submit, url.extract.poll, url.extract.result (all price 0). Needs an operator-enrolled tenant credential. |
| gateway.execute_paid | machine-gateway | POST /v1/execute paid route with payment-signature | unsupported | normal_user |  | paymentsEnabled is false at the head and no route is priced. A paid quote stops at paid_route_requires_payment_authority (handoff to an operator-approved payer); the CLI never pays or signs. |
| gateway.receipt | machine-gateway | GET /v1/receipts/{id} (readPersistedReceipt) | cli | normal_user | gateway.result, gateway.resume, batch:gateway.receipt |  |
| gateway.tenant_enrollment | machine-gateway | tenant credential issue (bin/enroll.mjs) | handoff | operator |  | Operator runs bin/enroll.mjs; the caller receives a 0600 credential file. No self-serve route exists. |
| apex.health | samedaydesk.com | GET /api/health (getHealth) | cli | normal_user | batch:apex.health |  |
| apex.ai_readiness | samedaydesk.com | GET /api/tools/ai-readiness?url (check_ai_readiness) | cli | normal_user | tools.ai_readiness, batch:tools.ai_readiness |  |
| apex.llms_txt | samedaydesk.com | GET /api/tools/llms-txt?url (generate_llms_txt) | cli | normal_user | tools.llms_txt, batch:tools.llms_txt |  |
| apex.agent_readiness_json | samedaydesk.com | GET /agent-readiness?host&format=json (check_agent_readiness) | cli | normal_user | readiness.check, batch:readiness.check |  |
| apex.agent_readiness_other_formats | samedaydesk.com | GET /agent-readiness?format=fix-pack or the documentation format | gap | normal_user |  | fix-pack answers Markdown, which the shared client-io refuses as non-JSON; the documentation format is not wired yet. |
| apex.funnel_evidence | samedaydesk.com | POST /api/funnel-evidence (project_funnel_evidence) | gap | normal_user |  | Free idempotent projection of a caller packet (nothing stored). Not implemented in this CLI yet. |
| apex.checkout | samedaydesk.com | /api/auth/*, /api/checkout/* (Supabase session, Stripe checkout) | handoff | normal_user |  | Human sign-in and Stripe checkout on samedaydesk.com. Not an agent action. |
| mcp.check_ai_readiness | samedaydesk.com/mcp | tool check_ai_readiness | cli | normal_user | tools.ai_readiness | Same check over the HTTP route. |
| mcp.check_agent_readiness | samedaydesk.com/mcp | tool check_agent_readiness | cli | normal_user | readiness.check | Same operation over GET /agent-readiness. |
| mcp.generate_complete_fix_pack | samedaydesk.com/mcp | tool generate_complete_fix_pack (paid, Stripe license) | handoff | normal_user |  | MCP tool at https://samedaydesk.com/mcp with a Stripe checkout license bought by a human (FIXPACK_MCP_BUY_URL in server/lib/fixpack-license.js). The CLI never buys. |
| mcp.plan_taskmarket_delegation | samedaydesk.com/mcp | tool plan_taskmarket_delegation | handoff | normal_user |  | MCP tool at https://samedaydesk.com/mcp (read-only payload builder). MCP-only; no HTTP route. This CLI has no MCP client. |
| mcp.browse_taskmarket_tasks | samedaydesk.com/mcp | tool browse_taskmarket_tasks | handoff | normal_user |  | MCP tool at https://samedaydesk.com/mcp. MCP-only; no HTTP route. This CLI has no MCP client. |
| mcp.track_taskmarket_task | samedaydesk.com/mcp | tool track_taskmarket_task | handoff | normal_user |  | MCP tool at https://samedaydesk.com/mcp. MCP-only; no HTTP route. This CLI has no MCP client. |
| mcp.project_funnel_evidence | samedaydesk.com/mcp | tool project_funnel_evidence | gap | normal_user |  | HTTP equivalent POST /api/funnel-evidence is not implemented in this CLI yet. |
| market.profile | machine-market | GET /v1/market/profile (machine.profile) | cli | normal_user | market.profile, capabilities, batch:market.profile |  |
| market.discover | machine-market | GET /v1/market/discover (machine.discover) | cli | normal_user | market.discover, batch:market.discover |  |
| market.account_signup | machine-market | POST /v1/account/signup | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command account.signup. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.account_login | machine-market | POST /v1/account/login | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command account.login. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.account_recover | machine-market | POST /v1/account/recover | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command account.recover. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.account_readback | machine-market | POST /v1/account/readback | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command account.resume. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.account_session | machine-market | GET /v1/account/session | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command account.session. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.account_exit | machine-market | POST /v1/account/exit | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command account.exit. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.wallet_bind | machine-market | POST /v1/wallet/bind | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command wallet.bind. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.wallet_export | machine-market | GET /v1/wallet/export | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command wallet.export. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.wallet_exit | machine-market | POST /v1/wallet/exit | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command wallet.exit. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.call | machine-market | POST /v1/market/{action} | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command market.call. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.prove_wallet | machine-market | POST /v1/market/walletProve | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command market.prove-wallet. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.fund | machine-market | POST /v1/market/fundingAuthorize | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command market.fund. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.reclaim | machine-market | POST /v1/market/fundingIntent | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command market.reclaim. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.task_post | machine-market | POST /v1/tasks | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.post. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.task_quote | machine-market | GET /v1/tasks/{taskId}/quote | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.quote. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.task_fund | machine-market | POST /v1/tasks/{taskId}/funding | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.fund. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.task_intent | machine-market | POST /v1/tasks/{taskId}/funding-intent | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.intent. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.task_intent_sign | machine-market | POST /v1/tasks/{taskId}/funding-intent/signature | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.intent.sign. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.claim_terms | machine-market | GET /v1/claims/terms | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.claim. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.claim_binding | machine-market | POST /v1/claims/binding | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.claim. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.claim | machine-market | POST /v1/claims/claims | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.claim. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.submission_draft | machine-market | POST /v1/submission/{reservationId}/draft | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.submit. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.submission_submit | machine-market | POST /v1/submission/{reservationId}/submit | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.submit. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.review_read | machine-market | GET /v1/review | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.retained. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.review_verdict | machine-market | POST /v1/review/verdict | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.review. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.review_decision | machine-market | POST /v1/review/decision | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.review. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.review_authority | machine-market | POST /v1/review/authority | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command task.authority. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.payout_status | machine-market | GET /v1/payouts | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command payout.status. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.operation_readback | machine-market | GET /v1/operations | handoff | normal_user |  | Existing client ae 0.3.0 (agent-economy-client, bin ae) command operation.recover. Needs a native account session, wallet or signer that this CLI does not create or hold. |
| market.c0_fixture_routes | machine-market | GET /healthz, GET /v1/discover, /v1/fixture/* (c0 fixture) | unsupported | fixture |  | Fixture server class only; not a live normal-user surface. |
| market.native_debt_operator | hosted-wallet-market | native debt, discharge, canonical receiving (src/*.mjs, bin/*) | handoff | operator |  | Operator kernels (Postgres, RPC). Not a caller action; owned elsewhere. |
| merchant.free_tools | agents.samedaydesk.com/mcp | free MCP tools (page_change, careers_board_cold, report_caller_result, trial_read, recover_paid_result) | handoff | normal_user |  | https://agents.samedaydesk.com/mcp (MCP streamable-http). An MCP caller should accept only protocol versions 2025-11-25 or 2025-06-18 by exact match, else protocol_version_unsupported (x402-url-extractor@d74c37ff caller-result-client/src/protocol-selection.mjs). This CLI has no MCP client. |
| merchant.paid_tools | agents.samedaydesk.com/mcp | paid x402 MCP tools (25 at the 2026-11-12 observation) | handoff | normal_user |  | x402 payment by the caller's own payer at https://agents.samedaydesk.com/mcp. This CLI never pays, signs or probes paid routes. |

## Remaining real gaps

- gateway.execute_paid: paymentsEnabled is false at the head and no route is priced. A paid quote stops at paid_route_requires_payment_authority (handoff to an operator-approved payer); the CLI never pays or signs.
- apex.agent_readiness_other_formats: fix-pack answers Markdown, which the shared client-io refuses as non-JSON; the documentation format is not wired yet.
- apex.funnel_evidence: Free idempotent projection of a caller packet (nothing stored). Not implemented in this CLI yet.
- mcp.project_funnel_evidence: HTTP equivalent POST /api/funnel-evidence is not implemented in this CLI yet.
- market.c0_fixture_routes: Fixture server class only; not a live normal-user surface.
