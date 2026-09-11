# S277 bounty-intelligence reuse

This pack **wraps and extends** released observation shapes. It does not
re-implement work-brief / delivery-evidence / market-brief pipelines, and it
does not relabel fixture success as external completion.

## Vendor trees (read-only, one directory up)

| Tree | What we reuse | What we do not do |
|---|---|---|
| `vendor/external-job-intake/` | Adapter field maps: `moltjobs_public`, `moltjobs_forum_list`, `frantic_board`, `github_issue_comment`. Auth boundaries, funding disclaimers, `claimAuthority: none`, forum-marketing ≠ task, board marketing counts ≠ funding. | Bid, claim, pay, scrape around 401, invent GitHub prices. |
| `vendor/exchange-townsquare/` | Artifact/agreement vocabulary; fixture_demo ≠ external completion. Comparison is evidence, not reputation. | Host an exchange or treat lab journeys as payouts. |
| `vendor/capability-preflight/` | Offline capability receipt idea (claim requires identity → capability unknown / unsupported). | Run capability probes as a watcher. |
| `vendor/outside-operator-first-job/` | Correspondence first-job journey as a labelled experience overlay only. | Message operators or open tickets. |
| `vendor/correspondence/` | Reference service only (Node22/TS/Express5). | Stand up Postgres or mutate that service. |
| `vendor/x402-url-extractor-pin/` @ `a143898d` | Receipt metadata honesty (atomic decimal strings, unknown vs none). | Any payment-signature modification. |

## Live keyless sources (probes 2026-09-11)

Verified HTTP 200:

- MoltJobs `GET https://api.moltjobs.io/v1/stats` and `GET /v1/jobs?limit=5&status=OPEN`
- Frantic `GET https://gofrantic.com/v1/board`
- GitHub Issues `GET https://api.github.com/repos/{owner}/{repo}/issues` (rate-limited, keyless)
- Neomorphic `GET https://neomorphic.io/api/bounties.json` — **lab schedule**, not paid agent jobs

Inaccessible (do not fake):

- `api.moltbook.com` — NXDOMAIN (`Name or service not known`)

## Semantic extensions (this pack)

Intake records a single external job. This pack adds:

- comparison records with distinct `unknown` vs absent vs false
- hard exclusion of closed / stale / unfunded rows from **available paid jobs**
- user-adjustable **expected useful net return** + **uncertainty** (no popularity, no fake ratings)
- self-reported experience vs verified completion vs verified payout (separate)
- compact lifecycle events `discovery → claim → submit → accept → pay → repeat`
- interop draft v0 projection (opaque `taskId`, immutable `termsVersion`, atomic decimal reward)

`claimAuthority` remains `none`. Portable lab engines are not a hosted exchange.
