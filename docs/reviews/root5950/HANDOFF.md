# ROOT5950 source handback

Qualified source: `47a68a49384f97aaad4700feb11f5d0a650e8bf0`; tree `818ae4ba83116713bfa5df4aabf465d57c4c6a14`. Base is exact installed
`f629597d9e865bd6709d4b10d96a9905cc9ea3c3`. Same admitted branch
`codex/root5950-mcp-refusal-reasons-20261024`; canonical origin remains
`https://github.com/epistemedeus/samedaydesk.git`. Frozen Pilot input is
`4f5124633d2448acc7fbdf0bee07842f1e26012d`; admission/input hashes are in
[evidence/inputs.json](evidence/inputs.json). The source checkpoint committed
at 11:20 UTC, before the 11:22:05 bound. This handback adds documentation only.

The exact protected consumer had outcome and browse categories but no refusal
cause. This extends its existing `mcpOutcomes` map with fifteen allowlisted
producer reasons and optional `refusalObservedFrom`; no new tracker, method/source
label, dependency or service. The summary distinguishes compatibility refusals,
unknown dispatch, required input, unverified license and tool/handler boundaries.
`tool_error` and `license_unverified` deliberately leave their inner cause
unknown. Old observations remain unknown without backfill. The seeded six-error
history in tests is a fixture, not a production read or historical diagnosis.

Only the two authorized machine failure contacts change to `contact@neomorphic.io`.
Exact f629 admission/parser/route response/status parity passes, including those
two explicit text exceptions and unchanged human Stripe-return GET. Tests count
license/site calls and preserve notifications, suppressed replies, disconnects,
duplicate-callback protection and existing counters. Human assets, sender defaults,
authority, prices and the lock are source-unchanged; no frontend build or emitted
asset/installed release claim is made.

| Serial gate | Result |
| --- | --- |
| `npm run test:pulse -- --test-concurrency=1` | 80 pass, exit 0 |
| `npm run test:mcp -- --test-concurrency=1` | 46 pass, exit 0 |
| `npm run test:mcp-refusals` | 19 pass, exit 0 |
| Existing source-outcomes selection | 7 pass, exit 0 |

All selected runs have zero failures, skips or cancellations. Exact commands,
environment and full final TAP logs are in [evidence/validation.json](evidence/validation.json).
Three companion Python-adapter cases were not selected: their external checkout/
venv is absent, and no dependency was added. They are explicitly listed there
and are not claimed. The new mounted HTTP/real-PG path independently qualifies
this change. No unrelated whole-suite replay was used to inflate counts.

Retained [baseline](evidence/baseline.tap): 0/1 at unchanged f629, missing the new
diagnostic decision. [Development failures](evidence/failures.json) retain the
45/46 source-marker assertion, rejected NODE_OPTIONS invocation and 4/5 baseline
loader failure, their corrections and original-log hashes. Self-review retained
all inventory assertions, separated concurrent batch reason contexts, checked
fixed SQL/JS key parity, clarified old rollout prerequisites, and added a fresh
old-producer payload after migration.

Disposable PostgreSQL 16.15 receives actual mounted MCP → observer → WAL/store →
protected summary, including distinct refusals, a normal empty browse result,
caught/uncaught failures and suppressed notification. Old 0008 rejects new data
atomically with permanent backoff and identical queued IDs/deltas. Rerunnable
0009 preserves old rows/receipt hashes, accepts a fresh old payload and drains the
exact queue. An apply-then-transport-error recovers in a fresh Node process once;
same-ID/same-delta is idempotent and conflicting/unknown data is rejected. Actual
f629 readers accept old snapshots/WAL and reject new ones even after drain.

Root owns independent receiving and any future release. Apply additive 0009
**after existing 0008 and before this producer**, run its schema-owner read-only
verification, then release compatible readers/producer and receive the installed
epoch. Rollback must retain compatible DB/WAL readers and SQL, even after drain;
never strip fields, down-migrate, replay tools or roll back the whole old binary.
The full contract and taxonomy are in [Pulse README](../../../server/lib/pulse-store/README.md).

Next source qualification, using the existing binary overrides when needed:

```bash
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= NODE_OPTIONS=--max-old-space-size=384 \
  npm run test:mcp-refusals
```

Node 22.23.4/npm 10.9.9 and unchanged locked dependencies were used. Missing PG
capability was extracted into owned scratch; no system PostgreSQL service was
installed. Final sampled admitted-supervisor/descendant RSS peak was 711,208 KiB
(maximum observed across final qualifying runs 736,192 KiB), below 2,621,440 KiB.
Node heaps were bounded at 384 MiB; zero model children. Sampling is not a hard
memory-limit proof. Commands ended and clusters stopped; no running owned PG/test
process remains. Stopped PG daemon zombies belong to the admitted supervisor's
canonical reap lifecycle; no other writer/job was signaled or changed.

Export is a local same-branch Git bundle with exact head/tree readback in its
sidecar receipt; no remote push, PR, production database/provider/account/payment/
signer/deploy/mail or public exchange occurred. Root receives source/tests before
managed integration. No installed traffic, caller identity/session/peer receipt,
acceptance or revenue follows from this qualification. After a separately received
installed epoch, actual future reasons should choose a concrete caller journey
to repair; reconsider/remove the dimension if it remains unhelpful.
