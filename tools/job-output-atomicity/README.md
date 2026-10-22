# Job output atomicity (consumer harness)

Mailbox and archive consumer for SameDayDesk useful-job wrapper output.
It does not amend `server/paid-useful-jobs` (I02). Payments stay
non-settling prototypes.

## Public command

From the repository root, Node >= 22, no extra npm install:

```bash
node tools/job-output-atomicity/bin/verify-complete.mjs --root <package-dir>
```

Exit 0 only when classification is `complete`. Incomplete, truncated, escaped,
or mutated files exit 2 with a JSON body.

Optional `--catalog` points at `client/public/for-agents/useful-jobs/catalog.json`
(default). `--receipt` names the receipt file under `--root` (default
`receipt.json`).

## Tests

F08 is not on `main`. Tests fetch the pinned wrapper into a detached git
worktree and spawn that CLI. They write outputs only under `$TMPDIR`.

```bash
git fetch origin fable/f08-paid-wrappers
node --test --test-concurrency=1 tools/job-output-atomicity/test/*.test.mjs
```

Override the wrapper tree with `F08_ROOT` if a local checkout already has
`server/paid-useful-jobs/bin/cli.mjs`.

Tested wrapper: `fable/f08-paid-wrappers` `aeef964fa188443078958d9d6d393afae1d542ee`
(I02 current public CLI). Named assignment pin `bae3e7cd…` is recorded in
`PIN.json`.

## Binding rules

- Output `name` must be a single basename.
- Files are read only from the selected root (symlink realpath must stay inside).
- Relative receipt paths that resolve outside the root are rejected
  (`receipt-path-escapes-root`).
- Absolute paths stamped by F08 are not followed. The consumer rebinds by
  basename so a copied package can verify at a new root.

Identity `termsVersion` follows I01 / Neo PR54: `sha256:` + 64 hex. Integer
`termsVersion` is not a public claim key.

## Evidence classes

| Class | Meaning |
| --- | --- |
| `local-runtime` | Real wrapper child, real loopback HTTP, or this consumer on disk |
| `fixture` | Crafted incomplete package (allowed when the producer never emitted that state) |
| `untested-external` | No local Postgres listener; not a fake database |
