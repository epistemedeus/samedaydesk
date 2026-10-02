# Hosted delivery receiving379

Completed source/loopback receiving on `codex/sol-hosted-delivery-receiving-100379`
from exact `685f90f6b48d9b141afc5c5dc1e2d09c839a3182`. Applied the existing mount
patch to the real Express app/index; all lifecycle tests use that mounted app
and canonical VF1652533 with isolated PostgreSQL16. No new engine, queue, table,
database, inference worker, paid call or production write.

Fixed cumulative client/server byte accounting and durable original execution
caps; one deadline/allowance covers intake, journal, HTTP, PG, owned children and
output. A physical execution reservation prevents a second child after unknown
consumption. Fixed the owning Update/Add work-brief omission. Kept346's selected
record projection fix and its regressions. Reproduced the inherited discovery
assertion at unchanged base, then fixed its owning test to verify live MCP names
and existing links. Every human client file, price, vendor byte and frozen archive
is unchanged. Git/export source-pin checks now refuse uncommitted client bytes.

| Independent remote check | Passed |
| --- | --- |
| Mounted adapter, real PG, stripped client, crash/recovery |36/36|
| Recipes/reuse, including owning regressions |122/122|
| Broader backend with explicitly disposable PG |108/108|
| Agent readiness / L08 |127/127 /28/28|
| Public predecessor / entry |27/27 /5/5|
| Real site build / production-mode index startup / reproducible export |pass|

No skips. [TEST-RECEIPT.json](TEST-RECEIPT.json) binds actual logs/source hashes
and preserves the baseline126/127 and independent unchanged-base3/4 failure.
Tests cover concurrent claims, exact-key recovery, committed-but-lost replies,
wrong tenant/task/current writer grant, revoked/expired authority, stale lease,
late cancel/revoke rejection and rollback of receipt/checkpoint/release together.

[QA-MEASUREMENT.json](QA-MEASUREMENT.json) records actual caller QA inputs and
direct/stripped retained outputs: two changed SDK fields (143ms client;0.962ms
direct), two pagination actions (113ms;1.297ms), and the useful missing-title/h1
negative (103ms;0.550ms). After a real OS process `SIGKILL`, retrieval took15ms
with the same digest. A changed later task reused the retained prior and detected
only SDK4.0→5.0 (142ms); authorized scrubbed export took11ms. Human review,
manual adaptation, contributor effort, savings and full/marginal costs remain
unknown. These are QA observations, with no outside customer/use/revenue claim.

Minimal MIT client0.1.1: **10,377 bytes**, SHA256
`84cbb35758e8466cf36dd99d804b0b4c09251b9dc4c2820239c98568b494323d`.
Its native client source pin is `fa4cac94758ba8d35189d09ef685130f8db5d83a`.
Original0.1.0/native provenance stays immutable. The actual source exposes
recipes→client metadata→verified archive, separate public evaluation and
grant-bound retained jobs. [STARTUP-READBACK.json](STARTUP-READBACK.json) verifies
the built homepage, real production-mode index, archive, public supplied
evaluation, existing MCP inventory, uploads refusal and clean shutdown on
loopback. This is source hosting, not a production release.

[PRODUCTION-READBACK.json](PRODUCTION-READBACK.json): anonymous live correspondence
is `unconfigured`, visitor entry503, hosted-useful routes404; readiness is enabled.
Existing offline1.4.7 acquisition matches its declared5,255,824 bytes/SHA and
remains a separate path. [ROOT-PLAN.md](ROOT-PLAN.md) identifies the recorded
Hostinger process, configured product Supabase, the absent public/private
correspondence connection identity, and the existing supported
`node server/foundry/install.mjs --migrate --install` step. Root alone resolves
the recorded existing-provider connection, enrolls, merges/deploys and verifies
public client/routes. Source receiving, publication, tenant admission, export,
outside useful use and settlement remain distinct.

**Next real visitor action:** today, acquire the existing public offline package
from `/discovery/useful-jobs.json` and supply their own files. After Root's
publication/enrollment, acquire client0.1.1, use their existing project grant to
evaluate/run a supplied task, retain its digest, and use it for a changed later
task. No outreach, merge, deploy, purchase, overage, reset or live ledger mutation
was performed. Native and remote source equality belong in
[GITHUB-READBACK.json](GITHUB-READBACK.json).
