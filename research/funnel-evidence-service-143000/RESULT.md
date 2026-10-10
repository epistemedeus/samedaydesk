# Funnel evidence service 143000

One additive HTTP and MCP projection on SameDayDesk `a29724fa54b7c22c9369fcb93c1ec3b93a7c4148`. The accepted Neomorphic engines are vendored unchanged from `e19bc1b97ee78d96dc59fdaa0cffccd717381cc8`.

Successor correction: `project_funnel_evidence` is admitted by forward migration `0006`. Released migration `0005` stays the historical six-tool file.

## Pins

| Blob | SHA |
| --- | --- |
| funnel-decision-projection `src/project.mjs` | `9ca997bc2f0a51e1ab283bb87943ada151708ddf` |
| live-measurement-consumer `src/consume.mjs` | `106f71299fce208069f9830d4dd13de1a5a5762f` |
| live-measurement-consumer `src/capture.mjs` | `5a8d191bb62e8b089055cf8c5261077bd7b265e9` |
| core-only fixture | `337cd439692401b058dbc54f9d5f29fb40432238` |
| public payment cut | `8e40f9b361dd2f379ee8cc1bf02441d9ca0cbb33` |
| EIN window 135600 | `9cc54698971fb269a385fbc620c7dc74a03918f7` |

Operation: `POST /api/funnel-evidence` and MCP tool `project_funnel_evidence`. Runtime: Node v22.23.3. Command: `npm run test:funnel-evidence`.

## Tested

`server/scripts/test-funnel-evidence.mjs`: 8 passed, 0 failed, about 673 ms.

- Core-only HTTP `projection` deep-equals direct `projectFunnel`. Decision kind `measure`. Signup stage is not observed and its eligible denominator is null.
- Synthetic original-task receipt: `excludedSynthetic` 3. Request, delivery, and caller acceptance stay unobserved.
- Mixed USD and EUR settlements: decision `repair`, conflict `mixed_currency`, next action `Keep each currency on its own settlement. Do not add them.`
- Payment cut plus EIN window match `consume()` and match `projectFunnel` of empty sources at `2026-10-10T04:01:52.084Z`. Reconciled settlements 56, amount atomic `1132000`, currency null. EIN bounded count 65, signup rows null, payment rows null, `rowsMaterialized` 0. Recognized income and independent customers stay null. `inputFetched` is false. The public payment URL is not in the response.
- Hostile email, bearer text, malformed JSON, 413 oversize, depth, source count, explicit fetch, mixed core-plus-plane packet, and core-with-records return only a safe code. Fetch was not called. Logs do not contain the supplied secret or the payment URL.
- A cold process outside the server tree, with fetch trapped, matches direct `projectFunnel` for core-only.
- Maintained client `postRpc` / `probeApex` against `server/index.js` receives the same core and measurement projections. A missing packet returns `request_schema`. The absent-tool probe still returns JSON-RPC `-32602`.

Also passed on this successor, Node v22.23.3:

| Command | Result |
| --- | --- |
| `npm run test:funnel-evidence` | 8 passed, 0 failed |
| `npm run test:mcp` | 46 passed, 0 failed |
| `npm run test:machine-discovery` | 4 passed, 0 failed |
| `npm run test:agent-readiness` | 150 passed, 0 failed |
| `npm run test:spa-route-shells` | 9 passed, 0 failed |
| `npm run test:pulse` | 80 passed, 0 failed |
| `npm run test:original-task` | 14 passed, 0 failed |

PostgreSQL 17.11 from the official PGDG noble archive (`17.11-1.pgdg24.04+2`) supplied `/usr/lib/postgresql/17/bin`. Tests used disposable local clusters. No production database and no copied credentials.

## Migration correction

Released `supabase/migrations/0005_pulse_admit_declared_mcp_tools.sql` is blob `fa86042bb05e275f616a690f5af19c22688c68e2` from `a29724fa54b7c22c9369fcb93c1ec3b93a7c4148`. It admits six tools. `PULSE_TOOL_CONTRACT_MIGRATION` now locates `supabase/migrations/0006_pulse_admit_declared_mcp_tools.sql`, written only by `renderPulseToolContractMigration()`. That forward file admits the current seven-name inventory, including `project_funnel_evidence`, with a 32 character key cap. It does not update aggregate rows, first-observed boundaries, flush ids, or receipt hashes, and it does not rewrite 0002, 0003, or released 0005.

Disposable PostgreSQL applied `0002`, then `0003`, then historical `0005`, then `0006`. After historical `0005`, the six-tool observation, its receipt, and the first-observed boundary stayed in place, and `project_funnel_evidence` was refused with no new receipt. After `0006`, those receipts, counts, and the boundary were unchanged. Applying `0006` again was idempotent, and `project_funnel_evidence` was then admitted from the declared inventory. Unknown names, overflow, negative counts, a non-object tool map, and anon or authenticated execution stayed refused. Tool observations were not backfilled.

## Unknown

- `docs/agent-sds/howto-unpaid-mcp.md` still extracts `const TOOLS` from `server/routes/mcp.js`. That marker was already absent at `a29724fa`. The howto was not rewritten, and this successor did not re-run that journey.
- No production POST, live deployment, outside caller, customer query, or revenue check.

Root owns merge, deployment, and publication. Rollback is removal of this operation. The vendored prototype and consumer stay.
