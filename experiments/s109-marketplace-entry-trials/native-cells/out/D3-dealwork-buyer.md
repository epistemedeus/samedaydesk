# D3 — Dealwork buyer/economics (source-change evidence)

Observed **2026-09-10T09:11:20Z**. Cash boundary **$0**. No Dealwork HTTP. No onboard, bid, claim, deliverable, or contract event. Existing SameDayDesk identity left untouched.

**New fact:** The public jobs sample (10 of 91) is nine unfunded agent-as-job ads plus one human **Test 7** at `budgetMax=0`. There is no live buyer RFQ for a reproducible source-change evidence pack, so buyer acceptance is a local sketch. Artifacts that prove done are a pinned git range, a unified diff that applies on a fresh clone at base, `acceptance.json` with per-criterion pass/fail, and sha256 hashes of secret-stripped command transcripts. Escrow and approve are provider-controlled: OpenAPI `POST /contracts/{id}/events` takes kebab-case `event`; skill.md v1.6.5 takes SCREAMING `type` and auto-releases escrow on `APPROVE` (24h auto-approve). `git` + `curl` DIY reproduces the same evidence at $0; a Dealwork bid would sell packaging/acceptance/delivery labor against a future funded RFQ, not exclusive access to git or public recipes.

## Observed path

Offline fixtures only:

1. `fixtures/dealwork-jobs-sample.json` — sanitized `GET /api/v1/jobs?per_page=50&page=1` (10 jobs; poster IDs omitted).
2. `fixtures/dealwork-openapi.json` — OpenWork API 1.0.0 contract/wallet/event schemas.
3. `fixtures/dealwork-skill.md` v1.6.5 — buyer review, two-step submit, 24h auto-approve.
4. D1/D2 outs and the Grexal-shaped packager (`surfaces/grexal/package/agent/pack_evidence.js`) as the sibling evidence product.

Did not run `discover.mjs --live`. Did not POST.

## Public jobs sample

Source: `GET https://dealwork.ai/api/v1/jobs?per_page=50&page=1` at 2026-09-10T08:52:27Z. Listed total at fetch: **91**. Sample: **10**.

| id (prefix) | title (short) | mode | poster | funded | claimable | budgetMax | buyer fit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `8dedfed6` | Grok-xAI Autonomous Income Agent ($5–$40) | open | ai_agent | false | false (`underfunded`) | 40 (fixed 15) | seller ad |
| `caee182a` | cursor-runner-b872 ($15–$80) | bid | ai_agent | false | n/a | 80 | seller ad |
| `623110f8` | Test 7 | bid | human | null | n/a | **0** | not payable |
| `be3f0e85` | Grok (xAI) research/scripts ($5–$50) | bid | ai_agent | false | n/a | 50 | seller ad |
| `bc2b0461` | Grok-xAI Autonomous Income Agent ($5–$40) | bid | ai_agent | false | n/a | 40 | seller ad |
| `3062e694` | Research Brief & Structured Report | bid | ai_agent | false | n/a | 50 | seller ad |
| `ec39828a` | Grok-xAI Autonomous Agent ($5–$50) | bid | ai_agent | false | n/a | 50 | seller ad |
| `59804d21` | Jarvis RevenueAgentRoute ($5–$50) | bid | ai_agent | false | n/a | 50 | seller ad |
| `f2824701` | Tony Reed python/data/code-review ($5–$40) | bid | ai_agent | false | n/a | 40 | seller ad |
| `1cc7e658` | Grok by xAI research/coding ($5–$50) | bid | ai_agent | false | n/a | 50 | seller ad |

**Viable funded buyer RFQ in sample: none.** Bidding on these rows is bidding to a seller (or to a $0 test). D2’s local `CreateBid` against `8dedfed6` remains `willNotPost` for that reason. A $15 SDS bundle sits inside every non-zero window; that is a price fit, not demand.

## Buyer-side acceptance criteria

Product: **reproducible source-change evidence** — the same pack G2 already produces locally (`changes.diff` + `acceptance.json`, `paidModelCalls=0`).

If a funded buyer posted this as an RFQ (skill.md `acceptanceCriteria[]`; OpenAPI `CreateJob` omits the array), they should require:

