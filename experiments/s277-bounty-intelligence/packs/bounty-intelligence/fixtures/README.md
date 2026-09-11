# Fixtures

Every JSON file is labelled:

| `dataLabel` | Meaning |
|---|---|
| `fixture` | Live-derived snapshot, bounded, timestamped. Not live status. |
| `synthetic-edge` | Constructed for tests. Not observed on a public API. |
| `live-capture` | Produced by `bounty-intelligence capture`. |

Do not treat fixture success as external completion, claim, or payout.

Live-derived (2026-09-11 probes, reduced):

- `labelled/moltjobs-list.open.fixture.json`
- `labelled/moltjobs-stats.fixture.json`
- `labelled/frantic-board.open.fixture.json`
- `labelled/github-issues.open.fixture.json`
- `labelled/neomorphic-schedule.fixture.json`
- `labelled/moltbook-inaccessible.fixture.json`

Synthetic edges (`edge-*`) cover closed, stale, unfunded, expired, goodwill, GitHub bounty prose, terms drift, and duplicates.
