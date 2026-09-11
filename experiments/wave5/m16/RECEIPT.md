# W5-M16 receipt

Reproducible dependency-update real-project trial. Thin consumer of the pinned lockfile-pin-delta CLI. Owned path only: `experiments/wave5/m16/`.

## Source

- Repo: `epistemedeus/samedaydesk`
- Starting ref: `fable/f08-paid-wrappers` `aeef964fa188443078958d9d6d393afae1d542ee` (PR52)
- Feature branch: `cursor/w5-m16-reproducible-dependency-update-real-project-trial-aef5`
- Engine tested: `tools/lockfile-pin-delta/` at `e81efc8ab71b1bde88eca743d297149e61bbb6f2` (`codex/w4-commerce-11-20260911`), materialized with `git archive` at runtime. Not copied into this tree.
- Wrapper tested: `server/paid-useful-jobs/` at the PR52 pin above. Catalog still has no `lockfile-pin-delta` job.
- Real project pair: SDS `package-lock.json` `126776d364302a610f3e1a91c19191b99ef3b99a` → `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` (`fix(deps): update vulnerable locked dependencies`). Owner QA. Not customer demand.

## Command

```bash
cd experiments/wave5/m16
node --test --test-concurrency=1 test/*.test.mjs
node bin/trial.mjs run --journey sds-vuln-update
node bin/trial.mjs catalog-binding
```

Node v22.14.0. **15 pass, 0 fail, 0 skipped.**

## Current-source findings

- Engine CLI on that pair: status `actionable`, 3 changed pins (`concurrently`, `qs`, `shell-quote`). Unchanged omitted. Public `pin-delta.json` does not include `resolved`. This trial joins staged `packages[id].resolved` so the result names the tarball URLs (example: `qs` `https://registry.npmjs.org/qs/-/qs-6.15.2.tgz` → `https://registry.npmjs.org/qs/-/qs-6.16.0.tgz`).
- Same version+integrity with a git `resolved` URL is omitted by the engine at this pin. Overlay reports it as `engineOmittedResolved`. Valid analysis, not a crash.
- Injected constant hasher at the engine library wipes the real 3-package delta to `changed: 0` / `informational`. This CLI never injects a hasher. `assertInjectableHasher` refuses a constant function (`constant-hasher-erases-byte-equality`). Remaining M03 fix.
- Pin terms hashes are not forced equal to a disclosure-document hash or the trial digest.
- HTML / SAMPLE-as-customer / `--example` are valid refusals (transport ok, exit 2). Missing engine CLI and a crashing stub CLI are transport failures (exit 1), never skipped passes.
- F08 `list` jobs: `api-upgrade-brief`, `vendor-budget-impact`, `feed-agenda`, `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record`. `run lockfile-pin-delta` → `unknown-job`.

## Remaining integration binding

- W5-M03: include `resolved` in pin identity; refuse constant hashers. Tested engine remains `e81efc8`. Do not claim a future M03 amendment.
- W5-M07: yarn.lock / pnpm-lock.yaml unsupported by this engine.
- W5-D24: engine still comes from `git archive` of the SDS object database, not a clean published package install.
- W5-M01 / W5-D01: catalog + paid-wrapper job id. Current wrapper pin is PR52 `aeef964`.
- F: a permitted maintainer supplies their own `--before-ref` / `--after-ref`. Usefulness unknown until received. No spend, deploy, payout, or messages from this worker.

Postgres is not part of this job. pstack: plugin cache `cursor-public/9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`; read `setup-pstack`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `tdd` (all `disable-model-invocation: true`). No slash expansion, no Task children, no CreateAgent.
