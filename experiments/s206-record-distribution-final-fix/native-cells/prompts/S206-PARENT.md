# S206 — Final fix: three distribution/pricing residuals on S198 candidate

You are the **same** authenticated native Grok Heavy parent.
Session id: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`
Model: `grok-4.6` · effort: `xhigh`
Cursor = transport/git/collection only. **You** own source fixes + tests + push of product.

## Freezes

- Branch (already checked out): `codex/s206-record-distribution-final-fix-20260910`
- Base tip (S198 terminal, do not rewrite history of S198): `6a7b5b6885842b78c40ecbef1c63570d7987fbe7`
- Cash $0. No merge/deploy. No paid calls / overage / bankedreset / new auth.
- Do **not** modify Pulse / homepage / auth / payment / price-product behavior.
- Do **not** invent a second parser. Reuse record-repeat patterns already accepted.

## Three concrete residuals (reproduce once, then fix)

### F1 — `distribution-repair` explicit caller paths must never fall back to examples

Location: `experiments/s185-distribution-repair-package/bin/distribution-repair.mjs::resolveMaybe`

Today it searches `[cwd, PKG_ROOT, PKG_ROOT/examples]`. A missing caller file can silently become bundled evidence.

**Fix:** Match record-repeat:
- Explicit CLI paths (`diagnose <file>`, `--input`, `--record`, `--write-next-run` target) → resolve against **CWD only** (absolute stays absolute). Missing → structured missing/refusal, never examples.
- Manifest-sourced relative paths → resolve against **manifest directory only**.
- Samples → `samplePath()` / `PKG_ROOT/examples` only when the `sample` command is used.

**Regression:** Colliding filename under `examples/` absent from CWD; explicit diagnose/`--record` must report missing, not consume the bundled file.

### F2 — `--write-next-run` must not destroy diagnosed evidence

Location: same CLI `runInput()` / write-next path — currently unconditional `writeFileSync`.

**Fix:** Reuse record-repeat `writeNext` pattern:
- Protect inputPath + imported manifest path + override `--record` path
- Compare realpath / inode (symlink + hardlink aliases)
- Exclusive create (`wx`); refuse existing unrelated output
- Preserve original bytes on every refusal

**Regression:** same path, symlink alias, hardlink alias, pre-existing unrelated output all refuse with bytes intact; new distinct path succeeds.

### F3 — JSON `null` / scalar pricing must structured-refuse

Location: `experiments/s163-record-recipes/adapters/pricing-row-unit.mjs::preparePricingTable`

After `JSON.parse`, `null` has `typeof === "object"` and `obj.rows` throws instead of `refuse(...)`.

**Fix:** After parse, reject `obj == null` and non-object/non-array values (e.g. `unsupported-pricing-shape`) before inspecting `.rows`/`.items`. Valid arrays and `{rows:[...]}` unchanged.

**Regression:** files with `null`, `"x"`, `7`, `true` → structured refusal (no throw); valid shapes unchanged.

## Additional boundary (inspect, fix only if demonstrated)

`compose.mjs` synthesizes `fixtureDerived:true` `linkActivated` events into DIST08 `diagnoseConversion`. Inspect `vendor/dist08/src/` (and any `vendor/08` alias if present). If downstream diagnosis can present those activations **without** retaining fixtureDerived / fixture_derived_acquisition qualification, fix that loss. Else record exact disproof in RESULT (cite fields that retain the label). Do not invent a defect.

## Required work product

1. Implement F1–F3 (+ dist08 only if demonstrated).
2. Add exact focused API/CLI regressions (do not pad with broad stress).
3. Rebuild **both** committed archives + coherent discovery/receipt/machineEntry metadata so downloaded bytes match amended source.
4. From a **fresh actual tar extraction** (outside repo), run both literal installed CLIs on:
   - two distinct caller cases
   - filename collisions (F1)
   - input/output aliases + null/scalars (F2/F3)
5. Run existing suites in proportion:
   - `npm --prefix experiments/s134-record-jobs test`
   - `npm --prefix experiments/s163-record-recipes test`
   - `npm --prefix experiments/s176-record-repeat-package test`
   - `npm --prefix experiments/s185-distribution-repair-package test`
   - caller-both-kits if still present under s198/s206
   - owning build / hosted-startup / spa / browser only as needed for changed surface
6. Pulse: two pre-existing env failures are **not** new source defects — report accurately, do not modify Pulse.

## Deliverable discipline

- Write compact `experiments/s206-record-distribution-final-fix/RESULT.md` + receipts JSON (session, model, effort, commands, archive digests, dist08 finding).
- **One product commit** (source+tests+archives+metadata) and optionally **one compact RESULT commit** — then push. Do **not** stamp RESULT with its own resulting commit id (no S198 stamp-loop).
- Cursor will collect final HEAD after your push. Report exact final head in RESULT as the product commit (or “see branch tip after RESULT commit” without rewriting forever).

Push branch: `codex/s206-record-distribution-final-fix-20260910`.
