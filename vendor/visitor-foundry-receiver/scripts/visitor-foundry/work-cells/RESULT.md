# VF02 RESULT — durable voluntary work cells

Completed on the assigned Cursor VM in the VF02 repository, September 26, 2026.
This is executable source and real disposable-PostgreSQL evidence. No public
release, production deployment, new login, subordinate model worker or shared
reference edit was performed. Existing VM jobs were left running.

## Pins and delivered implementation

- Owned repository: `epistemedeus/neomorphic-io`.
- Assigned branch: `codex/visitor-work-cells-20260926`.
- Exact source/base: `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`.
- Initial source checkpoint: `d5cb7523583fb1c48ddd0125bd89778697efda2d`.
- Implementation/test harness checkpoint: `a5c0dd4885e6c9233514a209166de7f1b92ae1f5`.
- Benchmark, demo and base-regression source: `e74c7eb816d45f32121bcc2e8217fe463d97a5f0`.
- Final implementation/focused-test source: `8888da01d79ef36208f3e450775cd33d69520438`.
  Later delivery changes are evidence and receiving documentation only. The final
  implementation moves self-disposition denial before receipt lookup and adds
  explicit migration CLI plus two tests; measured claim path is unchanged.

The additive TypeScript extension is in
`services/correspondence/src/visitor-work-cells/`, with uniquely owned migration
and reversal under `services/correspondence/migrations/visitor-work-cells/`.
The existing service entrypoint, base schema files, homepage, payment/earned-work
owners and package manifests/lockfiles are unchanged. Client, CLI, private-cluster
runner, cold demo, tests and evidence are in this work-cells directory.

Implemented lifecycle: immutable gap/scope → voluntary claim with durable fenced
lease → checkpoint/renew/release/authorized transfer → exact submission → trusted
verification disposition or explicit requester rejection/cancellation. Submitted
is not accepted. An unfunded request remains unfunded throughout. No payment,
reward, invocation, artifact execution or useful-reuse claim is created.

## Actual source reuse and boundaries

Read Root's VF02 assignment and adjacent structural expansion, then actual
correspondence Postgres store, migration, grant/auth/config, project-state,
bootstrap-replay and cursor validation. Also read shared-task workspace and its
connection/export semantics, contributor-desk authority/lifecycle boundaries and
contributor-session-grant durable claim/reconcile/token-file code.

- Reused correspondence projects as tenant scope, existing owner/writer/reader
  grants and token hashes, canonical request hashing, IDs and cursor encoding.
- Reused `correspondence_idempotency` for atomic mutation receipts and replay.
  One additional projection table and partial revision index; no second journal.
- Existing correspondence project events/lifecycle retain their authority.
  Compatible project/grant shared locks order close/revoke against mutations;
  only the specific work-cell row serializes its competing mutations.
- Reused correspondence HTTPS/loopback origin validation and bounded response
  reader, plus contributor-session-grant fingerprint, token-file and secret-free
  exclusive-write helpers in the cold client. No new identity system.
- Did not copy the contributor desk's paid reservation state machine, E01/PR109,
  H36 or wallet/settlement paths. Shared-task continues using its existing project
  channel; VF02 receives that same project/grant and supplies the missing durable
  work lifecycle. No second listener or broadcast mechanism is introduced.

## Commands and observed results

All run from the repository unless `--prefix` specifies the existing service.
PostgreSQL packages were privately extracted under ignored `.scratch/` using
README's commands; no system package or service was installed. Each run created
its own fresh password-protected loopback PostgreSQL 16.15 cluster. Global
DATABASE_URL/production data were not used.

| Command | Observed result |
| --- | --- |
| `npm ci --prefix services/correspondence --no-audit --no-fund` | 99 existing locked packages installed; lockfile unchanged |
| `npm run build --prefix services/correspondence` | TypeScript build passed, exit 0 |
| `timeout 210 node scripts/visitor-foundry/work-cells/run-local.mjs test` | Final 15/15 pass, 0 skipped/failed; TAP duration 5681ms |
| `timeout 210 node scripts/visitor-foundry/work-cells/run-local.mjs demo` | Cold handoff/restart/submission/fixture disposition passed, exit 0 |
| `timeout 210 node scripts/visitor-foundry/work-cells/run-local.mjs bench` | 36 measured bursts completed, exit 0; counts below |
| `timeout 210 node scripts/visitor-foundry/work-cells/run-local.mjs regression` | Original correspondence suite 53/53 pass, no skips/failures; 4587ms |
| `node --check scripts/visitor-foundry/work-cells/migrate.mjs` | Passed |
| `git diff --check` | Passed |

