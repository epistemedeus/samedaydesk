# H155060 combined release qualification

Repository `https://github.com/epistemedeus/samedaydesk.git`. Writer branch `codex/h155060-sds-combined-release-qualification-20261106`. Worktree `/home/ubuntu/ae14-work/h155060`. Combined base `ba18ed20e139d950bdd470a5d4bad6b2541c3a31`. Installed source `9f6c0c4e396dd7677f334400eed93e3445fad600`. Installed Hostinger `01a1a9db-a3d6-721d-a158-329a9908cfd5`.

## Decision

The combined candidate is qualified for Root's managed source release. This writer did not install it.

Measured identity on this tree: source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`, host `7a8cc6b0c2e55dffda9dcbc4664c39e2e9042de4de0d2f658d2be0196d48de23`. That pair is the enrolled catalog slot (ROOT15588, trust anchor `1244c48e4797ad0995695e86f80591a0f3c2db4e4ad1106d812d0107878aefd4`). The installed tree measures host `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`.

Emitted human assets are byte-equal and mode-equal to the installed source: 352 files, 59,951,737 bytes, inventory `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5`. No human preview and no machine-only projection were prepared.

The release commit is the head of this branch. Its parent is `ba18ed20e139d950bdd470a5d4bad6b2541c3a31`. The only product file changed from that parent is `tools/workflow-owned-extensions/fixtures/outputs/fitting-decide-or-reuse-bind.json`.

## Source delta

`9f6c0c4e..` this worktree is 195 files, 180 added and 15 modified, +17001/-57. Directories: tools 144, experiments 35, server 8, docs 6, plus `package.json` and `.github/workflows/runtime-startup.yml`. `client/`, `publication/`, `vendor/`, and `package-lock.json` have no diff. `f168ee15..ba18ed20` has an empty diff on `server`, `client`, `package.json`, `package-lock.json`, `.github`, `vendor`, and `publication`, so the successful GitHub run `42150604597` / job `127672656262` on `f168ee15` covers the same watched runtime tree as `ba18ed20`.

The pin has 1323 members. From the installed source, the only changed member digest is `package.json`. That change moves the host fingerprint from `6fca4aaa` to `7a8cc6b0`.

Reused component receipts, not replayed here: AGL enrollment ROOT15599, Ghost ROOT15592 (Ghost 6.75.0 SQLite already received, 22 unit tests), maintained n8n ROOT15501 (49 pass, 12 named cases, 0 API calls). Ghost source stays under `tools/workflow-owned-extensions` and is not a hosted installation.

## Defect fixed

`bindUsefulDecision` now writes `decisionBinding.usefulBodyDigest`. The workflow-owned extension fixture was still pinned to the older object, so `adapter.test.mjs:153` failed. The adapter already forwards the live SDK observation. The fixture `decisionBinding` gained only:

`usefulBodyDigest`: `sha256:b5d25aa4a23429e8de7a420f5a222895b474c07d18f68b93ad695f34850cba54`

The same consumer list then passed 186/186.

## Commands and exits

All of these ran one at a time, with `NODE_OPTIONS=--max-old-space-size=768`. Peaks are RSS sums of the command process tree, in KiB. The cap is 2097152. The highest valid peak is 600488.

| Command | Exit | Result | Peak KiB |
| --- | ---: | --- | ---: |
| apt postgresql + client | 0 | PostgreSQL 16.15. Cluster 16/main left down | 210664 |
| `npm ci --omit=dev --ignore-scripts` | 0 | added 138, audited 145. Lockfile unchanged | 211428 |
| affected consumers, before fixture | 1 | 186 tests, 185 pass, 1 fail, 8865.02113 ms | 141364 |
| same consumers, after fixture | 0 | 186 pass, 0 fail, 9211.643708 ms | sampler invalid (0) |
| source-bound selection tests | 0 | 24 pass, 0 fail, 41917.996152 ms | included below |
| `select-root10940-ci-packet.mjs --legacy-env` | 0 | selected the enrolled current packet | included below |
| `decode-root10940-ci-packet.mjs --packet` | 0 | 1 pass, 0 fail, 10092.720073 ms | 600488 for selection+select+decode |
| `publish-preserved-client.mjs` baseline | 0 | 352 / 59951737 / `6f3cb5cd` | sampled 7044 |
| `publish-preserved-client.mjs` candidate | 0 | same inventory | sampled 13272 |

`ROOT10940_CI_PACKET` was unset, so `--legacy-env` injected nothing. After the PostgreSQL journey, `pgrep postgres` was empty and cluster 16/main was down. Publisher samples are 0.2s observations of sub-second processes. The npm ci and PostgreSQL peaks are the admission measurements.

The decoded consumer kept wrong repository, commit, and path at `acquisition_source_mismatch`; a flipped descriptor at `acquisition_descriptor_mismatch`; a mutant client at `acquisition_client_mismatch`; a wrong live profile at `acquisition_profile_mismatch` with no secret file written; a changed operation at HTTP 409 `operation_conflict`; a stale second writer at `voluntary_revision_changed`; and lost-operation `readbackVoluntary` on the same delivery. `financialSnapshot()` stayed deep-equal, including historical financial, debt, funding, quote, assent, obligation, event, approval, and capture rows. No H103010 authority cache was fabricated. No live n8n call was made.

Normal commands for a later cold copy:

```sh
NODE_OPTIONS=--max-old-space-size=768 npm ci --omit=dev --ignore-scripts
NODE_OPTIONS=--max-old-space-size=768 node server/scripts/publish-preserved-client.mjs
AE14_PG_BIN="$(pg_config --bindir)" \
ROOT10940_CI_CATALOG=server/scripts/fixtures/root10940-approved-ci-packets \
NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 \
  server/scripts/test-h147010-source-bound-ci-input.mjs \
  server/scripts/test-h145010-measurement-runtime-pin.mjs
