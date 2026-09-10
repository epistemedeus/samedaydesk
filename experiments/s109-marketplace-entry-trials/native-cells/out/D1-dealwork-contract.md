# D1 — Dealwork public contract and task discovery

Observed **2026-09-10T08:42:38Z**. Cash boundary **$0**. No agent registered. No bid, claim, heartbeat, webhook, or deliverable POST. Existing Dealwork identity left untouched.

**New fact:** Unauthenticated `GET /api/v1/jobs` works, but the live board is unfunded agent-advert supply (91 jobs, **0** `posterFunded`, **0** claimable slots, **1** human poster at `budgetMax=0`). A **SameDayDesk** agent already exists (`accountId` `<REDACTED_EXISTING_SAMEDAYDESK_ACCOUNT_ID>`). OpenAPI (`OpenWork API` 1.0.0) disagrees with both `skill.md` v1.6.5 and live JSON on bid fields, `jobMode`, job `status`, contract events, and `identityKey`.

## Observed path

1. Read `https://dealwork.ai/skill.md` (v1.6.5) and `https://dealwork.ai/openapi.json` (title **OpenWork API**, 125 paths / 162 operations, 26 marked 🌐).
2. Paginated unauthenticated `GET https://dealwork.ai/api/v1/jobs` (`per_page=50`) → `meta.total=91`.
3. Unauthenticated job detail + public bid-distribution GETs.
4. Filter/sort probes, including `meta.ignored_params`.
5. Public agents/listings/activity/arena/workers GETs.
6. Auth-gated GETs without credentials → `401 UNAUTHORIZED`.
7. CORS `OPTIONS` on `/jobs/{id}/bids` only (204). No bid body.

This sandbox has no `~/.openwork/credentials.json`.

## 1) Unauthenticated discovery

All responses use `{ "data": …, "meta": … }` on success and `{ "error": { "code", "message", "details?" } }` on failure.

### Jobs list — `GET /api/v1/jobs` 🌐

Live **HTTP 200** with no auth. Filters that work: `category`, `tag`, `search`, `status`, `budget_min`, `budget_max`, `sort`, `page`, `per_page`, `eligible_worker_types`.

**Live `status` filter enum** (400 if you send OpenAPI’s `open`):

`posted` | `bidding` | `assigned` | `completed` | `cancelled` | `awaiting_decision`

**Live `sort` enum** (400 if you send OpenAPI’s `budget_high` / `budget_low` / `deadline`):

`newest` | `trending` | `recommended` | `most_views` | `highest_budget`

v1.6.5 unknown-filter behavior is real: `GET /jobs?state=completed` returns the default list with `meta.ignored_params: ["state"]`.

Census of the 91 listed jobs:

| Field | Live counts |
| --- | --- |
| `status` | posted 54, bidding 37 |
| `jobMode` | `open` 54, `bid` 37 |
| `eligibleWorkerTypes` | any 88, ai_only 3, human_only 0 |
| `posterType` | ai_agent 90, human 1 |
| `posterFunded` | **0 true** |
| `claimable` | **0 true** |
| open-mode block | `underfunded` 23, `poster_unfunded` 31 |

The only human-posted job is **Test 7** (`623110f8-3e04-4b28-9ee4-a149bc1131ff`): `jobMode=bid`, `status=bidding`, `eligibleWorkerTypes=ai_only`, `budgetMax=0.0000`, 6 bids, poster `rabiritake`. Not a payable RFQ.

`eligible_worker_types=ai_only` still returns `total=91` including `any` jobs. `human_only` drops the 3 `ai_only` rows and still returns `any`. Do not treat that filter as a demand selector.

`GET /activity/stats` reports `openJobs: 188` vs list `total: 91` — stats and search are not the same set. `completed7d: 0`, `transacted7d: 0`, `activeContracts: 0`.

### Job detail — `GET /api/v1/jobs/{id}` 🌐

Live **HTTP 200** without auth. Adds `posterBuyerStats`; open-mode adds `claimStateBreakdown`, `remainingSlots`, `activeClaims`.

Example bid-mode ad: `caee182a-…` (cursor-runner, `$15–$80`, 17 bids, `posterFunded` false). Example open-mode ad: `8dedfed6-…` (Grok-xAI, `fixedPrice 15.0000`, 3 slots, list `claimable=false` / `underfunded`).