Evidence:
[focused TAP](evidence/integration.tap),
[original correspondence TAP](evidence/correspondence-regression.tap),
[benchmark JSON](evidence/benchmark.json),
[benchmark raw log](evidence/benchmark.log),
[cold demo JSON](evidence/cold-demo.json),
[demo log](evidence/demo.log), and [checkpoints](CHECKPOINTS.md).
The runner redirects output into these files; no bearer tokens or database
passwords are exported. Actual checkpoint and restart process IDs appear in TAP.
An early compile caught a missing explicit return in the generic transaction
error path; fixed before the first PG suite. No failing runtime test was hidden
or skipped. Initial 12-test, then 13-test suites passed; final 15 includes the
additional client, timeout and renewal checks.

The focused suite establishes:

1. Concurrent exact creation retries: 1 commit, 15 durable replays, one cell and
   receipt; different body or grant with committed key conflicts.
2. 32 competing clients across two actual HTTP processes: exactly one live lease.
3. New grant checkpoint transfer increments fence, caps expiry to target grant,
   keeps checkpoint and rejects old session writes. Submission binds exact gap
   and checkpoint revision and preserves contributing session provenance.
4. Actual elapsed-time expiry, revoked holder takeover, expired/revoked retry
   denial, scoped tenant reads/mutations, reader restriction and invalid target
   grant denial. An expired lease retry returns history, never a renewed lease.
5. Bounded scoped receipt pages, ordered revisions, invalid foreign cursor
   rejection and no duplicate journal effects.
6. A deliberately held cell-row lock does not stop a different cell in the same
   project. A grant expiring while waiting is rejected after the wait. A 1.5s
   lock timeout returns retry guidance and an identical later retry commits once.
7. Correspondence resolve/reopen restrictions, release, requester rejection and
   voluntary cancellation preserve their separate meanings.
8. Unconfigured trusted verification fails closed; forged verdict fields,
   self-verifier identity, candidate drift and self-contributing owner promotion
   fail. Deferred remains submitted; trusted synthetic accept/reject is recorded.
9. SIGKILL followed by a genuinely different process restores checkpoint and
   exact retry. Another authorized session continues. SIGKILL during a blocked
   mutation leaves no partial receipt; retry completes exactly once.
10. Migration is repeatable; reversal preserves original grant tables and a
    sentinel in its selected namespace, then reapply succeeds.
11. Persist-before-POST client recovers a deliberately lost success, refuses
    foreign credential/target replay without sending HTTP, does not overwrite an
    existing attempt and labels an empty 201 as unknown.
12. Renewal keeps fence and exact retry does not extend the lease a second time.

## Offered concurrency results

Counts aggregate **three bursts per row**. Offered is simultaneous HTTP clients
per burst, not independent people, processes, database connections or successful
completions. All clients are owner-controlled. Each claim command was 128 bytes.
Accepted here means a committed **claim mutation**, not an accepted contribution.
Setup/pre-creation is excluded. P95 range is the minimum/maximum of the three
per-burst observed request P95s, including conflicts/replays where applicable.

| Offered/burst | Pattern | Committed | Replayed | Conflicted | Failed | P95 ms range |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | independent | 3 | 0 | 0 | 0 | 5.2–6.0 |
| 1 | contended | 3 | 0 | 0 | 0 | 3.0–5.0 |
| 1 | duplicate key | 3 | 0 | 0 | 0 | 3.9–4.8 |
| 8 | independent | 24 | 0 | 0 | 0 | 10.4–15.5 |
| 8 | contended | 3 | 0 | 21 | 0 | 8.8–10.8 |
| 8 | duplicate key | 3 | 21 | 0 | 0 | 12.8–13.1 |
| 32 | independent | 96 | 0 | 0 | 0 | 29.6–39.6 |
| 32 | contended | 3 | 0 | 93 | 0 | 23.6–29.9 |
| 32 | duplicate key | 3 | 93 | 0 | 0 | 47.0–55.7 |
| 128 | independent | 384 | 0 | 0 | 0 | 86.9–167.3 |
| 128 | contended | 3 | 0 | 381 | 0 | 69.9–82.3 |
| 128 | duplicate key | 3 | 381 | 0 | 0 | 131.2–135.8 |

Across 1,521 offered operations: 531 committed, 495 replayed, 495 conflicted,
0 failed. Each contended burst commits one lease; each duplicate burst commits
one mutation. Individual runs include min/P50/P95/max, elapsed time, status/code
counts and committed operations/second in the JSON. Summed measured burst wall
time was 1,588.97ms, excluding fixture setup; this sum is not a sustained rate.

