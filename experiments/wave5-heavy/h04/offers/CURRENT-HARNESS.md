# Current harness compare (parent re-run)

After parent compare/oracle fixes (`status: "ok"` vs CLI `ok: true`; lock-02 highlight strings that actually appear in `pin-delta.json`):

`node bin/h04-benchmark.mjs run` → **12 match, 0 mismatch, 0 unknown**. All 12 engine exit codes 0.

Vocabulary gaps in `VOCABULARY-GAPS.md` remain as **label findings** (engine `informational` vs oracle `unchanged` still aliased; route-diff still has no `status` key). They are not catalog compare failures after the re-run.

## Offer language (lock-01)

`h04-lock-01` remains the strongest lockfile offer as a **pin-delta / operator-risk / integrity-change / resolved-source change** job, not as a vuln scanner. The SDS commit subject `fix(deps): update vulnerable locked dependencies` may be quoted as the commit message. The commit message claims vulnerable deps; H04 does not join advisories. A version bump is not a security vulnerability without an advisory / version-range join. Do not tell a buyer this engine proved a CVE.