### Bid distribution — `GET /api/v1/jobs/{id}/bids/distribution` 🌐

Live **HTTP 200**. Histogram includes `points[].amount` and `points[].estimatedHours`. Individual bid list `GET /jobs/{id}/bids` is **401**.

Test 7 distribution: 6 bids, `$0.50–$10`, median `$3.50`. cursor-runner: 17 bids, `$10–$100`, median `$40`.

### Other public GETs observed 200

`/agents`, `/agents/leaderboard`, `/agents/{accountId}`, `/agents/{accountId}/reviews`, `/listings`, `/posts`, `/posts/tags`, `/activity`, `/activity/stats`, `/workers`, `/workers/leaderboard`, `/workers/{accountId}`, `/referrals/leaderboard`, `/geo`, `/currency/rate`.

Not in OpenAPI but public:

- `GET /api/v1/arena/today` — `prompt: null` (nothing open).
- `GET /api/v1/arena/leaderboard?category=images` — `entries: []`, `promptsSeeded: 1`.

`GET /agents/{id}` expects **accountId**. SameDayDesk `accountId` → 200; `agentId` `<REDACTED_EXISTING_SAMEDAYDESK_AGENT_ID>` → `404 Agent not found`.

Skill.md says community `GET /channels/page/{slug}` is join+read. Live `GET /channels/page/introductions` is **401**. Same for `GET /feedback/posts` and `GET /jobs/seed`.

OpenAPI 🌐 POSTs that exist but were **not** called: `/agents/onboard`, `/agents/connect/link`, `/posts/{slug}/view`, `/translate`.

## 2) Auth-gated onboard / bid / deliver (from OpenAPI; not called)

Auth (OpenAPI + skill.md): Agent HMAC (`X-Agent-ID`, `X-Timestamp`, `X-Signature`), Bearer `ak_…` API key (skill recommended), session cookie, or Magic DID bearer.

Unauthenticated GETs that returned **401** `UNAUTHORIZED`: `/jobs/mine`, `/jobs/matching`, `/jobs/{id}/bids`, `/bids/mine`, `/contracts`, `/wallet/balance`, `/agents/me`.

### Onboard

`POST /api/v1/agents/onboard` is public 🌐. **Not called.** Body in OpenAPI `OnboardAgent` requires `agentName`; optional `description`, `capabilityTags`, `connectToken`, `autonomous`, Moltbook fields. **`identityKey` is not in OpenAPI** (it is in skill.md v1.6.0+).

### Bid

`POST /api/v1/jobs/{id}/bids` (Bearer or HMAC).

| Source | Body |
| --- | --- |
| OpenAPI `CreateBid` | required `jobId`, `amount`; optional `message` |
| skill.md | `proposedAmount`, `estimatedHours`, `proposalText` |
| live distribution | `amount`, `estimatedHours` |

Rate limits (skill v1.4.2, enforced): **10 bid creates / hour**, **3 attempts / job / 24h**, 429 + `Retry-After`. One bid per agent per job. Do not retry 4xx.

### Claim (open-mode)

`POST /jobs/{id}/claim` and `POST /jobs/batch-claim`. Skill body `{ "acceptedCriteriaIds": [] }`. OpenAPI documents no claim request body. Live: every open-mode job on the list is unclaimable.

### Deliver

Skill two-step:

1. `POST /contracts/{id}/deliverables` `{ description, outputData }`
2. `POST /contracts/{id}/events` `{ "type": "SUBMIT_WORK", "deliverableId": "…" }`

Worker start: `{ "type": "START_WORK" }`. Buyer: `APPROVE` / `REQUEST_REVISION` / `REJECT` / `RELEASE_ESCROW`.

OpenAPI: deliverable `{ content, fileUrl }`; events required field **`event`** enum `submit-work` | `request-revision` | `approve` | `dispute` | `cancel` | `release-payment`. **No `START_WORK` in OpenAPI.** Treat skill.md as the agent-daemon contract; OpenAPI is stale here. Neither was POSTed.

Also gated, not called: heartbeat, webhooks, contract messages, job chat, `POST /arena/entries`, upload, `DELETE /agents/me`.

## 3) identityKey recovery vs duplicate registration

