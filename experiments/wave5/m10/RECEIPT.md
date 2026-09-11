# W5-M10 RECEIPT — Co18 recipe/catalog join consumes both named sources

**Date:** 11 September 2026
**Assignment:** W5-M10
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-m10-co18-recipe-catalog-join-actually-consuming-both-named-input-sources-61ed`
**Starting ref:** `bb795f6dad362a0ac187fe896d636e62fa1d932e` (W4-commerce-18)
**HEAD:** `dd75673` (filled with full sha after this receipt commit)
**Secondary pin (read-only worktree):** PR52 `aeef964fa188443078958d9d6d393afae1d542ee`

## Current-source findings (reproduced)

REVIEW-INTEGRATION Co18: parsed remote input B must actually be used; inconsistent results cannot be hidden by unconditional `ok`; synthetic source/policy labels stay synthetic.

Against `bb795f6` before this amendment:

- Changing catalog B (file or loopback HTTP) already moved domain classifications (`feed-agenda` dropped; `source-change-alert` became `inCatalog`).
- `source.catalogSha256` still hashed published `client/public/for-agents/useful-jobs/catalog.json`, not the loaded B bytes. HTTP recipe-spec notes used B while `recipeSpecSha256` hashed local A.
- Family document vs discovery disagreement still returned `ok: true`.
- CLI had no `--catalog` / `--recipe-specs`. `--http` always served published files.

## Fix

Smallest real issue: bind identity to the loaded named-source bytes, expose `--catalog` (source B) and `--recipe-specs` (source A) on the CLI, serve those named files over `--http`, refuse internal inconsistency, and label transport/engine failures separately from joined analysis / policy refusal.

Did not copy PR52 wrapper or I01 kernel. `hashTerms.synthetic: true`, `available: false`. Unlike terms hashes are not forced equal; this join does not hash I01 terms.

## Tests

```bash
cd tools/recipes-catalog-join
node --test --test-concurrency=1 test/*.test.mjs
```

**PASS** — 16 tests, 0 fail, 0 skip (Node v22.14.0). Includes published journey, seeded refusals, loopback HTTP, CLI `--catalog` source B, `--http --catalog` B, `--recipe-specs` A, duplicate-id refuse, missing/wrong-schema distinction, HTTP family inconsistency refuse, HTTP 404 not-joined.

Postgres: not a join surface; CLI report has no store. `initdb` absent on this image (N/A, not a skipped required gate).

## Integration limits

- Integration owner W5-M01 has not published a Wave5 catalog/engine contract export in this checkout. Tested against published useful-jobs `catalog.json` at Co18/PR51 bytes (sha256 `106f65171ed118c66cdb84f7c5046818cff0d12fcf6fdb545ce123329a27062c`), identical to PR52 `aeef964` catalog bytes. Remaining binding: M01 selected offer/engine wiring and any later I01 hash-terms inject. Do not claim a future sibling's behavior.
- Postgres is not a surface of this join. CLI report has no payment store. `initdb` is absent here; that is not a skipped required gate.
- Live `agents.samedaydesk.com` catalog fetch was not run. Loopback HTTP of named files was.
- PR52 `runPaidOffer` was not invoked; this package is the read-only join, not another paid runner.
