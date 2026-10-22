# useful-jobs skill (list and help)

Source of `SKILL.md` for the next useful-jobs archive. Advertised commands
are `list` and `help` only. This pack does not publish a tarball.

Pin: useful-jobs **1.4.7**, `5255824` bytes, sha256
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`.

Next archive overlay: `packs/useful-jobs/SKILL.md` → archive-root `SKILL.md`.

## Advertised entry

From the repository root, on Node 22:

```bash
node packs/useful-jobs/bin/prove.mjs
```

That command hashes the committed 1.4.7 archive, extracts outside the git
tree, copies `SKILL.md` to the extract root, and runs the skill's list and
help lines against `bin/useful-jobs.mjs`.

## Seeded failure

A skill that advertises `run` is refused:

```bash
node packs/useful-jobs/bin/prove.mjs --seeded-failure advertised-run
```

Expected: exit 2, `code: advertised-run`.

Unknown job help on the real CLI:

```bash
node packs/useful-jobs/bin/prove.mjs --seeded-failure unknown-job
```

Expected: exit 2, `code: unknown-job`, child stderr `unknown job not-a-job`.

## Tests

```bash
node --test packs/useful-jobs/test/*.test.mjs
```
