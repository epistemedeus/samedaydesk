# RECEIPT — W5-H04 offers child

Owned path: `experiments/wave5-heavy/h04/offers/`  
Parent session: `03efef00-6fd3-4435-b2d1-1b32a46661b8`  
No commit from this child. Did not edit `examples/`, `src/`, `bin/`, `inventory/`, `test/`.

## Wrote

| File | Role |
| --- | --- |
| `EVIDENCE-BINDINGS.json` | 12 bindings (one object per example id) |
| `CANDIDATES.md` | 3 strongest useful-job offers |
| `VOCABULARY-GAPS.md` | literal token mismatches |
| `RECEIPT.md` | this file |

## Engine SHAs (read-only; not re-run here)

| Engine | SHA | Worktree |
| --- | --- | --- |
| w4-json-schema-webhook-drift | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | `/tmp/w5-h04/ro-w4-schema` |
| w4-lockfile-pin-delta | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `/tmp/w5-h04/ro-w4-lockfile` |
| w4-route-table-diff | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `/tmp/w5-h04/ro-w4-routes` |
| w4-page-change-offline-job | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | `/tmp/w5-h04/ro-w4-pages` |
| sds52-paid-useful-jobs (job api-upgrade-brief) | `aeef964fa188443078958d9d6d393afae1d542ee` | `/tmp/w5-h04/ro-sds52` |

Actual artifacts: each `examples/**/actual-engine.json` plus `/tmp/w5-h04/h04-child-*-runs/` and `experiments/wave5-heavy/h04/runs/`.

## Candidates (3)

| id | Why |
| --- | --- |
| h04-lock-01 | Operator must review three version+integrity+resolved pin-deltas (`concurrently`/`qs`/`shell-quote`); engine `actionable`, 3 changed / 99 omitted. SDS commit subject claims vulnerable deps; H04 does not join advisories and is not a CVE proof. |
| h04-schema-01 | Draft 04→06 `exclusiveMinimum` boolean→number breaks boolean emitters; engine `actionable`, 1 used-path type-change. |
| h04-page-03 | `/x402/verified` inspection rule becomes 7-day CDP Bazaar freshness; title/h1 unchanged. Page-change `changed`; same SHAs, route-diff identity 0. |

## Vocabulary gaps

1. schema-02/03: engine `informational` vs oracle `unchanged` (harness aliases to match).
2. route-01/03: engine has no `status` (`ok: true`); oracle `status: "ok"` → harness `unknown`.
3. page engine key is `verdict`, not `status` (harness still matches).
4. lock-02 harness mismatch on highlight `ms@2.1.3 integrity-only` vs `changeKinds: ["integrity"]`; status matched.
5. schema no-break briefs do not echo used pointers; `example.json` highlights include `/ref`… and `custom_properties` / `no consumer action`.
6. example engine id `sds52-api-upgrade-brief` vs inventory `sds52-paid-useful-jobs`.
7. schema-02 `kind=change` vs `expectedStatus=unchanged`.
8. lock-02 markdown truncates integrity SRIs.

## Harness compare (runs/run-summary.json)

match: schema-01, schema-02, schema-03, lock-01, lock-03, route-02, page-01, page-02, page-03  
mismatch: lock-02 (highlight)  
unknown: route-01, route-03 (missing status)

## Language (lock-01)

H04 is not a vulnerability scanner. `h04-lock-01` is a pin-delta / operator-risk / integrity-change / resolved-source job. Quote the SDS subject `fix(deps): update vulnerable locked dependencies` as a commit message only. See `offers/LANGUAGE.md`.

## Next owner

Parent / FEATURE-MAP + tests: keep informational↔unchanged as a documented alias, not a silent pass; do not invent route `status`. Do not treat lock-02 harness mismatch as an engine crash. Do not tell a buyer this engine proved a CVE.
