# Grexal source-change evidence packager (S109/S121)

Local, $0 evidence packager for source diffs. **Not** a Grexal paid execution.

## What it does
- Builds a unified diff (from git refs or a supplied patch) plus a structural acceptance report.
- Detects truncated hunks, rename/copy/binary/no-newline markers, unsafe paths, and size limits.
- Binds optional buyer criteria locally. `structuralChecksPass=true` does **not** mean buyer acceptance, git-apply success, or Grexal paid execution.

## What it does not do
- No Grexal login/push/publish/paid invoke
- No network by default
- No paid model calls
- No claim of escrow approval from JSON labels

## Commands (from this package directory)

```bash
# Official Grexal 0.4.1 manifest validate (no auth)
npx --yes grexal@0.4.1 validate

# Offline local validator
node bin/validate-manifest.mjs

# Fee worksheet from docs formula (no spend)
node bin/fee-worksheet.mjs 0.05 0.08 0.10
node bin/fee-worksheet.mjs --micros 50000 80000 100000

# Pack evidence from a patch file
node agent/pack_evidence.js --unifiedDiffFile ../../../s121/fixtures/diff/simple.patch --stdout-only

# Pack evidence with buyer criteria binding (local math only)
node agent/pack_evidence.js --unifiedDiffFile ../../../s121/fixtures/diff/simple.patch \
  --buyerCriteriaFile ../../../s121/fixtures/criteria/require-structural.json --stdout-only

npm test
```

Manifest pin: `grexal@0.4.1`. Payments docs: https://docs.grexal.ai/docs/payments.
