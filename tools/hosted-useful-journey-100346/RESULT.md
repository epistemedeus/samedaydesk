# Native Sol 100346 — supplied work retained for later reuse

Delivered on isolated `codex/sol-hosted-useful-jobs-100346`, base `1f333f3`.
Executable source checkpoint: `1d89672aca16c4ff0ec2f68249db2c908ae25d21`;
[`SOURCE-CONTRACTS.md`](SOURCE-CONTRACTS.md) identifies actual owners/pins.
`TEST-RECEIPT.json` binds tested executable/test bytes and VM log digests.

Four existing snapshot recipes now have public evaluation separate from
project-grant admission, opaque status/result, exact-operation recovery,
current authority, concurrent VF02 claims, cancellation and lease fencing.
Immutable request/result receipts use the existing correspondence Postgres
table; result/checkpoint/release commit atomically. No new engine/database or
global write. A digest-bound retained result supplies a later changed task's
prior. Optional authorized export uses the existing scrubber. Fixed a real
owning projection defect that dropped selected record fields; both regressions
failed before the fix and pass after it. Shared app/index changes are an explicit
[`ROOT-MOUNT.patch`](patches/ROOT-MOUNT.patch), exercised on actual SDS in a
disposable tree. Human pages, prices, vendor closure and predecessor archives
are byte-identical to base.

Actual Cursor VM, Node **v22.22.2**, PostgreSQL **16**, no skips:

| Independent verification | Result |
| --- | --- |
| Recipe/reuse baseline after actual adjacent merchant layout | 119/119 (initial 117/119: missing layout) |
| Backend/foundry/public-readiness baseline | 42/42 |
| Adapter + real PG, lossy transport, OS restart, exact Root patch and stripped exported client | 30/30 |
| Recipes/reuse with owning regression | 121/121 |
| Backend/foundry/public-readiness/startup | 46/46 |
| L08 repair | 28/28 |
| Site build / Root patch / exact sealed export | pass / pass / pass |
| Broader agent-readiness | 126/127; existing llms literal-name assertion also fails at unchanged base (3/4) |

Adapter proofs cover two different supplied tasks and useful negative,
same-key replay, wrong tenant/task/grant, concurrent requests, post-commit lost
admission/run replies, revoked/expired authority, lease takeover and late cancel
commit rejection, restarted retrieval, changed later input and wrong retained
digest. Input/stdin/files, child groups, PG statements, transport and output share
bounded deadlines/byte allowances; no provider or payment calls.

[`QA-MEASUREMENT.json`](QA-MEASUREMENT.json): two changed page fields (154 ms),
two migration actions (108 ms), useful missing-title/h1 negative (104 ms),
restart retrieval (16 ms), changed retained-prior task (113 ms), authorized
export (10 ms). Automated later assembly/review: 0.130/0.096 ms. Human review,
manual adaptation, savings, marginal cash, quota opportunity and native session
cost remain **unknown**; these are local QA, not outside usefulness or demand.

MIT minimal client: [`successors/0.1.0`](successors/0.1.0), **9,966 bytes**,
SHA256 `5726bcb576445d8f32c698d9ac5cad9eb7b36907d689d4a2a7085683ab09adbd`.
No npm dependencies. [`COLD-CLIENT.md`](COLD-CLIENT.md) supplies complete
evaluate/run/recover/retrieve/cancel/export commands;
[`OPERATIONS.md`](OPERATIONS.md) supplies enrollment, mount, startup, independent
readback and rollback. The VM Git credential was denied; branch publication
uses the existing GitHub connection with exact source-tree verification.
Native checkpoints/worktree and sealed client provenance remain preserved;
a different Git commit wrapper does not retarget the archive. Source
acceptance, production enrollment, hosting,
outside useful use and settled payment remain separate and unverified.
[`GITHUB-READBACK.json`](GITHUB-READBACK.json) records remote source commit
`8002046a21994c74be6f9951f3e4008374614804`, exact native tree equality and a
fresh shallow receiving clone: stripped two tasks/negative/restart, reproducible
archive and clean receiving bytes. That Git readback verifies source transfer;
production route/archive hosting remains unverified.

**Next owner: Root** — receive source/export, apply shared backend mount and
machine entry, verify the recorded existing Postgres enrollment, then independently
read hosted bytes/routes. Root alone merges, deploys or contacts participants.