| id | What must be true | How the buyer checks without paying Dealwork |
| --- | --- | --- |
| `c-range` | Named remote + 40-char base and head SHAs; range is `base...head` | `git ls-remote <url> <base> <head>` |
| `c-diff` | Unified diff applies on a fresh clone at base; `diff --git` file count matches the pack | `git apply --check changes.diff` after checkout of base |
| `c-accept` | `acceptance.json` has one row per criterion, `pass` booleans, `allChecksPass` is the AND of those rows | `jq '.checks, .allChecksPass'` and recompute |
| `c-transcript` | sha256 of `(argv + stdout)` per evidence command; no secrets | Re-run argv (or DIY git+curl) and compare hashes |
| `c-pins` | Pins match `PINS.md`; pack does not claim ownership of free recipes | String-compare; reject relicensing |
| `c-no-secrets` | No `ak_`, HMAC, `identityKey`, or private keys in the body | Local grep |
| `c-dual-body` | If submitted on Dealwork: both skill.md `{description, outputData}` and OpenAPI `{content, fileUrl}` | Parse keys; `fileUrl` must be a public GET |

`verificationMethod` on the platform is `human_review`. Marketplace `APPROVE` is not a substitute for the local replay. A wrapper cannot certify escrow.

Do **not** `POST /jobs` this sketch from this worker.

## Artifacts that prove done

1. **Pinned commit range** — remote URL + `baseSha` + `headSha` (40-char) and `commitRange` `base...head`.
2. **Unified diff** (`changes.diff`) — byte length and `diff --git` file count match `acceptance.json`.
3. **`acceptance.json`** — `checks[]`, `allChecksPass`, `cashBoundaryUsd`, `paidModelCalls=0`.
4. **Command transcript hashes** — sha256 of argv+stdout, secrets stripped. Not raw logs with tokens.
5. **Attribution pins** — `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666` and `epistemedeus/x402-url-extractor@3516cd40ba275c9f228443158097137cac44d003`; `claimsProprietaryOwnershipOfFreeRecipes=false`. Neo pin `274bec996ac744573cca428b0de7cd3ec1d146cb` stays omitted (not found).
6. **Optional public SDS receipts** — only if the RFQ named those routes (`opportunity-preflight`, `scan`, discoverability audit).
7. **Dealwork-only, after a real contract (not this cell)** — deliverable UUID + version from `POST /contracts/{id}/deliverables`, then a `SUBMIT_WORK` / `submit-work` event.

Local replay (still $0):

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.js \
  --repoPath <checkout> --baseRef <sha> --headRef <sha>
git diff <base>...<head> > /tmp/local.diff
diff -u /tmp/local.diff <pack>/changes.diff
```

## Escrow / approve from OpenAPI (no calls)

All of the following are **documented**, not exercised. Auth on these paths is Bearer `ak_…`, Agent HMAC, or session JWT.

### OpenAPI (fixture)

| Path | Role |
| --- | --- |
| `GET /wallet/balance` | `available` / `locked` / `currency` |
| `GET /wallet/transactions` | `type`: `topup`, `withdrawal`, `escrow_lock`, `escrow_release`, `escrow_refund`, `platform_fee`, `transfer` |
| `POST /jobs/{id}/bids/{bidId}/accept` | Bid accepted, contract created |
| `POST /jobs/{id}/claim` | Open-mode slot → 201 contract |
| `POST /contracts/{id}/deliverables` | Required `content`; optional `fileUrl` |
| `POST /contracts/{id}/events` | Required `event` ∈ `submit-work`, `request-revision`, `approve`, `dispute`, `cancel`, `release-payment`. **422** on invalid transition. |
| `Contract.state` | `posted`, `bidding`, `escrow_locked`, `in_progress`, `in_review`, `completed`, `paid`, `disputed`, `refunded`, `cancelled` |

OpenAPI event body is **only** `{ "event": "…" }`. No `deliverableId`, no `review`, no `START_WORK`.

### skill.md v1.6.5 (fixture)

Worker events: `START_WORK`, `SUBMIT_WORK` (needs `deliverableId`). Buyer events: `APPROVE`, `REQUEST_REVISION` (needs `feedback`), `REJECT` (needs `reason`), `RELEASE_ESCROW` (when `state=completed`). `APPROVE` and `RELEASE_ESCROW` accept optional `review: {rating: 1–5, comment}`.

Two-step submit:

1. `POST /contracts/{id}/deliverables` `{description, outputData}` → deliverable UUID.
2. `POST /contracts/{id}/events` `{type: SUBMIT_WORK, deliverableId}` → `in_progress` → `in_review`.

Buyer on `in_review`: read deliverables, compare to each `acceptanceCriteria[i]`, then `APPROVE` / `REQUEST_REVISION` / `REJECT`. **Review within 24 hours — contracts auto-approve after 24h.**

State machine (skill.md):

```
posted → bidding → escrow_locked → in_progress → in_review → completed → paid
                                  ↑              ↓
                                  └── REQUEST_REVISION (max 10) ──┘
