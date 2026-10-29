# H64334 c4-derived clock repair qualification

Source-qualified for Root's normal release receiving. No merge, deployment,
provider mutation, public publication, enrollment, grant, payment or scheduler
activation was performed. Production was not freshly queried by this worker.

The tested implementation is `4ede7119720e4c9c42c0271a86f5fd4734f33fa3`, a direct
child of installed `c4ec17a891e19177d574ed79faaac25d295d2743`, on
`codex/root64334-sds-installed-clock-repair-20261029`. The subsequent receipt
commit contains documentation/evidence only. All 631 c4 ancestry commits are
retained. The immutable comparison is 200 ahead / 4 behind H31's original base,
merge base `d8cea059213e06d2f263be67f82e498f8052a50f`.

The two runtime files, owning managed-watch test, shared PostgreSQL fixture,
seven resolver tests and four acceptance helpers are exact donor bytes from
`63e4076d1ffd98bc2f561fbb4c66d2fedb714830`. The workflow adds only the direct
resolver test step. Its historical checkout and Root-owned acquisition decoder
remain intact. Package scripts, lockfile, archive, PINS, verifier and actual
c4 historical caller tests are unchanged. There is no product-tree merge.

The defect was freezing the observer at request start before asynchronous
transport. The service passes its clock function and the source wrapper samples
that observer at receipt. Explicit scalar/Date clocks stay frozen. The maintained
consumer, source timestamps and 48-hour freshness boundary are unchanged.

The c4 pin retains its base, all 1,308 members and all 34 received descriptors.
Only the two prescribed member hashes change, followed by the canonically
recomputed c4 predecessor descriptor. All 35 retained descriptors and the current
descriptor pass. Tampering with either repaired member yields
`caller_source_changed` before even reading the test configuration.

```json
{
  "base": "4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134",
  "sourcePinSha256": "02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15",
  "closureDigest": "sha256:7772455923e8a9563900993d3b650bd549c255e69c31b085b271c0464f54f590"
}
```

Serial remote execution ran on the admitted Cursor Linux VM, native Sol6.1/xhigh,
Node 22.14.0 and PostgreSQL 16.15. Cold production installation used
`npm ci --omit=dev --ignore-scripts`. No local-Mac work was used. The 2 GiB
reservation, checkpoint 22:05 UTC and export tail through 22:20 UTC were kept;
the independent foreground helper was not changed.

| Check | Fresh H34 result |
| --- | --- |
| PG resolver | 7 passed |
| Managed watch | 17 passed |
| Cold proxy, dependencies, caller and historical caller | 13 passed |
| Startup diagnostic | 7 passed |
| Hosted startup | 4 passed |
| Additional machine discovery | 5 passed, 1 existing explicit-client-build opt-in skip |
| Real HTTP / PostgreSQL / durable recipient | Passed, including process restart and recovery |
| Actual `npm run build:managed-foundry` | Passed preserved publication, deployable runtime and managed probe |
| Emitted public bytes against immutable c4 | 352 / 59,951,737 bytes, every member raw-equal |

The delayed HTTP positive observes request start `18:00:00.511Z`, source fetchedAt
`18:00:00.914Z`, observation/receipt `18:00:00.916Z`: fresh at age 2 ms. The
frozen counterfactual remains clock-ahead at -497 ms; genuine future data remains
clock-ahead at -119999 ms. Stale, missing/malformed clocks, partial metrics,
HTTP/parse failure, timeout/cancellation, body limits and private DNS remain
strict. These timestamps use the declared synthetic lab clock, while the run
actually occurred at 21:29 UTC.

The mounted PostgreSQL service establishes a baseline and one useful synthetic
change. Recipient response loss is recovered by the same delivery ID/digest;
recipient restart and one duplicate retry preserve exactly one useful row.
Service and PostgreSQL restart retain operation/event IDs and two source calls.
Stored fetched-body recovery preserves fetchedAt without refetch; a crash during
reading remains `unknown/lost_reply_no_body`, without refetch. The historical
H19 public partial-metrics/future observation is not promoted into useful output
or customer revenue.

The unchanged managed command reports `viteInvoked:false`, inventory SHA256
`6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5`.
The complete post-command 352-member emitted inventory was independently compared
as raw buffers against c4. Missing/extra/changed are all empty. Client source,
public assets, dist, homepage and publication receipt remain unchanged. The
runtime probe executes its reference and receives OS limits, stable launcher
identity and preserved PID, with activation HOLD/false.

The largest sampled command descendant tree was 620,372 KiB. The unchanged
acceptance helper separately sampled PostgreSQL/service/recipient at 316,892 KiB.
These samples are not a whole-host peak. Every sampled owned test child exited;
exited PostgreSQL zombies await the existing supervisor reaper. No native,
supervisor or independent helper was signaled.

Fresh evidence is in [evidence/result.json](evidence/result.json),
[complete commands and raw logs](evidence/run-2026-10-29T21-29-15.715Z/commands.json),
[caller receipt](evidence/caller.json), [all emitted members](evidence/public.json),
[input receipt](evidence/inputs.json), [source diff](evidence/source.diff) and
[full c4 ancestry](evidence/c4-ancestry.txt). The unmodified H31 helper keeps its
H31 schema label; the archived outputs under this H34 run are newly executed
bytes, not copied H31 evidence. The historical receiving documents are explicitly
retained as input references. Their original CI/build failures remain unchanged.

The initial summary-only assertion expected zero optional skips and refused
before writing its result. The actual machine-discovery command passed with its
existing opt-in skip; raw logs are unchanged and no test was weakened or rerun.
Cold installation reports six inherited npm audit findings; dependencies and
lockfile were preserved. No GitHub CI execution or acquisition-packet acceptance
is claimed here. Root owns that existing nonsecret packet.

For a fresh remote execution, use `node experiments/oct29-installed-clock-repair/run.mjs`.
The reusable installed acceptance command remains
`node experiments/oct29-receive-time-freshness/accept.mjs` with unchanged imports
and the fixture-selected `pgCluster.bin` for PostgreSQL restart.

Root's handoff is [HANDOFF.md](HANDOFF.md). This source/lab qualification does not
establish production receipt-time behavior, outside useful use or revenue.
