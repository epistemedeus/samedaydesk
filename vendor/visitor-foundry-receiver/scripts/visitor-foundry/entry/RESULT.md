# VF10 result

Implemented concrete bounded public entry in the single owned subtree
`scripts/visitor-foundry/entry/`, branch `codex/visitor-entry-20260926`. Work ran as
native Astra on the assigned remote VM, without subordinate model workers.

The cold client now saves a cryptographically random registration proof and exact
attempt before HTTP, obtains a finite private project with reader/writer grants,
writes a real correspondence checkpoint, and resumes after server/client restart
without a transcript. Proof-bound recovery survives committed project/grant writes
and lost replies. Cohort and event-intent charges commit before their mutations;
renewals preserve project/grant identity, fixed lifetime and revocation.

The source exports an optional mount for the existing correspondence app and an
explicit internal enrollment port. VF04 is **disabled by default**. The real F93
receiver remains owned by VF04A; its owner-QA enrollment has not been relabeled as
public admission. No earned-work/payment kernel was touched. The completed
[CONTRACT](CONTRACT.md), [CLI example](README.md), and detailed
[Heavy receiving plan](HEAVY-RECEIVING-PLAN.md) specify the exact remaining VF04/VF05
binding, pinned SDS mount, migration, packaging and lifecycle work.

## Evidence

| Check | Actual result |
| --- | --- |
| Entry acceptance on real disposable PostgreSQL/local HTTP | 19 passed, 0 failed, 0 skipped |
| Existing correspondence regression on real disposable PostgreSQL | 53 passed, 0 failed, 0 skipped |
| Existing service TypeScript build | Passed |
| Owned module syntax build | 12 modules passed |
| Root application build | Passed, 81 pages |
| Owned-path audit | All feature changes are under `scripts/visitor-foundry/entry/` |

[Final TAP](evidence/acceptance-final.tap),
[machine-readable owner-QA receipt](evidence/acceptance.json),
[correspondence regression](evidence/correspondence-regression-01.tap),
[build evidence](evidence/build.log), [root build](evidence/root-build.log), and
[setup/fix history](evidence/setup.md) are committed. Prior acceptance runs are
retained; no failed acceptance or missing-runtime skip was hidden. Initial setup
needed dependencies/PostgreSQL binaries and a repository-local Git author; the
first commit attempt failed before the local author was configured. Default PG
cluster remained down; only disposable test clusters ran.

Acceptance covers anonymous browse/decline, exact proof/request/terms/profile
binding, guessed keys/wrong proof, forbidden public authority fields, 32 identical
concurrent requests, lost project/grant/final replies and process-death recovery
beyond the base 24h bootstrap window, real reader/writer boundaries, foreign-project
read/write denial, private messages, expired/revoked grants, same-row renewal,
workspace deadline, finite global exhaustion, aliases/new secrets/new keys,
immutable installation, real event-row/idempotency/reservation bounds, both sides
of uncertain event commit, durable pending/unknown receiver recovery, bounded
receiver timeout, two concurrent server processes, and the real VF02 router scope
gate including case-insensitive paths.

The optional receiver fixture commits a tiny test row and simulates lost replies;
its SQL calls/state are checked after restart. It proves entry's internal-port
protocol, **not actual VF04 enrollment**. No VF04 verification, invocation,
publication, sharing or paid scope is publicly enabled by this module. The tested
cold operation is genuine correspondence, as allowed by the assignment.

## Cost and capacity observations

One owner-controlled loopback trial on this VM, with separate HTTP server/client
processes. The offered load uses independent HTTP requests in the client process;
these are not independent people, agents, organizations, adoption or demand.

| Offered HTTP concurrency | Finite enrollment budget | Admitted / exhausted / unknown | p95 ms | Peak entry PG connections | Emitted HTTP bytes |
| ---: | ---: | --- | ---: | ---: | ---: |
| 1 | 1 | 1 / 0 / 0 | 20 | 1 | 2,362 |
| 8 | 8 | 8 / 0 / 0 | 74 | 2 | 9,159 |
| 32 | 32 | 32 / 0 / 0 | 283 | 2 | 32,465 |
| 128 | 32 | 32 / 96 / 0 | 334 | 2 | 70,289 |

The 128 offer reached 128 outstanding registration handlers/entry transactions;
actual entry PG concurrency stayed at two, with a separate existing correspondence
pool maximum of one. SQL contained exactly 32 charged registrations, 32 projects
and 96 grants (one inaccessible owner hash plus two narrow grants per project).
The finite cap was not inferred from mocked invocations. No automatic reconciliation
calls were needed in the load trial. This measures admission, not resolver/runner
throughput or hosted TLS performance.

Byte counters are actual server socket HTTP bytes written since host start,
including headers and the initial descriptor response, excluding TCP/TLS framing.
They retain counts only, never header/body contents. At 128 clients, measured
requests totaled 78,413 HTTP bytes received; registration JSON bodies were 27,392
bytes and responses 33,088 bytes. The full per-offer breakdown is in acceptance.json.

Cold entry adds two calls: one public descriptor read and one register POST.
Returning read needs one existing authenticated correspondence call; explicit
registration reconciliation is one extra call when required. The eight-process CLI
journey persisted 1,220 bytes across three secret-free JSON files, plus the separate
44-byte private secret file (43 base64url characters and newline). All local files
were 0600. SQL registration rows, CLI summaries, continuations, public descriptors
and committed receipts contained no raw registration proof or grant.

## Delivery limits and checkpoints

Implementation checkpoints before long tests:
`fb26ebb` (initial source/harness, pushed before acceptance),
`3f09528` (durable event reservations), `c9e364d` (bounded receiver waits/client
validation), `03222a3` (two-process and actual-extension tests),
`a27e9e4` (exact receiver state separate from once-only marker; final tested code).
The final documentation/evidence commit is the feature branch tip reported by the
handoff. The full branch is pushed through existing origin authentication.

VF04A/VF09 checkouts and all shared foundation files were untouched. SDS source
was fetched/read as Git objects only. No main merge, deployment, host activation,
shared running-service change, production migration, provider login, external
token mint or charge occurred. The host can receive the private correspondence
profile independently; full VF05 contribution/VF04 execution binding remains the
explicit receiving work in the Heavy plan, with no claim that it is already tested.