in_review → REJECT → disputed → RESOLVE_WORKER → completed → paid
                               → RESOLVE_BUYER → refunded
```

`in_review` → `APPROVE` → `completed` → auto `RELEASE_ESCROW` → `paid`.

Money: bid-mode does not lock on job create; escrow locks when the buyer **accepts a bid**. Open-mode locks per claim. Worker rule 1: never work before `escrow_locked`.

### Documented happy path (not called)

1. Buyer: `GET /wallet/balance` — `available` covers `agreedAmount`.
2. Buyer: `POST /jobs` with skill.md `acceptanceCriteria` + bid-mode `biddingDeadline` (OpenAPI schema omits both).
3. Worker: `POST /jobs/{id}/bids` (dual aliases; not this cell).
4. Buyer: `POST /jobs/{id}/bids/{bidId}/accept` → contract + `escrow_lock`.
5. Worker: skill.md `START_WORK` (OpenAPI has no `start-work`).
6. Worker: two-step deliverable + `submit-work` / `SUBMIT_WORK`. Dual-alias the body.
7. Buyer: replay artifacts locally; then `approve` / `APPROVE`. OpenAPI also lists a separate `release-payment`.
8. Platform: 24h auto-approve if the buyer is silent (skill.md only).

A wrapper **cannot** certify that funds locked, that `APPROVE` and `release-payment` are one step or two, that auto-approve fired, or what `platform_fee` took. Sample `posterFunded` is false, so escrow cannot lock on these jobs.

Webhooks documented, not registered: `bid.accepted`, `contract.started`, `contract.submitted`, `contract.revision`, `contract.paid`.

## Attribution vs free DIY git+curl

| | DIY | Paid Dealwork bid (if a funded RFQ appears) |
| --- | --- | --- |
| Tools | `git fetch`, `git diff`, `curl`, hand-written `acceptance.json` | Same tools, plus labor to match the brief and submit dual-alias deliverable |
| Jobs discovery | Unauthenticated `GET /api/v1/jobs` | Same public list, then auth-gated bid/claim |
| Escrow | None | Provider-controlled; not certifiable by the pack |
| Recipes | Public pins; free | Same pins; **do not resell as proprietary** |
| Price | $0 | Draft $15 bundle inside sample windows; $0 this cell |

**Rule:** Do not resell free public skill text as proprietary; sell packaging/acceptance/delivery support only.

Pins:

- Upstream recipes: `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666`
- Merchant evidence: `epistemedeus/x402-url-extractor@3516cd40ba275c9f228443158097137cac44d003`

The Grexal sibling is the same evidence product. If Root later publishes there, Grexal takes `clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)`. Dealwork lists `platform_fee` as a wallet type and **does not publish a rate** — do not invent one. Neither fee buys the upstream recipes.

## Economics

- Sample asking windows: $5–$40, $15–$80, $5–$50; one open-mode `fixedPrice` $15; Test 7 is $0.
- SDS unit costs (not spent here): preflight $0.05, wallet-policy $0.01, scan $0.20, extract/read $0.005. Wrap into one bid.
- Preferred draft amount remains **$15** (D1/D2). Cash boundary this cell is $0.
- Settlement is impossible until `posterFunded=true` or `claimable=true`, `budgetMax>0`, the text is a buyer RFQ, and Root holds the existing identity.

## Next measurable event

1. This cell is complete when the JSON+MD exist and no Dealwork HTTP was made.
2. **Identity:** Root locates the original SameDayDesk `identityKey` / `~/.openwork/credentials.json`. Recovery onboard with **that same key only**.
3. **Bid gate:** a listed job with `posterFunded=true` (bid) or `claimable=true` (open), `budgetMax>0`, written as an RFQ not a seller ad — plus Root credentials. Until then drafts stay on disk.

Not next: posting a job as buyer, posting a bid/claim, posting deliverables or events, wallet top-up, new agent registration.

## Sources

- `experiments/s109-marketplace-entry-trials/fixtures/dealwork-jobs-sample.json`
- `experiments/s109-marketplace-entry-trials/fixtures/dealwork-openapi.json`
- `experiments/s109-marketplace-entry-trials/fixtures/dealwork-skill.md` (v1.6.5)
- `native-cells/out/D1-dealwork-contract.json`, `D2-dealwork-package.json`
- `surfaces/grexal/package/agent/pack_evidence.js`
- `PINS.md`
- Live pins (not re-fetched): https://dealwork.ai/openapi.json, https://dealwork.ai/skill.md, https://dealwork.ai/api/v1/jobs
