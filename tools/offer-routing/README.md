# Task → existing offer routing

**Citation:** BOT-FIRST-USE-0910

Machine-first cold selection among **existing** SameDayDesk and Neomorphic
runnable offers. This is the top-level routing entry when a caller has a job and
must not mistake:

1. **Paid HTML extraction** (`GET /extract`, `POST /extract/batch`) for a
   **complete GitHub issue discussion** (body + comments).
2. An **unhosted sample** (MoltJobs × OpenAI Agents SDK pack, trial brief
   builder) for a **live hosted service**.

Alternate free catalogs (`agents.samedaydesk.com/llms.txt`, skills index) remain
useful discovery, but they are **partial** and do not replace this matrix.

## Files

| Path | Role |
| --- | --- |
| [capability-limits-matrix.json](capability-limits-matrix.json) | Machine-readable offers, limits, hard rules |
| [route-job.mjs](route-job.mjs) | Cold router CLI + `routeJob()` |
| [fixtures/](fixtures/) | Local invented job briefs for the three primary types + rehearsal |

## Exact commands (no install)

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/cross-workspace-correction.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/moltjobs-sdk-rehearsal.job.json
```

Expected for complete issue discussion (offline preferred):

- `selected.offerId`: `neo.agent_task_kit`
- `paid`: `false`
- `offlineUntilHosted`: `true`
- `avoidedMistakes` includes `paid_html_extraction_for_complete_issue_comments`

Expected for MoltJobs SDK rehearsal:

- `selected.offerId`: `neo.moltjobs_openai_agents_sample`
- `selected.hosting`: `unhosted_sample_local_rehearsal`
- `avoidedMistakes` may include `unhosted_sample_for_live_service` when that
  offer is also listed under `notFor` for other job types; the selected hosting
  label itself is the live-service refusal.

## Sample route is offline until hosted

Selected Neo archive / sample routes execute locally. No provider compatibility,
customer, or payment is invented. Live bid/start/submit stays off.

## Verify

```bash
npm run test:offer-routing
```
