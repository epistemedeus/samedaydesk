# W5-M07 lock fixture corpus

Independent fixtures and CLI replay for SameDayDesk lock comparison. Domain cases live in `corpus/cases.json`. The current engine is W4-commerce-11 at the SHA in `PIN.json` (W5-M03 owns that kernel). This package does not copy `tools/lockfile-pin-delta`.

| Goal | Entrypoint | Command | State | Tests | Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Replay corpus | `bin/replay.mjs` | `node bin/replay.mjs` | Classifies match, named gap, valid refusal, engine failure | `test/cli-replay.test.mjs` | Co11 SHA in PIN.json via worktree or `LOCKFILE_PIN_DELTA_ROOT` |
| Version / integrity explained | Co11 CLI | `--before` / `--after` on npm v2 and v3 fixtures | `pin-delta.json` lists the changed pin and omits the stable one | cli-replay, http, local-runtime | Node >= 22 |
| Resolved source | same | git commit and registry URL only | Domain wants an explained resolved change. Current engine omits it | cli-replay gap `resolved-source-omitted` | W5-M03 remaining bind |
| Constant hasher | `bin/constant-hasher-probe.mjs` | process import of Co11 `createHashTermsAdapter` | Default hasher still sees integrity bytes. Constant hash currently erases the delta | `test/hasher.test.mjs` | Co11 lib/index.mjs |
| Unsupported formats | Co11 CLI | yarn, pnpm, bun, composer, Cargo, v1, v4, HTML, package.json | Exit 2 with an explained refuse code. Not a crash. Yarn digest is not an npm pin hash | cli-replay, missing-engine | none |
| Report bytes | Co11 CLI stdout | version fixture | stdout `digest` is the first changed pin `termsHash`, not SHA-256 of `pin-delta.json` | `test/report-bytes.test.mjs` | none |

Postgres is unused. There is no store. A missing engine fails the run. It is not a skipped pass.