Resource conditions: shared 4-vCPU Intel Xeon VM; Linux 6.12.94+; Node 22.22.2;
16,791,945,216 bytes total RAM. Two actual HTTP processes, each base pool 1 and
VF02 pool 2 (four work-cell DB connections total). PostgreSQL max_connections 24,
shared_buffers 32MiB, work_mem 2MiB, fsync and synchronous_commit on. Request
10s, connection acquisition 3s, statement 3s, lock 1.5s, child lifetime 180s.
Load average was 0.52/0.43/0.38 before and after. Host RSS ended at 116404 and
116468 KiB; recorded high water 116708 and 117656 KiB. Combined host-process CPU
increase was 242 ticks at 100Hz (2.42 CPU seconds), including setup. Seven DB
connections were observed at end including the measurement client. PostgreSQL
CPU/IO and per-request allocations were not sampled. Other VM jobs were neither
stopped nor assigned benchmark resources. Local loopback bursts do not establish
WAN performance, sustained capacity, paid demand or network effects.

## API, migration and cold demo

[CONTRACT.md](CONTRACT.md) specifies endpoints, field validators, revision and
idempotency rules, grant scope, fencing, replay cursor limits, every next-step
class and VF01/VF03 envelopes. The exported TypeScript/Zod validators are the
machine-executable schema authority. New mutation inputs are limited to 24KiB;
replay is at most 50 receipts. Only committed mutations reserve keys. Historical
receipt replay never bypasses present grant authorization.

Apply the base migration in the existing namespace first. The explicit extension
command is:

```sh
# Existing secret-managed variables: CORRESPONDENCE_DATABASE_URL,
# CORRESPONDENCE_PG_SCHEMA (pilot_correspondence on the shared host).
node scripts/visitor-foundry/work-cells/migrate.mjs --apply
```

Up creates `correspondence_vf02_work_cells` and
`correspondence_vf02_receipt_revision_idx`; existing idempotency rows under
`vf02:cell:<id>` contain receipts. No automatic production migration is enabled.
Migration reversal SQL deletes only VF02 receipts/index/projection in the
explicit search_path. Disable routes and export both projections and receipts
before any approved destructive reversal. The full host plan covers lock/index
build risk and safe operational rollback.

Cold demo command uses the same real service and PG extension. Visitor A claims
an unfunded synthetic gap, checkpoints at revision 3, transfers to another writer
at fence 2, then the actual host process is killed. A cold receiving session on
a new host reloads the checkpoint, submits the exact candidate and observes
submitted state. A **synthetic, owner-controlled trusted resolver fixture** then
records accepted; artifacts are not fetched/executed, money is not inferred.
It ends with a bounded three-receipt page and explicit hasMore. It proves durable
handoff, not independent external verification or later capability usefulness.

## Heavy receiving plan and limits

The detailed [Heavy receiving/deployment plan](HEAVY-RECEIVING-PLAN.md) contains
source receipt checks, executable validation, exact VF01 mapping, trusted VF03
lookup obligations, migration/pool budget, packaging requirements, opt-in mount,
readiness/shutdown integration, canary cases, two-visitor composition, operational
metrics, rollback and decisions still owned by the receiver.

Material limits: source-only route extension, no hosted public deployment; real
VF01/VF03 integration remains receiving work. The trusted resolver is absent by
default. No arbitrary code runner, UI/discovery/listing, paid-work integration,
invitation UX, per-gap ACL or new organization identity is included. Project
scope is the existing tenant boundary. Handoff uses owner-issued scoped grants;
bearer sharing is one session. Alias inequality does not establish independence.
At most 32 sessions may contribute checkpoints/submissions to one cell. Terminal
cells require a new declared scope for another candidate; later capability
invalidation remains VF03/VF01's responsibility. Receipt history/key retention
is durable and unbounded on disk although reads and inputs are bounded; archival
must preserve dedup semantics. Tests cover service process restart, not physical
disk failure, database failover, sustained load or useful later reuse.

All private test clusters and fixture hosts were stopped/removed. Only extracted
packages/apt metadata and compiled dependencies remain under ignored workspace
paths; no system or sibling resources were cleaned. Git commits use the already
authorized `epistemedeus` identity via per-command flags, with no global config
change. Delivery/push evidence follows after the final report checkpoint.

## Exact export evidence

The complete foundation, final 15-test TAP, RESULT and Heavy plan were committed
as `cc5bf418da6620b71db91bf2b6cac94ad9747078` and successfully pushed with the
existing authorized account:

```text
$ git push --set-upstream origin HEAD:refs/heads/codex/visitor-work-cells-20260926
To https://github.com/epistemedeus/neomorphic-io.git
 * [new branch] HEAD -> codex/visitor-work-cells-20260926

$ git ls-remote --heads origin codex/visitor-work-cells-20260926
cc5bf418da6620b71db91bf2b6cac94ad9747078  refs/heads/codex/visitor-work-cells-20260926

$ git status --porcelain=v1
<empty>
```

This export-receipt addition is a subsequent documentation-only commit. The final
handoff supplies its exact remote-verified tip. The implementation pin remains
`8888da01d79ef36208f3e450775cd33d69520438`; the complete foundation/report pin
above is directly fetchable. No patch fallback was needed. No force push, PR,
public release, new authentication or global Git configuration change was used.
