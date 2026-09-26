# VF04A result — durable integration and cold visitor reuse

Current VF09 receiving amendment: [compound result](COMPOUND-RESULT.md),
[executed ports](compound/ports.json) and [Heavy hosting plan](VF09-HEAVY-RECEIVING-PLAN.md).
It adds actual VF05 participation and bounded VF08 contributed-code execution;
F93 identities and the durable revalidation lifecycle remain in force. Earlier
sections below retain their historical scope and receipts.

The completed same-session [maintained-evidence lifecycle](LIFECYCLE-RESULT.md) is
current: tested implementation `689233f2131669fdcb05f62f96452629dda479f3`,
218 passing tests, both builds, and a repeated 507-offer load run. Explicit bounded
verification generations preserve artifact identity and all original evidence.
The malformed runtime-version boundary is repaired; immutable gap replay already
fixed by F93 now has a graph-growth regression. See the current
[Heavy receiving amendment](HEAVY-RECEIVING-PLAN.md#maintained-evidence-lifecycle-receiving-amendment)
and [CONTRACT](CONTRACT.md). Evidence is isolated under `evidence/lifecycle/`.
The final remote tip and export hashes are in `.scratch/vf04-lifecycle-export/export-receipt.json`;
the documentation commit after the tested implementation changes no runtime code.

The completed earlier [F93 amendment](F93-RESULT.md) retains its exact tested source
`a7fe9f508f58d25312c64e11b4e6e3d258fbb975`, 206 passing amendment tests,
verified full-domain wire adapters, distinct gap schemas and non-replayed
environment evidence. Its evidence is isolated under `evidence/f93/`.
The original run below remains an archival receipt; the amendments supersede
its original reference mapping, single lifetime attempt limit and claim that
shared modules were untouched. Original and F93 receipts/exports remain intact.

Implemented and executed on the Root-launched Cursor VM, September 26, 2026.
This is an executable loopback service foundation, not a public rollout or a
proposal. All work stayed on the one receiving branch; no subordinate models,
new login, shared-service resets, payments or production migrations were used.

## Exact source and checkpoints

- Repository: `epistemedeus/neomorphic-io`.
- Receiving branch: `codex/visitor-foundry-integration-20260926`.
- Main foundation: `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`.
- Received VF01: `5c38974c28c3c376f2cdd90a91c91e67eb7d00b5`.
- Received VF02: `47fe95ceaba28f6b87e9b4efc8b202b5ffaf1a5f`.
- Received VF03: `2689a197786cead5bcf3476f63aa14fe5da46d44`.
- Receiving merge at launch: `c239d99`.
- Pre-PG implementation checkpoint: `9907ea2`.
- Recovery/acceptance checkpoint: `ddaf820`.
- Final implementation and measured-test pin:
  `81daa872941534e0ea796ba4ed4c2c601f0b7a61`.

Subsequent commits contain receiving documentation/export receipts. The final
handoff records the remote-verified branch tip. Added source is restricted to
this integration directory and uniquely additive correspondence
`src/visitor-foundry/` / `migrations/visitor-foundry/`. The original foundation
modules and their branches remain intact. Homepage, public discovery/copy,
earned-work E01/H36 owners, grant/payment authority and deployment config were
not modified.

## Structural result

Candidate admission, canonical semantic dedup, authenticated VF03 transitions,
budget reservations, assignment fences, physical runner state, admitted receipts,
outbox and discovery records now persist in the existing PostgreSQL boundary.
The receiver replays trusted committed commands through the actual VF03 service
under newly installed handles. It never restores a client snapshot. A finite
coordinator is reconstructed per real project budget, not globally.

Each dispatch has one durable physical reservation. Timeout, a returned result,
candidate withdrawal or host death cannot free it while the runner might live.
The supervisor records prelaunch authority, boot/PID/start identity, actual
result and witnessed exit. Recovery is idempotent. An unclaimed reservation has a
durable proof of no launch; claimed-but-unreconciled work remains unknown.
The real withheld-exit test returned a result, stayed alive past its deadline,
survived host restart as unknown, blocked another dispatch, then reconciled after
actual SIGKILL/exit. Its late receipt did not promote and its cap stayed charged.

VF01 manifests retain exact transitive versions, edges, scoped admitted evidence,
policy/runtime pin and validity. Use rechecks current affected evidence while
holding only the real source/project locks. Shared source retraction propagates
through live scoped reads; unrelated branches and environments remain usable.
VF02 withdrawals stop queued dispatch, reserved launch, result publication and
already-published reuse. Logical cancellation never substitutes for termination.

The installed runner invokes the existing maintained preflight probe on a bounded
JSON recipe. It does not execute a submitted test proposal or code. Evaluator and
probe bytes plus actual Node/architecture/platform are pinned. CPU has a real
`prlimit` ceiling, V8 heap is bounded, and the wall deadline waits for actual
process exit. Total RSS is not claimed to be cgroup-enforced. No new sandbox or
general execution platform was introduced.

Exact field mappings, APIs, limits and migration objects are in
[CONTRACT.md](CONTRACT.md). [README.md](README.md) gives executable composition and
reproduction commands. [HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md) specifies
remaining hosted discovery, operator, supervision, packaging and rollout work.

## Actual remote acceptance

All suites below completed on this VM. PG 16.15 was privately extracted and each
run used a password-protected loopback cluster with fsync/synchronous_commit on,
max_connections 24, shared_buffers 32MiB and work_mem 2MiB. No production URL or
system PostgreSQL service was consumed. Test clusters were stopped and removed.

| Executed command | Final result | Retained evidence |
| --- | --- | --- |
| `node scripts/visitor-foundry/integration/run-local.mjs test` | 15 pass, 0 fail/skip; 7164ms TAP duration | `integration-06.tap` |
| `node scripts/visitor-foundry/integration/run-local.mjs bench` | 12 measured real-HTTP bursts, 507 offers; no unexpected errors | `capacity-02.log`, `capacity.json` |
| `node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs` | 50 pass | `vf01-focused.tap` |
| `node --test scripts/visitor-foundry/validation/tests/*.test.mjs` | 62 pass | `vf03-focused.tap` |
| `node scripts/visitor-foundry/work-cells/run-local.mjs test` | 15 pass, actual PG | `vf02-focused.tap` |
| `node scripts/visitor-foundry/work-cells/run-local.mjs regression` | 53 pass, actual PG, no skips | `correspondence-regression.tap` |
| `npm run test:capability-market` | 26 pass | `capability-market.tap` |
| `npm test --prefix packs/capability-preflight` | 35 pass | `preflight.tap` |
| `npm run test:exchange-townsquare` | 107 pass | `exchange.tap` |
| `npm run build --prefix services/correspondence` | TypeScript exit 0 | `service-build.log` |
| `npm run build` | Exit 0, 81 pages; no deployment | `root-build.log` |
| `git diff --check` | Clean | Final source review |

363 final passing tests across the eight suites; repeated intermediate runs are
not added to this total. See [verification-summary.json](evidence/verification-summary.json)
for parsed totals, versions and durations. This assignment did not change UI;
no new browser-layout claim is made.

Integration proves:

1. Genuine supported-scope service miss → explicit voluntary work cell → fenced
   checkpoint/transfer → SIGKILL → fresh authorized session → exact submission.
2. Host crashes after committed admission, reservation, verifier receipt before
   acknowledgement, and publication before acknowledgement. Restart returns one
   logical candidate, one charged attempt, one receipt/outbox/publication.
3. Duplicate semantics under new command IDs, including 32 concurrent clients
   through two hosts, cannot multiply work. Stale cell/attempt fences, changed
   artifact, foreign tenant, reader mutation, forged public receipt/authority and
   actual runner source-revision drift are refused.
4. A real subprocess result with withheld exit remains unknown/capacity-held
   past the deadline. Later witnessed exit reconciles exactly once without late
   acceptance. Concurrent recovery launches one actual process.
5. Retraction during use, expired transitive dependency and shared-source
   invalidation reject old manifests. Two individually accepted components fail
   their unsupported composition; the existing supported branch remains usable.
6. A held tenant budget lock does not stop another tenant or an unrelated VF02
   cell. Grant expiry during the wait is rechecked at commit.
7. Frozen input mismatch, foreign manifest and post-freeze changes are refused.
   Accepted-with-zero-reuse, declined contribution, unrelated need, unknown
   grammar, failed composition and failed/unknown validation costs remain visible.
8. Opt-in defaults and aggregated lifecycle are tested. Migration repeatability,
   private reversal and reapply preserve base correspondence/VF02 and an unrelated
   idempotency sentinel.

## Cold journey and measurement interpretation

The service initially has no admitted executable recipe for its declared engine
compatibility scope. This is a real miss in that bounded inventory, not a claim
that no implementation exists anywhere. A packages a small JSON binding to the
already maintained preflight function. The contribution repairs service
availability/discovery; it does not claim invention of a new semver algorithm.

Original task and three held-outs are frozen before admission, with the exact
source digest of the owned no-network major-only baseline. The initial baseline
locator was clarified to an explicit owner-QA fixture and source digest; it is
not represented as a historical package API. Final evidence uses the clarified
protocol. No held-out task bytes were changed to fit results.

After restart, six fresh CLI processes cover all three cases in reuse-only and
contribution arms. Each receives only its own task/environment plus ordinary
endpoint/project/grant access. No A artifact ID, transcript or discovery hint is
present. Both arms actually discover and invoke the bounded recipe. Results:

| Frozen case | No-network baseline output | Reuse/contribution output | Observation |
| --- | --- | --- | --- |
| Minor version below requirement | compatible (wrong) | incompatible | useful owner QA |
| Minor version equal requirement | compatible | compatible | useful owner QA |
| Unsupported compound grammar | compatible (wrong) | unknown | unknown task outcome retained |

The explicit limited baseline gets 1/3 expected outputs. Reuse returns the three
expected outputs, including an honest unknown; that does not make all three
tasks successful. VF03 records four declared useful observations and two unknown
observations across the two arms, with zero established external useful tasks.
There is no pooled causal uplift, token-saving or commercial claim. All
relationships are owner-controlled, manually granted, and not independent.
See [journey.json](evidence/journey.json) for source/receipt/manifest/task pins,
restart PIDs, zero-reuse inventory, cost uncertainty and actual output rows.

Original task cost, incremental contribution effort, adaptation, maintenance and
currency verification spend remain unknown. The single journey charges one
1000 USD_MICROS **fixture capacity cap**, not 1000 units of measured spend.
Receipt evaluator CPU/wall is measured separately; missing provider cost is null.

## Offered concurrency and limits

One measured burst per cell below; setup and fixture cell submissions excluded.
All clients are owned. P95 includes refusals/duplicates. Two actual host
processes each use base/cell/integration pools 1/2/2, plus the harness pool 2.

| Offered | Across up to 8 budgets: admitted / p95 ms | Single budget: admitted / backlog / p95 ms | New-key semantic duplicate: new / repeated / p95 ms |
| ---: | --- | --- | --- |
| 1 | 1 / 11.2 | 1 / 0 / 8.2 | 1 / 0 / 6.3 |
| 8 | 8 / 31.6 | 8 / 0 / 51.5 | 1 / 7 / 29.6 |
| 32 | 32 / 73.1 | 16 / 16 / 195.7 | 1 / 31 / 95.0 |
| 128 | 128 / 292.0 | 16 / 112 / 749.1 | 1 / 127 / 307.5 |

507 offered admissions = 214 new candidates + 165 semantic duplicates + 128
explicit backlog refusals, no unexpected errors. The harness then served each
eligible budget in its first round, checked FIFO within each budget, and verified
that a second dispatch was blocked while a real reservation remained. 33 actual
first-round verifier attempts completed and published; pending backlog was not
renamed completed work. This establishes tested tenant progress and FIFO, not a
global scheduler fairness SLA or sustained service capacity. Full latency,
harness CPU, host memory and machine conditions are in capacity.json.

## Retained failures and remaining boundaries

The first runtime suite passed 5/7: its transfer test used `.grant.id` instead of
VF02's `.grantId`, and a test passed snapshot metadata into the strict builder.
Both were harness defects, fixed without weakening source gates. The original
`integration-01.tap` is retained. Initial router syntax failure was fixed before
runtime and recorded in CHECKPOINTS. Intermediate successful runs 02–05 and
capacity-01 remain alongside the final runs. Source review additionally repaired
manifest scope/selection handling, installed runtime binding and VF02 withdrawal.

Remaining deployment limits are concrete: loopback owner QA only; direct explicit
project shares, one attempt and finite nonrotating budgets; bounded replay rather
than an unlimited event archive; no public discovery adapter, invitations, real
independent verifier organization, external evidence ingest, generic compositions
or network executor. Claimed orphan runners require their actual supervisor's
reconciliation; no timer frees them. Total RSS enforcement, long-duration load,
PG failover and independent operators were not tested. Heavy must retain these
boundaries and complete the separately described hosted experiment before rollout.
