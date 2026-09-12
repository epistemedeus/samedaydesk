# W5-D16 final-lifecycle

Independent process/output check of useful-jobs 1.2.0 and D01 PR74. Not a second runner. Prior D16 PR52 results stay in the parent `RECEIPT.md`.

```bash
cd experiments/wave5/d16/final-lifecycle
SDS_D01_ROOT=/tmp/sds-d01-ro node --test --test-concurrency=1 --test-timeout=120000 test/*.test.mjs
node bin/final-lifecycle.mjs test
```

See `RECEIPT.md` for pinned SHAs, commands, verdict, and next owner.
