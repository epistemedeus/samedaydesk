# RECEIPT — W5-D07 Co15 exact-byte export bundle and import check

Repo: `epistemedeus/samedaydesk`
Assignment: W5-D07
Starting ref: `f16db42ed48a358ad088b54dc565d39461034704`
Feature branch: `codex/w5-d07-20260911`
Owned paths: `tools/job-artifact-export/`, `experiments/wave5/d07/RECEIPT.md`
Integration owner: W5-D01

## What changed

Current-head defects reproduced on the public CLI, then fixed:

1. `export --archive-sha256 <other hex>` succeeded and wrote that hex as archive identity after verifying a different on-disk tar.gz. Identity is now the sha256 of the archive bytes actually read. A caller claim must match or the CLI exits 2 with `archive-identity-override`.
2. `export --job-id vendor-budget-impact` on feed-agenda files succeeded. Known job id with another job's outputs now exits 2 with `job-output-mismatch`. That is not a valid paid delivery (`customerDelivery` stays false).
3. There was no import that bound zip bytes. `import --zip` hashes the bytes it reads, parses that same buffer, and requires the export sidecar or `--zip-sha256` to match (`zip-bytes-mismatch` otherwise).

Valid SAMPLE / no-change `feed-agenda` `status=informational` still exports and imports. That is an analysis outcome, not a transport failure.

## Pins tested

| Input | SHA / note |
| --- | --- |
| Co15 starting tree | `f16db42ed48a358ad088b54dc565d39461034704` |
| SDS PR52 wrapper (read-only worktree, not copied) | `aeef964fa188443078958d9d6d393afae1d542ee` |
| D03 `verifyComplete` (read-only worktree, not vendored) | `58cba6324c1d9793d344bc13154b8b2380e8166f` |
| useful-jobs archive | `sha256:6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| I01 hash terms | Neo PR54 `819fa637ecf5e5177c84efc16fcaa18d57017631` isolated vendor pin |

## Tests executed

```bash
node --test tools/job-artifact-export/test/*.test.mjs
```

Node v22. **25 tests, 25 pass, 0 fail, 0 skip.** Real CLI/process: useful-jobs `feed-agenda` on archive `samples/feed/a`, unzip, D03 `verify-complete` CLI from the D03 worktree. No Postgres or HTTP surface on this CLI.

Failing-before (TDD): archive override and wrong `--job-id` returned exit 0 with `ok: true`. After the fix they return exit 2.

## Remaining integration binding

D03 at `58cba632` still wants F08 `receipt.json`. Import of a raw useful-jobs out-dir zip records `completeness.bound=false` unless `verifyComplete` is injected. Injected/process D03 on that dir returns `classification=partial` `code=missing-receipt` `sold=false`. Do not treat that as Co15 transport failure, and do not claim a future D01/D03 receipt shape.

W5-D01 owns paid-useful-jobs wrapping. This pack does not settle, pay, or mark customer-delivery.

## pstack

Parent run model from Cursor Cloud: `cursor-grok-4.6-xhigh`. Skills read: tdd, principle-fix-root-causes, principle-test-behavior-not-implementation, principle-laziness-protocol, principle-prove-it-works, principle-boundary-discipline. No Task subagents (Root counts the cohort). `~/.cursor/rules/pstack-models.mdc` was not present; roles inherit the parent model.

## Stop

No default-branch push, deploy, spend, payout, or unsolicited messages.
