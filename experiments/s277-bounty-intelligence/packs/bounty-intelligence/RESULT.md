# S277 RESULT — bounty-intelligence pack

Branch: `codex/s277-bounty-intelligence-20260911`
Head: `8f15961330fd59ed7fcc2f61832a04343725f004`
Parent model: `grok-4.6` effort `xhigh` (native Grok Heavy; no API-key substitution)
Projected pack: `experiments/s277-bounty-intelligence/packs/bounty-intelligence/`
Transplant: `PACK-EXPORT.patch` (pack-root-relative) for neomorphic-io `packs/bounty-intelligence`
Publication host: `epistemedeus/samedaydesk` (neomorphic-io token 404)

## Outcome

Acceptance **green**. A useful agent can ingest bounded public listings, see
closed/stale/unfunded/lab/github rows **excluded** from available paid jobs,
rank remaining rows by user-adjustable **expected useful net return** and
**uncertainty**, and either select one genuinely claimable Frantic task with
prerequisites + why, or receive `no_genuinely_claimable_paid_job`.

Not a marketplace. `claimAuthority` is `none`. No merge, deploy, or pay.

## Commands

```bash
cd experiments/s277-bounty-intelligence/packs/bounty-intelligence
node --test tests/*.test.mjs
# 70 pass, 0 fail

node bin/bounty-intelligence.mjs adapters
node bin/bounty-intelligence.mjs report \
  --fixture-dir fixtures/labelled \
  --now 2026-09-11T15:00:00.000Z \
  --html html/bounty-compare.html
# selected frantic nativeId 129, net 4.48, uncertainty 0.45

node bin/bounty-intelligence.mjs capture --out receipts/live-capture --limit 5
# moltjobs/frantic/github/neomorphic HTTP 200; moltbook fetch failed (NXDOMAIN)
```

## Tests

| Suite | Result |
|---|---|
| `node --test tests/*.test.mjs` | **70/70 pass** (parent + C1–C6) |
| Deterministic clock | `2026-09-11T15:00:00.000Z` |
| Live archive replay | `tests/live-archive.test.mjs` pass |
| HTML component | no `<nav`, no homepage; selected or truthful no-match |

## Sources (keyless)

| Adapter | Vendor wrap | Live 2026-09-11 |
|---|---|---|
| moltjobs | `moltjobs_forum_list` | 200, 5 records (forum/referral; not ranked as paid jobs by default) |
| frantic | `frantic_board` | 200, claimable funded open bounties |
| github-issues | `github_issue_comment` | 200, funding unknown |
| neomorphic-schedule | (lab) | 200, `neomorphic.bounty-schedule.v1` — not paid agent jobs |
| moltbook | inaccessible | NXDOMAIN / fetch failed; no listings invented |

Fixture report select (labelled, `--now 2026-09-11T15:00:00.000Z`):
Frantic **129** — expected useful net return `4.48`, uncertainty `0.45`.
Prerequisites include identity + paid eligibility. Pack never calls `POST /v1/claims`.

Live-capture select (`receipts/live-select.json`, now `2026-09-11T15:30:00.000Z`):
same Frantic **129**, 5 available paid jobs, 21 observed rows.

## Native child slices (6, not expanded)

Admission 2026-09-11T15:38:22Z: mem available 65.25%, disk free 96.27%, 4 CPUs.
Completion 2026-09-11T15:45:53Z: mem available 65.3%, disk free 96.26%.
Node test workers ≠ Heavy concurrency. No watcher.

| Child | Slice | Exclusive | Duration | Tests |
|---|---|---|---|---|
| C1 | vendor-shape audit | `tests/c1-vendor-shape.test.mjs` | 198s | 7/7 |
| C2 | rank policy | `tests/c2-rank-policy.test.mjs` | 353s | 6/6 |
| C3 | experience/events/interop | `tests/c3-experience-events.test.mjs` | 200s | 7/7 |
| C4 | bounded live probes | `receipts/children/c4-probes.json` | 140s | 3/3 |
| C5 | HTML renderer | `tests/c5-html.test.mjs` | 144s | 5/5 |
| C6 | pack export + interop contract | `scripts/export-pack.mjs` | 385s | 4/4 |

Peak simultaneous native children: **6**. No 12/18/24 expansion (no extra distinct ready slices; reserves held but unused).

Parent fix **C2-D1**: `cmpDecimal` now orders signed expected-net strings so high-effort negative nets still sort 129 above 130. Regression in `tests/rank-select.test.mjs`.

## Resource cohort

| When | mem available | disk free |
|---|---|---|
| parent-start 15:24:34Z | 65.39% | 96.26% |
| child admission 15:38:22Z | 65.25% | 96.27% |
| completion 15:45:53Z | 65.30% | 96.26% |

## Boundaries

- No merge / deploy / public offers / payments / wallet custody
- Cash banked 8.105 USDC is not profit; 0.10 USDC low-reward hypothesis unused
- Homepages and global nav untouched
- firstDollar / walletless stay `unknown` (sources do not state those fields)
- Self-reported experience ≠ verified completion ≠ verified payout
- Board marketing totals and GitHub reactions are not demand
- Interop v0: opaque `taskId`, immutable `termsVersion`, atomic decimal reward strings

## Browser

Standalone `html/bounty-compare.html` is a pack page component, not a site route.
Verified by CLI render + HTML tests (document, no nav, selected/no-match, embedded JSON).
No interactive browser driver was available in this session.
