# TaskMarket delegation integration pitch

Prepared before implementation on 2026-08-08 for TaskMarket task
`0x21cc30011dddb8c7a5e91b4c70c140defab447507169513745d0389572255a42`.

## Target

- Product: SameDayDesk remote MCP server and agent data gateway
- Repository: https://github.com/epistemedeus/samedaydesk
- Live product: https://samedaydesk.com/mcp
- User surface: MCP clients that already decide whether to call a tool, spend
  money, or delegate work

## Exact integration surface

Add three free tools to the existing Streamable HTTP MCP server:

1. `plan_taskmarket_delegation` turns a natural-language job into a bounded,
   canonical TaskMarket payload. It requires the expected deliverable, budget,
   deadline, mode, and tags, applies user-provided spending limits, and returns
   a deterministic approval summary plus the official API payload.
2. `browse_taskmarket_tasks` reads current public TaskMarket inventory with
   optional status, tag, and text filters. It gives the agent real market
   context before recommending new spend.
3. `track_taskmarket_task` reads one public task and summarizes its status,
   deadline, submissions, awards, and next authorized action.

The accompanying `/x402` product page will explain the user flow and link the
official TaskMarket service and this implementation.

## User flow

1. The agent decides a request needs external research, coding, collection,
   benchmarking, or verification.
2. It calls `browse_taskmarket_tasks` to see whether an existing task or worker
   market is relevant.
3. It calls `plan_taskmarket_delegation` with the user's deliverable, budget,
   deadline, and explicit maximum spend. The tool validates that the proposed
   reward stays inside the limit and returns the exact TaskMarket payload.
4. Creating and funding the task remains a separate, visible TaskMarket x402
   transaction. The integration does not hold a wallet, private key, or payment
   capability and cannot silently spend.
5. The agent calls `track_taskmarket_task` to monitor submissions and present
   review state. Acceptance remains an explicit action in TaskMarket rather
   than an automatic server-side decision.

## Wallet, authorization, and spending-limit design

- No private key, wallet session, bearer token, or payment credential enters
  SameDayDesk.
- The planning tool requires both `reward_usdc` and `max_spend_usdc` and
  refuses a reward above the user-authorized ceiling.
- The tool never calls TaskMarket's X402-protected creation or acceptance
  endpoints. It produces the exact reviewable payload and hands execution to
  TaskMarket's official payment flow.
- Public browsing and tracking use only documented read endpoints, strict
  timeouts, bounded responses, and no user-supplied target URL.
- Untrusted task content is treated as data and returned in bounded text. It is
  never executed, imported, or used to create another task automatically.

## Expected implementation

- `server/lib/taskmarket.js`: validation, bounded TaskMarket reads, filtering,
  deadline math, and deterministic delegation plans
- `server/routes/mcp.js`: MCP schemas and handlers for the three tools
- `server/scripts/test-taskmarket-integration.js`: dependency-free unit and
  mocked-network tests, including over-budget refusal and hostile content
- `client/src/pages/Mcp.tsx` and CSS: public explanation and source links
- This document: setup, usage, safety model, status, and reproducible evidence

## Test plan

1. Unit-test canonical payload creation, reward micro-unit conversion, deadline
   conversion, tag normalization, and spending-limit refusal.
2. Mock TaskMarket's list and task-detail responses to test filtering,
   summarization, bounded output, timeout-safe error handling, and treatment of
   hostile descriptions as inert data.
3. Exercise all three tools through local MCP `tools/list` and `tools/call`
   requests.
4. Build and lint the full SameDayDesk application.
5. Deploy from a public GitHub commit, verify the live MCP schema and tool
   calls, and preserve logs or screenshots with the final TaskMarket
   submission.

## Initial status

Pitch committed before implementation. No TaskMarket funds have been spent and
no user authorization has been inferred. The next step is the implementation
and reproducible test evidence described above.

## Implemented status

The integration now ships in the feature branch with the promised three tools:

- `plan_taskmarket_delegation` validates reward and maximum-spend values to six
  decimal places, refuses an over-budget plan, uses hours as required by the
  official create schema, normalizes tags, fixes stake at zero, defaults
  submission visibility to `winner_only`, and returns a deterministic SHA-256
  plan id. Its `POST /api/tasks` request is reviewable and marked
  `executed: false`. It also returns the equivalent official
  `taskmarket task create` argument vector and safely quoted display command;
  neither route is executed by SameDayDesk.
- `browse_taskmarket_tasks` calls `GET /api/tasks` with bounded pagination and
  local status, mode, tag, text, and reward filtering. Descriptions remain
  inert marketplace text.
- `track_taskmarket_task` calls `GET /api/tasks/{taskId}` and the corresponding
  submissions endpoint. It exposes deadlines, hashes, artifact metadata,
  canonical awards, official pending actions, requester, phase, net reward,
  fee, and escrow transaction while omitting signatures and storage URLs.

### Real creation and escrow fixture

SameDayDesk had already created and funded a genuine TaskMarket task through
the official x402 route before this integration:

- task: `0x20ac27a69d26c03165bdf22c60881cd1adc7dd0705e47c1bbdc0c1578b7858cc`
- reward: 0.10 USDC
- escrow transaction:
  `0x6de7d2c3ecfd4fc808c301fa274126e58e8c7411f8880303f9c3111d5bdaab4a`
- current phase: `awaiting_settlement`
- independent submissions visible to the live tracking tool: 51

This fixture proves the official create and escrow route without another
spend. The new planning tool now emits both the exact REST payload and official
CLI handoff for the same flow; the tracking tool reads the funded task and its
submissions back from TaskMarket. Acceptance remains separately authorized.

### MCP examples

Connect a Streamable HTTP client to `https://samedaydesk.com/mcp`, or post the
standard JSON-RPC calls directly after deployment.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "plan_taskmarket_delegation",
    "arguments": {
      "request": "Verify public launch claims",
      "deliverable": "One source-linked Markdown report",
      "acceptance_criteria": ["Every claim includes a primary URL"],
      "reward_usdc": "3.142305",
      "max_spend_usdc": "4",
      "deadline_hours": 24,
      "mode": "bounty",
      "tags": ["research", "verification"]
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "track_taskmarket_task",
    "arguments": {
      "task_id": "0x21cc30011dddb8c7a5e91b4c70c140defab447507169513745d0389572255a42"
    }
  }
}
```

### Reproducible verification

```bash
npm install --ignore-scripts
npm run test:taskmarket
npm run build
```

The focused suite currently passes 6 of 6 tests. A local MCP exercise exposes
five total tools, including all three TaskMarket tools. The plan call produced
reward `3142305`, state `approval_required`, and `executed: false`; the tracking
call read the live bounty and its current submissions without a wallet or
write action. The full client build passes. Repository-wide lint still reports
three pre-existing errors in `client/src/lib/auth.tsx` and
`client/src/lib/theme.tsx`; the changed MCP page itself passes focused lint.
