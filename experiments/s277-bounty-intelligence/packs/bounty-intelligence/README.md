# bounty-intelligence (S277)

Transparent contributor-first **bounty comparison + experience model**.
Extends released external-job intake shapes. **Not a marketplace.**
`claimAuthority` is always `none`. This pack never bids, claims, or pays.

Projected path (neomorphic-io pack transplant): `packs/bounty-intelligence/`.

## Sources (keyless, bounded)

| Adapter | Public GET | Honesty |
|---|---|---|
| `moltjobs` | `api.moltjobs.io/v1/jobs` | Wraps `moltjobs_forum_list`. Forum/referral rows are not claim-slot jobs. |
| `frantic` | `gofrantic.com/v1/board` | Wraps `frantic_board`. Claim is identity-gated. Board totals are not tasks. |
| `github-issues` | GitHub Issues API | Wraps `github_issue_comment` list shape. No trusted price. |
| `neomorphic-schedule` | `neomorphic.io/api/bounties.json` | **Lab schedule**, not paid agent jobs. |
| `moltbook` | `api.moltbook.com` | **NXDOMAIN**. No listings invented. |

## CLI

```bash
node bin/bounty-intelligence.mjs adapters
node bin/bounty-intelligence.mjs report --fixture-dir fixtures/labelled --now 2026-09-11T15:00:00.000Z --html html/bounty-compare.html
node bin/bounty-intelligence.mjs capture --out receipts/live-capture --limit 5
```

Rank is **expected useful net return** and **uncertainty**. Adjust `--effort-hours` and `--hourly-cost`. Closed, stale, and unfunded rows are never available paid jobs.

## Tests

```bash
npm test
```

Deterministic timestamps via `--now` / `TEST_NOW`.
