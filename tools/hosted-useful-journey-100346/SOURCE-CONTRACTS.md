# Source and contract boundary — native Sol 100346

Base: SameDayDesk `1f333f3`; branch `codex/sol-hosted-useful-jobs-100346`.
Staged `/home/ubuntu/root-sol-context100337/CONTEXT.md` and dispatch read on
2026-10-02. There is no AGENTS.md in this checkout or its ancestors. The actual
adjacent Neo/control AGENTS.md was read: human copy requires operator review.
No human surface is in this patch.

| Owning source read | Contract reused / adapter responsibility |
| --- | --- |
| `tools/recurring-job-recipes/lib/run.mjs`, recipes, prior/payment guard | Existing deterministic recipes; caller supplies snapshots, fields, prior and clock. Adapter materializes bounded inputs in an owned temporary directory. No default task, live fetch, payment or new engine. |
| `vendor/visitor-foundry-receiver/SOURCE-PIN.json`, VF `1652533b1823ac33b86591ec4e931a8c4ea4aa97` | Canonical import closure remains sealed. Existing correspondence Postgres authority, grants and transaction boundary; VF02 work-cell create/claim/checkpoint/release/cancel and current revision/fence. |
| `services/correspondence/{src,dist}/visitor-work-cells/{store,contracts}`, `visitor-foundry/boundary`, base Postgres migration | Installed-client transaction seam. Adapter stores immutable request/result receipts in the existing `correspondence_idempotency` table; no new table, database or principal. Results are execution observations, never contributed/accepted work-cell dispositions. |
| `server/foundry/{compose,opt-in,product-isolation}`, activation `ACTIVATION.md`, `DELTA.md`, `BOUND-TASK.md` | Production enrollment remains conditional. A service-role HTTP key is not a Postgres connection. No production migration/activation or storage replacement. Root applies shared mount patch after receiving. |
| `server/foundry/activation/{cold-job,local-journey,later-retrieval}`, `server/foundry/worker.mjs`, accepted S260 `receipts/SOURCE-REVIEW.md` | Existing hosted-job receiving distinguishes enrolled execution from public offline acquisition. Preserve the sealed 1.0.0–1.4.7 archives and current flags. General supplied tasks use the same authority, without rewriting the worker or promoting its fixed QA task to admission. |
| Adjacent maintained `experiments/maintained-useful-delivery-100278/src/{operation,source-adapter}.mjs` | Actual adjacent owner read; retained decisions and bounded lifecycle inform the adapter. No edits, copied decision engine or new recurring daemon. |
| Neo earned `2e7403f5`, `services/earned-work/{DESIGN.md,src/store/types.ts,src/work-gate.ts}` (read from exact Git object) | Inspection, claim authority, acceptance, obligation and settlement are separate. This adapter never calls earned-work writes, reserves funding, issues rewards or inherits a contributor label as authority. |
| `tools/result-reuse/src/{project,export,map,omit,limits}`, recurring local import | Existing opt-in unverified observation export/scrubbing. Residual owning defect: compact record projection discards selected fields, losing useful delivery. Focused fix and regression only in owning projection/tests. |
| `server/lib/public-readiness-mount.js`, `tools/l08-agent-repair/lib/task-readiness.mjs`, `server/app.js` | Public inspection remains anonymous and distinct from authenticated recipe admission. Existing MCP/paid routes and human pages unchanged. Shared app mount delivered as an explicit patch. |
| Adjacent merchant `91fbf94786658c96c89f94e0f88b03caefd951b0` | Real source copied by Git archive into disposable declared test layout. Existing merchant routes/CLIs exercised, no replacement fake implementation and no edits to its worktree. |

Baseline on actual Cursor VM, Node v22.22.2: backend/foundry/readiness 42/42.
Recipe/reuse initial 117/119: two missing declared merchant-layout prerequisites;
repeat after disposable layout setup and site build are recorded in RESULT.md.

Implementation: opaque project/task/operation-bound admission; explicit run and
durable status/result recovery; concurrent claims and cancel/lease fencing;
changed-input later reuse via a digest-bound retained prior; authorized optional
customer export. HTTP/stdin/file/child/output and PG work share bounded budgets.
Separate facts: source QA, Root acceptance, hosting, outside usefulness, payment.
