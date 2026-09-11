# Current harness compare (parent re-run)

After parent compare/oracle fixes (`status: "ok"` vs CLI `ok: true`; lock-02 highlight strings that actually appear in `pin-delta.json`):

`node bin/h04-benchmark.mjs run` → **12 match, 0 mismatch, 0 unknown**. All 12 engine exit codes 0.

Vocabulary gaps in `VOCABULARY-GAPS.md` remain as **label findings** (engine `informational` vs oracle `unchanged` still aliased; route-diff still has no `status` key). They are not catalog compare failures after the re-run.
