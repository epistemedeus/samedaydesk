# W5-H04 — Useful-job benchmark (Heavy-primary)

You are Native Grok Heavy on this Cursor Cloud VM. Cursor Auto is launcher/collector only.
Do **not** ask Auto to implement. Own all code, tests, commits, push, draft PR.

## Auth / model (already verified)

- CLI `grok 1.0.25`, logged in `epistemedeus@gmail.com`
- Catalog: `grok-4.6` (default), `grok-4.5`
- Provider build observed: **`grok-4.6-build`**
- Parent must run with `-m grok-4.6 --effort xhigh` (highest available)
- No API-key billing, no reset redemption, no overage purchase, no second login

## Scope (hard)

| Item | Value |
| --- | --- |
| Target repo | `/tmp/w5-h04/wt` → `epistemedeus/samedaydesk` |
| Branch | `codex/w5-h04-20260911` (already checked out in this worktree) |
| Own ONLY | `experiments/wave5-heavy/h04/` |
| Pilot pin | `95b3f3a47f5b1b69bd237e4c978fc3376221365d` (inputs under `inputs/pilot-pin/`) |
| SDS52 kernel | `aeef964fa188443078958d9d6d393afae1d542ee` (fetched; use read-only worktrees) |
| Complement | M06–M09 semantic corpora — do **not** duplicate; build useful-job benchmark instead |

## Forbidden

- Production/default merge, deploy, account changes, spend, external messages
- Mass scraping, purchase, rewriting engines, duplicating existing source fixtures as your corpus
- Claiming product bugs from stale heads; unknown stays unknown
- Editing outside `experiments/wave5-heavy/h04/`
- Substituting Cursor Auto for Heavy children

## Children (mandatory)

Spawn **6** independent native children immediately for valuable parallel work.
Expand toward **12** (max **18**) only when additional valuable work remains and
host reserve stays ~**25% RAM** / ~**20% disk**. Log the chosen child count in RECEIPT.
No arbitrary cap at 3. No synthetic busywork. No periodic daemon / visible local console.
Store traces remotely if tools allow; return compact receipts + git sources.

### Suggested child map (adapt; non-overlapping files)

1. Inventory SDS52 wrapper + selected W4 commerce engines; pin exact SHAs used
2. Select before/after pairs: schema/webhook compatibility (caller-owned fixtures + public pairs)
3. Select lockfile / dependency source-update pairs
4. Select API route change pairs
5. Select page-fact change pairs + meaningful-no-change controls
6. Harness runner: execute SDS52 + selected W4 engines in **read-only** worktrees; record real stdout/diffs
7. (expand) Expected useful reports + primary-source evidence binding
8. (expand) Exact failure taxonomy + no-change controls
9. (expand) Offer candidates (2–3 strongest) with decision-changing evidence
10. (expand) Tests/CI for harness; RECEIPT + FEATURE-MAP
11–12. (expand only if reserve allows) Extra nonduplicative pairs / engine diffs

## Build this product

A **runnable useful-job benchmark**:

1. Up to **12** nonduplicative before/after examples across:
   - schema / webhook compatibility
   - lockfile / source updates
   - API routes
   - page facts
2. Each example: prove the **actual changed fact** with primary source evidence and an expected useful report
3. Include **meaningful-no-change** controls
4. Execute **current SDS52** `aeef964fa188443078958d9d6d393afae1d542ee` and selected **W4 engines** from inventory pins in **read-only** worktrees
5. Record **real** output and differences (not desired conclusions)
6. Fresh environment package behavior and actual new inputs matter
7. Return: runnable benchmark, bounded legal-to-store source refs/fixtures, exact failures, **2–3 strongest offer candidates**

## Inputs already staged

- `inputs/pilot-pin/PLAN.md`
- `inputs/pilot-pin/REVIEW-INTEGRATION.md`
- `inputs/pilot-pin/TASKS.json` (full 100 tasks; read M06–M09 + D01 context only as needed)
- `inputs/pilot-pin/SOURCE-SNAPSHOT.json` (kernels + SDS commerce leaves; refresh pins via git fetch before claiming)

Read prior index selectively — no blanket full-history reading.

## SDS52 / engines

```sh
# read-only worktrees only
git fetch origin aeef964fa188443078958d9d6d393afae1d542ee
git worktree add --detach /tmp/w5-h04/ro-sds52 aeef964fa188443078958d9d6d393afae1d542ee
# similarly for selected W4 commerce heads from SOURCE-SNAPSHOT / TASKS inputRefs
```

Do not rewrite engines. Capture actual CLI/HTTP outputs into `experiments/wave5-heavy/h04/runs/`.

## Deliverables (under own dir)

- Runnable harness (`package.json` / `bin/` / `src/`)
- Fixtures + bounded source references
- Tests (`node:test` or npm test) with pass/fail recorded
- `FEATURE-MAP.md`, compact `RECEIPT.md`
- Push branch; **draft PR** to `main` (feature push + draft PR authorized). If `gh` cannot create PR, record compare URL.

### RECEIPT must include

- repo / head / PR or compare URL
- native model (`grok-4.6-build` if observed), parent session id, **every child session id**, child count chosen
- RAM/disk notes vs reserve
- actual tests/coverage
- useful findings + next owner
- exact failures observed
- 2–3 strongest offer candidates
- SDS52 + W4 engine SHAs actually executed

## Final stdout

Print one JSON object:

```json
{
  "assignment": "W5-H04",
  "branch": "codex/w5-h04-20260911",
  "head": "<sha>",
  "prOrCompare": "...",
  "parentSessionId": "...",
  "childSessionIds": ["..."],
  "childCount": 6,
  "model": "grok-4.6-build",
  "testsPass": true,
  "testCounts": {"pass": N, "fail": 0},
  "examples": 12,
  "offerCandidates": [{"id":"...","why":"..."}],
  "failures": [],
  "nextOwner": "..."
}
```

Start now. Own children through completion.
