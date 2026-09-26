# VF02 checkpoints

## 2026-09-26 — source and reuse checkpoint

- Exact source: `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`.
- Isolated branch: `codex/visitor-work-cells-20260926`.
- Read Root's VF02 and structural-expansion assignments, actual correspondence
  Postgres store, grant/auth/config, project-state, bootstrap replay, shared-task
  workspace, contributor-desk authority/machine and contributor-session-grant
  claim/reconcile/token-file code. No repository AGENTS.md found.
- Reuse correspondence projects/grants/token hashing/idempotency/cursor encoding.
  Work-cell state is an additive projection; mutation receipts live in the existing
  correspondence_idempotency table, not a second journal. Existing project
  events and lifecycle remain owned by correspondence. No payment code copied.
- Scoped row locking plus deterministic cell identity prevents duplicate cells;
  no project-wide mutation lock. A new grant is a new authorized session.
  Checkpoint refs contain no session credential and never execute artifacts.
- Exact retries return historical receipts; clients reload before acting on an
  old lease. Changed payload or grant with the same cell/key conflicts.
- Independent acceptance requires a host-injected VF03 receipt resolver; the
  default fails closed. VF01 gap provenance is pinned and remains data.
- PostgreSQL binaries are absent. Provision private extracted packages/cluster
  under ignored `.scratch/` only; do not install or stop system services.
- No subordinate model workers, public release, account login or shared writes.

## 2026-09-26 — implementation checkpoint before PostgreSQL tests

- Additive TypeScript contracts, projection migration/reversal, transactional
  store and mountable Express router compile with the pinned service build.
- Test harness provisions only a private local cluster, max 24 PG connections,
  32MiB shared buffers, fsync enabled, random loopback port/password. Child
  hosts have 180s lifetimes, requests 10s timeouts, per-host VF02 pool size 2.
- About to run real dual-process contention, scoped grant/replay/lifecycle,
  migration/reversal, SIGKILL/restart and in-flight rollback tests. No pass claim
  is made at this checkpoint.

## 2026-09-26 — checkpoint before benchmark and full regression

- Initial real PostgreSQL suite: 12/12 passed, no skips (4.2s). Captured in
  evidence/integration.tap, including actual old/new process PIDs.
- Added durable-attempt client/CLI reusing correspondence transport bounds and
  contributor-session-grant token-file/hash/secret-free file helpers. No new
  credential system. Added unknown-outcome reconciliation test and cold demo.
- Added offered 1/8/32/128 HTTP clients, three independent/contended/duplicate
  bursts each, across two actual host processes, capped pools and timeouts.
  Outcomes and latency will be recorded individually; offered load is not
  successful throughput and owner-controlled clients are not external demand.
- About to run expanded suite, cold demo, benchmark, and the existing full
  correspondence suite on separate private clusters. Checkpoint before tests.

## 2026-09-26 — receiving checkpoint

- Expanded suite 13/13 and original correspondence suite 53/53 pass, no skips.
- Cold demo passed with actual killed/replaced host, retained checkpoint, fresh
  writer grant, submitted/accepted separation and explicitly synthetic receipt.
- All 36 benchmark bursts completed on source e74c7eb; 128-client independent
  bursts each committed 128, contended each 1+127 conflicts, duplicate each
  1+127 historical replays, zero failures. Raw latency/resources are captured.
- Review moved self-disposition rejection ahead of trusted lookup to avoid
  spending lookup work on a known unauthorized actor. Added lock-timeout and
  renewal replay tests plus an explicit migration command. Re-run focused suite
  after this checkpoint; benchmark claim path is unchanged.

## 2026-09-26 — final foundation checkpoint

- Final focused suite: 15/15, zero skipped/failed, 5.681s on 8888da0.
- Full original service suite: 53/53, zero skipped/failed on e74c7eb; later
  extension-only guard ordering does not alter base service source.
- RESULT, exact API/contract, cold reproduction and detailed Heavy receiving
  plan completed. No hosted deployment or real VF03 verification claimed.
- All private PG/HTTP fixture processes and cluster password/data directories
  cleaned. No unrelated jobs killed. Branch scope contains only assigned paths.
- About to export branch using the existing Git credential helper/account.

## 2026-09-26 — export receipt

- Complete foundation/report commit cc5bf418da6620b71db91bf2b6cac94ad9747078
  successfully pushed to origin/codex/visitor-work-cells-20260926.
- `git ls-remote` returned exactly that object; `git status --porcelain` was empty.
- This documentation-only receipt will be pushed normally, then remote tip
  checked again for the final handoff. No public release or PR was created.
