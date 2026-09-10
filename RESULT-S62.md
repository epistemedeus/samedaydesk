# S62 RESULT — issue-evidence recurring job

Branch: `codex/s62-issue-evidence-jobs-20260910`  
Base tip: `c295af075c86ab28fea075633e95934a776d006c`  
Node: v22.14.0 (locked)

## Buyer-useful job
Runnable `issue-evidence` recipe in existing SameDayDesk recurring-job-recipes pack:
- explicit public issue URL (+ optional immutable prior)
- provider-neutral observation + GitHub adapter
- bounded comment pages; per-source URL/id/updatedAt/retrievalStatus
- classifies edited (incl. same-length), deleted, reordered, omitted, partial, forbidden/rate_limited/unavailable/redirect_blocked/cancelled/oversize
- work/change brief keeps acceptance constraints; issue/comment text is untrusted evidence (never executed)
- no env-token inference; no auto wait-loop on Retry-After; no cost-amplifying retries
- free public API baseline remains available; packaging adds delta/prior/partial honesty

Public bug-report references (not customers / not willingness-to-pay):
- https://github.com/NousResearch/hermes-agent/issues/99533
- https://github.com/NousResearch/hermes-agent/issues/106904

## Tests
`npm run test:recurring-job-recipes` → **89/89 pass** (includes S62 + S37R regression).

## Live replay
Dated read-only replay of #99533 with maxCommentPages=2 → outcome `changed`, completeness `complete`, sources ok. Receipt under `/home/ubuntu/work/s62/receipts/s62-live-replay-latest.json`.

## Heavy cohort
Admitted **16** concurrent Grok 4.6 xhigh children. Process overlap (not request count): **16** processes, sum RSS ≈ **1.91 GiB**, ~10 GiB still available, PSI≈0. Children hit max-turns before file writes; Cursor integrated owned implementation/tests. Wave-2 skipped to preserve ≥25% credit reserve after readiness/probe usage (~39% used at final read).

## Exported commands
See `tools/recurring-job-recipes/README.md` and `/home/ubuntu/work/s62/receipts/cli-commands.md`.

## Non-goals honored
No new server/dashboard; no x402-url-extractor edits; no paid routes; no main merge/deploy; S56 source remains non-production.
