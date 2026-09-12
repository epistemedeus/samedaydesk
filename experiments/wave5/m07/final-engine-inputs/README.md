# W5-M07 final-engine-inputs

Independent npm lockfileVersion 2/3 **identity** check of the shipped engine, not a second kernel and not a replay of `experiments/wave5/m07/test/*.test.mjs`.

## Exact source

- Merchant: `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f` `vendor/lockfile-pin-delta/`
- Public kit 1.2.0: `epistemedeus/samedaydesk@9ae0febd8c184c0cbbb5e481ba31ac620e89b869` `client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz` (sha256 `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb`)
- D01 PR74: `46f2b7f55a7fb780333073a5197b64b8fde64a33` `tools/lockfile-pin-delta/` (kernel bytes compared, not used as a third CLI unless merchant/kit missing)

## Command

```bash
cd experiments/wave5/m07/final-engine-inputs
node --test --test-concurrency=1 test/*.test.mjs
node bin/replay-final.mjs
```

Missing engines fail. They are not skipped. Read-only worktrees under `$TMPDIR`. No purchases, customer files, production load, email, merge, or deploy.

## What this adds

Prior M07 corpus covered synthetic unscoped version/integrity, resolved-only gaps on Co11 `e81efc8a`, format refusals, and root-meta noise. This package adds genuine npm identity shapes that corpus did not own: package aliases, scoped names as the changed pin, nested same-name versions, workspace/link pins, pin-field noise control, and a new scoped resolved+integrity pair on the shipped engine.

Unsupported or documented skips are **supported unknown**, not bugs. A wrong package `name` or `id` on a claimed identity change is an **incorrect named delta** (OWNERQA, never N-BTY003).
