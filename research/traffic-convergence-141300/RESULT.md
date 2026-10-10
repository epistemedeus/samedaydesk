# Traffic convergence 141300

One writer. SameDayDesk observatory only. No listing, broadcast, customer message, spend, or deploy.

## Pins

| Item | Value |
| --- | --- |
| Pilot carrier | `367986b11e14012575649aed32f43f74f3adac84` |
| SameDayDesk baseline | `3db8220c9008bc315ab6e25a970bcf7ea3559312` |
| Branch | `codex/traffic-convergence-141300` |
| Run | `bc-e6fa0fb3-2b8e-45ec-96fb-11d5998b20fc` |
| Model name reported for this run | `grok-4.7` |
| Token total / charged cents | unknown (run identity did not include them) |

## What the package does

Existing MoltJobs stats, x402stats, and Smithery adapters stay the transaction, completion, and catalog planes. A new fixed adapter reads one public jobs page:

`GET https://api.moltjobs.io/v1/jobs?status=OPEN&limit=20&includeExpired=false`

It does not follow cursors, job detail, or `/v1/activity`. Titles, posters, budgets, and addresses are dropped. `projectPositioning` keeps job listings, task completion, transaction totals, and catalog presence apart. The only activity rank is purpose composition inside that open page, denominator `returned_rows`. `GET /api/observatory/positioning` and `observatory-capture.mjs position` expose the same cut. Core-only input still names useful-jobs 1.4.7 and withholds the rank.

Maintained capability cited: `samedaydesk.for-agents.useful-jobs.v1`, package `useful-jobs` 1.4.7, offline caller-supplied artifact jobs, `purchaseAuthority` false.

## Live capture

| Field | Value |
| --- | --- |
| captureId | `20261010T040538Z` |
| fetchedAt | `2026-10-10T04:05:38.820Z` |
| Requests in this capture | 4 |
| HTTP | 200 on all four |
| Capture errors | none |
| Polling / heartbeat | false |

| Source | Availability | Provider clock | Observed ok value used in the cut |
| --- | --- | --- | --- |
| moltjobs stats | ok | ok | created stock 122, ordinary created stock 60, all-purpose completed 57, ordinary completed 15, all-purpose volume 46.3 USDC, ordinary settled volume 42.3 USDC, escrow 3.8 USDC. Stats reconcile `60 + 62 = 122` state ok |
| x402stats | ok | ok | volume 947696.5848723006 USD / 30d. Organic volume is a provider heuristic |
| smithery_mcp | ok | ok | 19323 catalog registrations |
| moltjobs_open_jobs | ok | missing | 10 returned rows, all `PLATFORM_REFERRAL`, all `AUTOMATIC_FORUM_REWARD`, template slug `custom-v1`, `hasMore` false, exact useful-jobs skill matches 0 |

Rank 1 of 1: `purpose:PLATFORM_REFERRAL` 10 / denominator 10. Uncertainty on that rank: single capture, provider page order, not marketplace stock, not unique agents, not a conversion, other statuses and expired jobs unqueried, provider clock missing.

Decision: `meetsMaintainedExecution` `no_exact_overlap`. Inbound use `unobserved`. The open queue's observed mechanism is the platform referral token. The inference, marked as inference, is that stats documentation excludes that token from ordinary marketplace work and that useful-jobs does not execute forum-reward posts. The ordinary created stock of 60 is a different population and is not the open queue.

Next falsifiable measurement, not a listing: repeat the same fixed URL. The page claim is falsified if a later response adds another purpose token or an exact useful-jobs skill id. An identical repeat still does not prove inbound use. Inbound use would need a caller-supplied opaque SameDayDesk operation reference joined to a public job id.

Machine copies: `positioning.json`, `capture-summary.json`. Raw response excerpts are omitted from this directory.

## Request account

Nine public GETs, all HTTP 200. No failures. Under the 60-request cap.

Research reads before the capture clock, individual probe clocks not retained:

1. `GET https://api.moltjobs.io/docs-json`
2. `GET https://api.moltjobs.io/v1/jobs?status=OPEN&limit=5`
3. `GET https://api.moltjobs.io/v1/activity?limit=3` (3 rows; types seen were REJECTED, APPROVED, ESCROW_RELEASED; names and titles not retained)
4. `GET https://api.moltjobs.io/v1/jobs?status=OPEN&limit=20`
5. The same limit-20 URL once more, to confirm purpose tokens

Package capture at `2026-10-10T04:05:38.820Z`:

6. `GET https://api.moltjobs.io/v1/stats`
7. `GET https://x402stats.io/api/stats`
8. `GET https://api.smithery.ai/servers?pageSize=1`
9. `GET https://api.moltjobs.io/v1/jobs?status=OPEN&limit=20&includeExpired=false`

`/v1/activity` is not called by the adapter. x402scan was not called.

## Tests

`node --test` on the observatory scripts including `test-observatory-positioning.js`: 71 tests, 70 passed, 1 skipped, 0 failed. The skip is `OBSERVATORY_LIVE` unset, so that optional live runner stays unknown. The capture above is the separate one-shot live read.

Covered in the positioning tests: identifier drop, page-local rank, plane separation, core-only, adapter removal, stale, unavailable, partial, duplicate source, internal count conflict, oversized page, machine route, CLI, and a cold `position` process with cwd outside the checkout.

## Unknown, left unknown

- Inbound SameDayDesk use
- Open jobs in statuses other than OPEN
- Expired jobs (`includeExpired` stayed false)
- Whether a later page still matches this composition
- Buyer counts inside the x402 series (not used)
- Token spend and charged cents for this run
