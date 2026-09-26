# VF05 result

Implemented the portable optional participation layer: versioned negotiation and
closed envelope schema, permission-scoped reproducer builder, tenant-keyed
semantic identity, JSON/HTTP/tool/CLI adapters, explicit resumable interactions,
and narrow VF02/VF04 ports. Original service results and paid/public surfaces are
preserved. Concrete source, types, examples and tests are in this module.

Branch: `codex/visitor-participation-20260926`. All committed changes are inside
`scripts/visitor-foundry/participation/`. Native Astra ran on the assigned remote
Cursor VM (`cursor`, Node v22.22.2), directly launched by Root. Existing inherited
Git authentication pushed checkpoints cbb3d9e and 50389a2 before broad validation.
No subordinate workers, deployments, shared runtime changes or new login.
VF04A's checkout and shared foundation source were not changed.

## Reuse and authority

Actual VF01 resolve/createGap decide gaps. Actual VF02 schema/API/store provide
commands, grants, leases, fencing and durable replay. Existing correspondence
transport bounds/origin rules and contributor-session-grant reconciliation/file
patterns are reused; no second cell store or earned-work authority exists here.
Contributor-desk hash terms and public projection, plus maintained preflight
engine compatibility, are imported. VF03 retains admission/promotion authority.
The proposed VF04 port is contract-tested injection, not a combined hosted rollout.

## Remote validation

| Check | Result | Evidence |
| --- | --- | --- |
| Participation focused tests | 46 passed | `evidence/focused-final.tap` |
| Separate real HTTP/PostgreSQL journeys | 3 passed | `evidence/pg-final.tap` |
| Contributor session grant | 34 passed | `evidence/session-grant.tap` |
| Contributor desk | 59 passed | `evidence/contributor-desk.tap` |
| Terms lifecycle | 38 passed | `evidence/terms-lifecycle.tap` |
| Capability preflight | 35 passed | `evidence/preflight.tap` |
| Capability market | 26 passed | `evidence/capability-market.tap` |
| VF01 resolver regressions | 50 passed | `evidence/vf01.tap` |
| Standard repository build | 81 pages; exit 0 | `evidence/build.log` |
| Correspondence build, owned syntax, TypeScript declarations, JSON Schema | Passed | `evidence/service-build.log`, `evidence/types.log`, `evidence/schema.json` |
| Reproducible sentinel privacy check | Passed; zero unlisted getter invocations | `evidence/privacy.json` |

291 passing tests, zero final failures/skips. PG coverage includes real VF01
miss-to-VF02 fixture round trips, separately forked HTTP embedding, cold ordinary
discovery from the actual built document, cold CLI reconciliation, server SIGKILL/restart
and checkpoint recovery, every mutation's lost-ACK replay, exactly-once durable
transitions, concurrent claims, stale revision/fence, cross-tenant denial,
reader denial and revoked grants. Focused tests cover incomplete coverage,
unknowns, auth/outage/quota distinctions, decline, stale terms, forged hints,
oversized/nested hostile payloads, redirects, stalled/empty responses and unknown
cost. Original result/error/stream/CLI bytes remain unchanged.

Early failed receipts are retained: `focused-initial.tap` used undefined fields
in a strict VF01 fixture; `pg-initial.tap` incorrectly expected an exact historical
retry to conflict; `focused-permission-initial.tap` expected an older error code.
Fixtures were corrected, and the real replay assertion retained. Final review
also hardened optional failure isolation, explicit permission, file read bounds,
and complete decline-envelope disclosure. No shared tests were weakened.

## Measured examples and receiving limits

Two different hosts import and invoke exact maintained source: preflight's Node
engine probe and contributor-desk's walletless public task projection. Original
and later synthetic tasks were frozen at cbb3d9e before running; exact dataset
and source digests are in `evidence/reuse.json`. Later checks pass for both assets.
Original unsupported tilde syntax and missing funding freshness remain unresolved;
reporting a gap does not falsely claim completion or publication.

Scripted sharing overhead: preflight two choices, 242 projection bytes, two
fields; desk one choice, 173 bytes, zero input fields. Human effort, validation
and maintenance costs remain unknown. These owner-controlled checks establish
source reuse and mechanics, not adoption, efficiency, independent demand or
revenue. No new capability was accepted/published by VF04 in this task.

Follow [HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md) for exact APIs, ownership,
commands, artifact/terms bindings, host telemetry, receiving race/restart tests
and release boundaries. Heavy must wire the accepted VF04A host methods and
transactional terms/authorization. The disposable VF01-to-VF02 projection stays
test-only; no production gap mapper or runtime was duplicated.
