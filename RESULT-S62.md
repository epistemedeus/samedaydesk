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
`npm run test:recurring-job-recipes` → **89/89 pass** (includes S62 + S37R regression). Final re-run clock `2026-09-10T01:05:30Z`.

## Live replay
Dated read-only replay of #99533 with maxCommentPages=2 → outcome `changed`, completeness `complete`, sources ok. Receipt under builder VM `/home/ubuntu/work/s62/receipts/s62-live-replay-latest.json`.

## Heavy cohort (native grok-4.6 xhigh)
Admission (~10 GiB MemAvailable, 4 CPU, PSI≈0; credit ~39% used; 25% reserve held) → **16 then +9** (toward 32), not three children.

| Wave | Concurrent | Process-overlap sum RSS | Count | Notes |
| --- | ---: | ---: | ---: | --- |
| 1 | 16 | ≈1.91 GiB | 16 | max-turns advisory; Cursor owned impl/tests |
| 2 | 9 | ≈1.08 GiB | 9 | p17 exit 0 CLI commands; others max-turns |

Process overlap recorded separately from provider request counts. All children reaped before final. No new login/reset/paid API.

## Exported commands
See `tools/recurring-job-recipes/README.md` and builder receipt `cli-commands.md`.

```bash
node tools/recurring-job-recipes/cli.mjs --list
node tools/recurring-job-recipes/cli.mjs --recipe issue-evidence \
  --evidence-fixture tools/recurring-job-recipes/fixtures/issue-evidence/99533-base.json \
  --schedule weekly --clock 2026-09-10T01:00:00.000Z --max-comment-pages 2
node tools/recurring-job-recipes/cli.mjs --recipe issue-evidence \
  --issue-url https://github.com/NousResearch/hermes-agent/issues/99533 \
  --schedule once --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --max-comment-pages 2 --per-page 50
node tools/recurring-job-recipes/scripts/s62-live-replay.mjs
```

## Fresh quota / capacity (final)
- SuperGrok Heavy: **~40%** used; resets 2026-09-10 18:27 UTC (weekly)
- MemAvailable ≈11 GiB; PSI memory avg10=0; no OOM; no leftover grok children

## Non-goals honored
No new server/dashboard; no x402-url-extractor edits; no paid routes; no main merge/deploy; S56 source remains non-production. SDS push may 403 → EIN `handoff/s62` exact bundle only.
