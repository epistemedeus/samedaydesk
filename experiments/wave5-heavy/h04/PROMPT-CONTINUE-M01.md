# W5-H04 continuation — M01 four-engine composition replay

You are the **same** Native Grok Heavy parent session `03efef00-6fd3-4435-b2d1-1b32a46661b8` (resume). Cursor Auto launches/collects only — do **not** ask Auto to implement.

## Auth / model (reuse; already valid)

- `grok 1.0.25`, logged in; provider build **`grok-4.6-build`**
- Continue with `-m grok-4.6 --effort xhigh`
- No API-key billing, reset redemption, overage, extra Cloud agents, or second login

## Fixed scope

| Item | Value |
| --- | --- |
| Worktree | `/tmp/w5-h04/wt` |
| Branch | `codex/w5-h04-20260911` @ prior head `b2988b39988451dfdd090c5c6d2ed2f3e86d3761` |
| Own ONLY | `experiments/wave5-heavy/h04/` |
| Do NOT amend | M01/D01 engines or `experiments/wave5/m01/` / `tools/{lockfile-pin-delta,json-schema-webhook-drift,route-table-diff,page-change-offline-job}` product sources |

## New composition pin (mandatory)

Your previous 12 public-revision examples must now replay against the **actual four-engine composition** at **same repo**:

- **Composition SHA:** `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`
- **Read-only worktree already prepared:** `/tmp/w5-h04/ro-m01` (detached at that SHA)
- M01 paths: `experiments/wave5/m01/` including `CONTRACT.md`, `catalog.json`, `bin/run-job.mjs`
- Engines live at repo-root `tools/`:
  - `tools/lockfile-pin-delta/`
  - `tools/json-schema-webhook-drift/`
  - `tools/route-table-diff/`
  - `tools/page-change-offline-job/`

**Test these from the read-only worktree. Do NOT amend those engines** — M01/D01 own composition.

Entry examples (from CONTRACT.md):

```bash
node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before … --after … --out-dir "$OUT"
node experiments/wave5/m01/bin/catalog.mjs contract
```

Also exercise each engine's published CLI under `tools/*/bin/` as catalogued. Prefer M01 `run-job.mjs` as the composed surface.

## Upgrade the H04 benchmark

1. **Replay all 12** existing examples against these **actual published CLIs** (not prior W4 leaf SHAs alone).
2. Preserve separately in expected artifacts:
   - **expected source facts** (from raw before/after primary sources — NOT from engine output)
   - **expected refusal**
   - **useful no-change**
3. Keep SDS52 pin usage only as needed for api-upgrade-brief / paid-useful-jobs context; do not rewrite SDS52.

## Add realistic lockfile cases (up to 8 distinct public projects)

Add the most decision-changing realistic lockfile cases from **≤8 distinct permitted public projects** (exact revisions + provenance). Coverage must follow **distinct semantics**, not quota padding or repeated templates:

- same version, changed integrity/source
- resolved URL pin change
- dependency addition
- dependency removal
- normalization / noise (useful no-change)
- unsupported format (expected refusal)
- realistic large bounded inputs

**Independent expected facts must come from raw before/after source bytes**, not from engine stdout.

### Language correction (mandatory)

A version bump is **not** a “security vulnerability” without an actual advisory / version-range join. **Correct that language** in prior recommendation text (RECEIPT, offers, CANDIDATES). This is **not** a vulnerability scanner. Prefer operator-risk / pin-delta / integrity-change wording.

## Measurement

- Measure **real runtime** and **output sizes** for each replay
- Record any mapping failures (catalog vs CLI vs expected)
- Explain whether **lockfile remains the best first offer** with evidence
- Do **not** claim a CPU estimate is the hosting bill
- Run actual **clean CLI invocations** + **byte validation**
- Include **one CLI/library contract equivalence** check (e.g. `run-job.mjs` vs `runCatalogJob` / `invokeEngine` from `index.mjs`) — not fixtures alone

## Children

Spawn native children for independent source cases/oracles and a collector as useful. Preserve shared-host ~25% RAM / ~20% disk reserve. Record **actual** child counts in RECEIPT. Parent integrates harness, replays **all** cases, returns exact code/source pins, decisive failures, and strongest practical invocation examples.

## Forbidden

- Deployment, paid call, purchase, contact, product-source edits outside H04
- Amending M01/D01 engines
- Cursor Auto implementation substitution
- Asking Root to create 100 PRs or bypass platform approval

## Export

Feature branch push authorized. If `gh pr create` still fails, keep branch + compare URL (do not invent PR success).

## Deliverables (update under own dir)

- Upgraded harness + expected facts/refusals/no-change separated
- New lockfile public-project cases with provenance
- Corrected non-vuln language in offers/RECEIPT
- Runtime/size measurements + mapping-failure log
- CLI/library equivalence result
- Updated FEATURE-MAP.md + RECEIPT.md
- Push; draft PR or compare URL

## Final stdout JSON

```json
{
  "assignment": "W5-H04-continue-M01",
  "branch": "codex/w5-h04-20260911",
  "head": "<sha>",
  "compositionSha": "a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e",
  "parentSessionId": "03efef00-6fd3-4435-b2d1-1b32a46661b8",
  "childSessionIds": [],
  "childCount": 0,
  "model": "grok-4.6-build",
  "testsPass": true,
  "testCounts": {"pass": 0, "fail": 0},
  "replayedExamples": 12,
  "newLockfileCases": 0,
  "lockfileStillBestFirstOffer": true,
  "rationale": "...",
  "cliLibraryEquivalence": {"pass": true, "detail": "..."},
  "measurements": {"note": "runtimes/sizes path"},
  "languageCorrected": true,
  "prOrCompare": "...",
  "failures": [],
  "strongestInvocations": []
}
```

Resume work now in `/tmp/w5-h04/wt`. Own children through completion.
