# CW51 vendor-CI consumer review

Reviewed SameDayDesk PR126 source `4231cd3802c2a1f29284a7e6257c6c390047181f`
on `codex/cw51-vendor-ci-review-20260912`. Only this experiment directory changed.

Confirmed and repaired:
- Missing explicitly requested baselines now fail CI with hold-baseline.
- Failed/no-output kit invocations cannot reuse old successful artifacts.
  Every invocation reads fresh temporary output, then cleans that directory.
- Input/baseline overlap with output paths is refused, including symlinks and
  hard links; no baseline rewrite is permitted.
- Before-capture incompleteness and non-finite subtraction remain partial.
  Large finite baseline deltas are not rounded into infinity/null.
- The Python entry point delegates to the same Node decision path. Node was
  already required to execute the kit; SDK-free entry points now agree on
  refusal, relative paths, numeric meaning, and baseline comparisons.
- Explicit missing source files are errors. Caller-supplied kit directories
  are marked unverified, without borrowing released hash/version claims.
- Candidate selection cannot silently execute the released default. This run
  path remains released 1.4.0 only, pending its separate integration owner.

Evidence: original 14 tests passed; eight new root-cause regressions all failed
on original source before repair. Final acceptance is recorded in the external
RESULT-CW51.md and remote job `cw51-final-reviewed-20260912`.
The tests execute Node and Python entry points with the pinned cold 1.4.0
archive, preserve the real dated OpenAI pair and hostile missing-output-row
baseline, and inject failed kit processes and stale output.

The released archive hash remains
`2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
No engine, public file, archive, pin, frozen fixture baseline, or original
artifact snapshot was changed. No source pages were reacquired or reinterpreted.
No merge, deployment, spend, payment, credential change, or package publication.

Remaining: separate vendor-owner admission of new engine/archive versions;
these tests are owner QA and do not prove independent customer demand or a bill.
