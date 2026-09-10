# Grexal source-change evidence packager (S109/S121)

Local, $0 evidence packager for source diffs. **Not** a Grexal paid execution.

## What it does
- Builds a unified diff (from git refs or a supplied patch) plus a structural acceptance report.
- Detects truncated hunks, rename/copy/binary/no-newline markers, unsafe paths, and size limits.
- Binds optional buyer criteria locally. `structuralChecksPass=true` does **not** mean buyer acceptance, git-apply success, or Grexal paid execution. `noteOnly` criteria never auto-pass. `allChecksPass` is a structural-only alias (`allChecksPassScope=structural-packaging-checks-only`). Even a fully satisfied local binding is labeled `bindingKind=local` and is **not** escrow.

## What it does not do
- No Grexal login/push/publish/paid invoke
- No network by default
- No paid model calls
- No claim of escrow approval from JSON labels

## Commands (from this package directory)

Bins: `bin/validate-manifest.mjs`, `bin/fee-worksheet.mjs`, `agent/pack_evidence.js`.
Flags: `--micros`, `--unifiedDiffFile`, `--buyerCriteriaFile`, `--stdout-only`.
S121 fixtures are **not** inside this package. From a clean extract, set `S121_FIXTURES` to a supplied `s121/fixtures` dir (this experiment: `experiments/s109-marketplace-entry-trials/s121/fixtures`). Relative `../../../s121/fixtures/...` only works when this directory is `surfaces/grexal/package` in the S109 tree.

```bash
# Official Grexal 0.4.1 manifest validate (no auth; optional; not a paid run)
npx --yes grexal@0.4.1 validate

# Offline local validator
node bin/validate-manifest.mjs

# Fee worksheet from docs formula (no spend)
node bin/fee-worksheet.mjs 0.05 0.08 0.10
node bin/fee-worksheet.mjs --micros 50000 80000 100000

# Pack evidence from a supplied patch file
node agent/pack_evidence.js --unifiedDiffFile "$S121_FIXTURES/diff/simple.patch" --stdout-only

# Pack evidence with buyer criteria binding (local math only; not escrow)
node agent/pack_evidence.js --unifiedDiffFile "$S121_FIXTURES/diff/simple.patch" \
  --buyerCriteriaFile "$S121_FIXTURES/criteria/require-structural.json" --stdout-only

S121_FIXTURES="${S121_FIXTURES}" npm test
```

Manifest pin: `grexal@0.4.1`. Payments docs: https://docs.grexal.ai/docs/payments.
