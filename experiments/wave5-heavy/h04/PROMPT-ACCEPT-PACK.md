# W5-H04 continuation — cold-caller accept-pack (all four M01 engines)

Resume **same** Native Grok Heavy parent `03efef00-6fd3-4435-b2d1-1b32a46661b8`.
Cursor Auto only launches/collects. Do **not** ask Auto to implement.

## Auth / model

- Reuse valid native login. Model **`grok-4.6`**, effort **`xhigh`** (provider build `grok-4.6-build`).
- No API billing, reset redemption, overage, extra Cloud agents, or second login.

## Fixed ownership

| Item | Value |
| --- | --- |
| Worktree | `/tmp/w5-h04/wt` |
| Branch | `codex/w5-h04-20260911` (prior collected head `37dd4b42cf21dc2031715971971bb2426a7beb80`) |
| Own ONLY | `experiments/wave5-heavy/h04/` |
| Do NOT edit | D01, M01 package, or `tools/*` engine implementations |

## Composition (read-only)

- **Exact M01 composition SHA:** `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`
- RO worktree: `/tmp/w5-h04/ro-m01`
- Four engines (do not amend):
  - `tools/lockfile-pin-delta/`
  - `tools/json-schema-webhook-drift/`
  - `tools/route-table-diff/`
  - `tools/page-change-offline-job/`
- Catalog/CLI: `experiments/wave5/m01/` (`CONTRACT.md`, `bin/run-job.mjs`, `bin/catalog.mjs`, library `runCatalogJob` / `invokeEngine`)

D01 is binding these into the delivery service **elsewhere**. This branch must ship **directly reusable independent consumer cases**, not a competing integration.

## Goal: cold-caller acceptance pack

Expand the real-input benchmark into an **executable accept-pack** covering:

1. All **four advertised engines**
2. Practical **unsupported** cases
3. Correct **no-change / refusal / partial** as useful outputs (do **not** force every input change to be actionable)

### Lockfile

**Preserve** the existing **seven** public lockfile cases. Do **not** multiply cosmetic variants.

### New focus (schema / route / page)

**Schema** (`json-schema-webhook-drift`):
- false schemas
- numeric boundary semantics
- required / removal
- `$ref` siblings / unsupported dialect
- **OpenAPI YAML must remain `not-this-job`**, never silently mapped into a JSON Schema checker

**Route table** (`route-table-diff`):
- equivalent reorder
- duplicates
- concrete path parameters
- method changes

**Page snapshot** (`page-change-offline-job`):
- real changed facts vs layout/noise
- truncation / depth bounds
- date/source freshness meaning
- **No arbitrary fresh-download claim**

Prefer authentic public revision pairs where available; clearly label **synthetic mechanism perturbations** separately.

## Oracle / execution rules

- Independent domain oracles from **exact raw before/after inputs**, not engine outputs copied as expectations
- Exercise **actual M01 CLI and library** with isolated outputs and clean environment
- Digest equivalence: exclude only documented `generatedAt` (no blanket Markdown normalization)
- Measure: meaningful positive, unchanged, unsupported, corrupt-input; resource use at accepted input ceilings; **empty/missing output negative that must fail delivery**
- Inspect whether each brief lets a consumer decide something concrete
- For **each engine**: one-paragraph **buyer example** + **minimal invocation**
- **Not** a vulnerability scanner without advisory joins (keep LANGUAGE.md discipline)

## Children

Keep native child work **disjoint**. Choose a **useful larger count** if coverage supports it (not padding). Collect/resolve before export. Preserve shared-host reserve (~25% RAM / ~20% disk). Record actual child count/IDs.

## If a core engine bug is found

- Keep the **decisive regression** under owned `experiments/wave5-heavy/h04/` for D01
- **Do not** race D01/M01 writers or patch `tools/*`

## Forbidden

- Production edits, outreach, paid calls, purchase, deployment, default merge
- New generic report framework / fixture duplication of M06–M09 corpora
- Competing D01 integration code outside H04 accept-pack
- Cursor Auto implementation substitution

## Export

Feature push authorized. If draft PR still denied, keep compare URL.

## Deliverables under own dir

- Compact executable **accept-pack** (runner + cases + oracles)
- Exact source/command/output receipts
- Source-confirmed defects with **minimal failing inputs** (if any)
- Recommended **first callable offers** based on results
- Updated RECEIPT.md / FEATURE-MAP.md
- Buyer paragraph + minimal invocation per engine

## Final stdout JSON

```json
{
  "assignment": "W5-H04-accept-pack",
  "branch": "codex/w5-h04-20260911",
  "head": "<sha>",
  "compositionSha": "a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e",
  "parentSessionId": "03efef00-6fd3-4435-b2d1-1b32a46661b8",
  "childSessionIds": [],
  "childCount": 0,
  "model": "grok-4.6-build",
  "testsPass": true,
  "testCounts": {"pass": 0, "fail": 0},
  "lockfilePublicPreserved": 7,
  "newSchemaCases": 0,
  "newRouteCases": 0,
  "newPageCases": 0,
  "unsupportedCases": 0,
  "deliveryNegativePass": true,
  "cliLibraryEquivalence": {"pass": true, "exclude": ["generatedAt"]},
  "firstCallableOffers": [],
  "buyerInvocations": [],
  "defectsForD01": [],
  "prOrCompare": "...",
  "failures": []
}
```

Start now in `/tmp/w5-h04/wt`. Own children through completion.