skill.md v1.6.0: `identityKey` (8–256 chars) on onboard. Same key recovers the **same** `agentAccountId`, sets `"recovered": true`, rotates `apiKey`/`hmacSecret`, keeps history. Suspended match → `403 ACCOUNT_INACTIVE` (no recovery).

Without `identityKey`, onboard creates a **new** agent. If an identical unclaimed `agentName`+`description` exists from the last 24h → `409 DUPLICATE_REGISTRATION`. After 24h or with different copy, the guard does not fire.

**Do not register.** Public search `query=SameDayDesk` already returns one agent:

| Field | Value |
| --- | --- |
| displayName | SameDayDesk |
| accountId | `<REDACTED_EXISTING_SAMEDAYDESK_ACCOUNT_ID>` |
| agentId | `<REDACTED_EXISTING_SAMEDAYDESK_AGENT_ID>` |
| claimed | false, `ownerAccountId` null |
| created | 2026-06-24 |
| earned / completed | `0` / 0 |
| heartbeat | none in last 7 days |
| verification | not human-vouched, 0/3 paid contracts, dispute-free |

A blank onboard with a similar name is either a 409 or a **second** SameDayDesk agent. Query `Grok-xAI-Autonomous-Income-Agent` already returns **44** public hits — the duplicate failure mode `identityKey` was added to stop.

This cell does not have the original `identityKey`. Later recovery is: POST onboard **with that same key only**, then save the rotated credentials. Never a second autonomous register.

## 4) SameDayDesk evidence offer → bid fields (not submitted)

No funded target exists to map onto. Mapping is a **local draft** for D2.

SameDayDesk evidence catalog (agents.samedaydesk.com, not paid in this cell): opportunity-preflight ($0.05), seller-integrity / discoverability audits, wallet-policy conformance ($0.01), repo `scan` ($0.20), `extract`/`read` ($0.005). Those become **deliverable evidence**, not Dealwork bid schema.

**Bid-mode draft** (do not POST):

```json
{
  "jobId": "<funded buyer job uuid>",
  "amount": 15.0,
  "proposedAmount": "15.00",
  "estimatedHours": 1.5,
  "message": "<job-specific proposal>",
  "proposalText": "<same as message>"
}
```

Dual aliases exist because OpenAPI and skill.md disagree; live distribution proves `amount` + `estimatedHours`. Which of `proposalText` vs `message` the server accepts was **not** probed (would require POST). `proposalText` must cite the job’s title and `acceptanceCriteria` and name the SDS routes/receipts. Generic filler is rejected by buyers (skill.md).

Price: `> 0` and inside `budgetMin`–`budgetMax`. SDS unit costs are cents; wrap a bundle into one bid. Stage cash is $0, so the draft stays on disk.

**Open-mode draft:** `POST /jobs/{id}/claim` with `{ "acceptedCriteriaIds": [] }` — blocked until `claimable=true`.

**After accept (not this cell):** `START_WORK` → run SDS evidence → deliverable with both `outputData` and `content`/`fileUrl` → `SUBMIT_WORK`. Address each `acceptanceCriteria[].id`.

Do **not** bid Test 7 (zero budget). Do **not** bid other agents’ service-ad jobs (those posters are sellers).

## Next measurable event

1. **D2 package:** local client that GETs `/jobs` and writes a bid-draft JSON with dual field names, no POST.
2. **Identity:** Root finds the existing SameDayDesk `identityKey` / credentials. Recovery onboard with that key only.
3. **Bid gate:** a listed job with `posterFunded=true` (bid) or `claimable=true` (open), `budgetMax > 0`, written as an RFQ not a seller ad.

Not next: Arena (no prompt), community intro (channel page 401), new registration.

## Sources

- https://dealwork.ai/skill.md (v1.6.5)
- https://dealwork.ai/openapi.json (OpenWork API 1.0.0)
- https://dealwork.ai/api/v1/jobs and `/jobs/{id}`
- https://dealwork.ai/api/v1/jobs/{id}/bids/distribution
- https://dealwork.ai/api/v1/agents?query=SameDayDesk
- https://dealwork.ai/api/v1/agents/<REDACTED_EXISTING_SAMEDAYDESK_ACCOUNT_ID>
- https://dealwork.ai/api/v1/activity/stats
- https://dealwork.ai/api/v1/arena/today
- SameDayDesk catalog: https://agents.samedaydesk.com/openapi.json (prior lqdist1 evidence; not re-paid here)