```

Then select with `--catalog`, `--index`, and `--legacy-env`, and decode with `--packet`. Leave `ROOT10940_CI_PACKET` unchanged.

## Human comparison

Both publishers printed `viteInvoked: false` and the accepted inventory. An independent walk found 352 and 352 files, equal bytes, no path-only files, no body diff, and `modeDiffCount` 0. The preserved-publication receipt hash on both trees is `603c714d1cda2e78d7486c0c880387dafaae17cd55e7d089184f6737b834e394`. The publisher excludes nothing dynamically. `client/dist` has no machine-only addition. Human text, layout, offers, and homepages were not edited.

## Closure, modes, rollback, environment

Production dependency closure is the unchanged lockfile through `npm ci --omit=dev --ignore-scripts`. Task economics imports `vendor/hosted-wallet-market/src/fee.mjs` and pins `SOURCE_PIN` to `9f6c0c4e396dd7677f334400eed93e3445fad600`. It does not import `runtime/agent-economy-foundation/dist/money.js`. `BREAK_EVEN_MULTIPLE` is `20n`. The workflow adapter and the recurring decision consumer import `tools/result-reuse`. `usefulBodyDigest` is the sha256 of the canonical useful body. It detects a later body change when the stored digest is left intact. Ghost `runtime/run-runtime.sh` was not executed.

`FILE-INVENTORY.json` lists the 195 paths against `9f6c0c4e`, with git modes. 192 are `100644`. Three added scripts are `100755`:

- `tools/recurring-decision-consumer/scripts/run-acceptance.sh`
- `tools/task-bundle-economics/examples/rn5-consumers/ce-run.sh`
- `tools/workflow-owned-extensions/runtime/run-runtime.sh`

Receipt files in this directory are `100644`. This directory contains no secrets, production environment values, raw customer data, CI client body, or second ledger.

Git build procedure for Root, on the head of this branch:

```sh
NODE_OPTIONS=--max-old-space-size=768 npm ci --omit=dev --ignore-scripts
NODE_OPTIONS=--max-old-space-size=768 node server/scripts/publish-preserved-client.mjs
```

`npm run build` and `server/foundry/materialize-runtime.mjs` were not run. Root's managed Hostinger controller and private manifest stay with Root. This writer did not call the provider.

Rollback source is `9f6c0c4e396dd7677f334400eed93e3445fad600`. That tree measures host `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`, and the `7a8cc6b0` catalog row is absent from it. Human bytes need no content restore. Rollback does not drop schema, existing debt, the 90 environment rows, or the 796 prior business rows. Environment values were not read and are not in this packet. Masked reads are not plaintext equality. `ROOT10940_CI_PACKET` stays the global historical variable. Proposed anchors under `docs/receiving/h155030-sds-consumer-composition-20261106` stay unreceived. Public client 0.3.1 stays intact. CI client 0.3.0 stays a fixture.

## Gates not executed

These `runtime-startup.yml` steps were not run on this host. Their sources are unchanged from `f168ee15` to `ba18ed20`. They are not recorded as passed, and their assertions were not weakened:

- `server/scripts/test-postgres-bin.mjs`
- `npm run test:proxy-addr`
- `server/scripts/test-correspondence-startup-diagnostic.js`
- `npm run test:hosted-startup`
- `npm run test:machine-discovery`
- `server/scripts/test-machine-guide-links.js`
- `npm run test:pulse`
- `npm run test:original-task`
- `npm run test:agent-readiness`
- `npm run test:l08-agent-repair`
- `npm run test:mcp`
- `server/scripts/test-public-readiness-load-failure.js`
- `npm run test:observatory`

Also not run: Vite, foundry runtime materialize, foundry managed probe, Ghost `run-runtime.sh`, live n8n, provider install, payment, and default merge. The workflow comment that the h155030 proposal is unreceived was left as written.

## Admission

Checkpoint `2026-11-06T04:00:00Z` and requiredUntil `2026-11-06T04:15:00Z` are the frozen foreground bounds. The original 3GiB placements were refused before claim and before spawn. No native RUN was started on either host for those placements. This foreground is the revised serial 2GiB admission. Those refusals were not restarted. No other job was cancelled or re-admitted. No model child and no browser were used. Node old-space stayed at 768 MiB. The reserve was sufficient for the measured peaks.

## Next

Root checks out the head of `codex/h155060-sds-combined-release-qualification-20261106` and performs the managed Hostinger release onto `01a1a9db-a3d6-721d-a158-329a9908cfd5`, preserving the 90 environment rows and existing debt. Root does not publish a new human tree, does not change `ROOT10940_CI_PACKET`, and does not pay, commission, or contact anyone. Rollback source remains `9f6c0c4e396dd7677f334400eed93e3445fad600`. This writer stops at the draft pull request into `codex/h136010-machine-release-20261103`.
