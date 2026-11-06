# H155040 Ghost consumer receiving

Source-only record for the disposable Ghost consumer. Committed manifests stay
`source_only_not_installed` and `not yet executed on runtime`. This file reports
a measured local runtime. It does not install the package, publish a blog, or
admit a customer.

Local runtime QA is distinct from independent customer use. The lab owner,
integration, and drafts were created on loopback SQLite and then removed.
Secrets stayed in mode 0600 files under the task root. They are not in Git or
this record.

## RESULT

- Product `epistemedeus/samedaydesk`. Writer `codex/h155040-ghost-normal-consumer-20261106`.
- Base `a2709fa6488a371b1c93c4d88e6d1f1950c5353b`. Measured runner and acceptance
  are `2c2d25c3fb7b8f7ed4f1674096a3a5b309647fa9`. This record does not change
  that code.
- Host `bc-e337f899-2c13-5f9f-ae9c-bc230d2a5382`, boot `63a647f1-25f8-4fec-8675-b29b3445dc3b`.
- Fresh root `/tmp/h155040-we/root`. Cold output `/tmp/h155040-we/out`. Clock rerun
  `/tmp/h155040-we/out-clock`.
- Node `v22.23.4` (`NODE_OPTIONS=--max-old-space-size=512`), engines match
  `^22.23.1 || ^24.20.0`. Task-local pnpm `11.28.11`. Ghost's own install used
  pnpm `12.16.1`. ghost-cli `1.34.1`. Ghost `6.75.0`. SQLite. URL
  `http://127.0.0.1:2368`, `server.host` `127.0.0.1`. Global pnpm `10.33.4` was
  left unchanged.
- The Ghost 6.75.0 integrations mapper returned an admin secret that was already
  `id:secret`. The provisioner stored one `id:hex` key. It did not double-prefix.
- Cold run tip `0b5c552d34172896b11272237f18b5fa6839c764`, wall
  `2026-11-06T01:54:31Z` to `2026-11-06T01:55:02Z`. Install log records Ghost
  6.75.0 and pnpm done in 10.8s. Named stage exits were all 0. `node -p`
  colorized `Date.now()` under `FORCE_COLOR`, so `runtime-timings.json` stored 0
  after the successful stages. That clock is fixed. The cold output is preserved.
- Clock rerun exits: `runtime_preflight 0`, `runtime_install 0`, `runtime_start 0`,
  `runtime_acceptance 0`, `unit_tests 0`, `cli_manifests 0`.
- Clock rerun timings: `installMs 715` (Ghost was already installed),
  `startMs 2437`, `acceptanceMs 1163`, `unitTestsMs 563`, `cliManifestsMs 40`.
- Acceptance on both runs: fitting unpublished draft, read back, absent from the
  Content API; non-fitting unrecognized and missing-identity refused with no new
  draft; retained reuse with `producerInvoked false` and identical content;
  same draft updated to `0.1.1` and still `draft`; remove read back `404` and
  absent from the list; unreachable `127.0.0.1:1` fell through
  `direct_sdk_fallback` with `runtimeCalled false`.
- Unit tests on the rerun: 22 pass, 0 fail, including raw, mapper-prefixed, and
  invalid-secret cases. Invalid secrets are refused. They are not truncated into
  a signature.
- Listener observed on `127.0.0.1:2368` during the cold run. After each run the
  port was closed and no process had a cwd under `/tmp/h155040-we`.
- PID 21755 and `/tmp/n4-team/ce/we-rt/out-20261105T201505Z` were not on this
  host. They were not started, stopped, or deleted.

## NEXT

Root integrates this branch onto `codex/h136010-machine-release-20261103` and
owns any hosted machine release. The machine branch at `335a5e363bcb1798cd8d25f74324a8a4bfb5bed4`
does not contain the Ghost consumer yet. The draft PR therefore includes the
consumer commits from `90939f157fcb33606c0f5ccfbffbc10b9e51e64a`, not only the
H155040 delta. No deployment, public publication, customer contact, payment, or
manifest promotion is included here.

## Commands

```bash
NODE_OPTIONS=--max-old-space-size=512 \
HOME=/tmp/h155040-we/home \
GIT_CONFIG_GLOBAL=/home/ubuntu/.gitconfig \
NPM_CONFIG_CACHE=/tmp/h155040-we/npm-cache \
ROOT=/tmp/h155040-we/root \
OUT=/tmp/h155040-we/out \
TIP=0b5c552d34172896b11272237f18b5fa6839c764 \
BRANCH=codex/h155040-ghost-normal-consumer-20261106 \
GHOST_PORT=2368 \
  bash tools/workflow-owned-extensions/runtime/run-runtime.sh
```

The clock rerun used the same root and `OUT=/tmp/h155040-we/out-clock` with
`TIP=2c2d25c3fb7b8f7ed4f1674096a3a5b309647fa9`.

## Files

- `runtime/provision-ghost.mjs`: export the formatter and run setup only as a CLI.
- `runtime/run-runtime.sh`: pass `--ip 127.0.0.1` and record durations with `date`.
- `runtime/DECISION.md`: formatter, loopback, and clock notes.
- `test/admin-key.test.mjs`: raw, prefixed, and invalid-secret regressions.
- `H155040-RECEIVING.md`: this record.
