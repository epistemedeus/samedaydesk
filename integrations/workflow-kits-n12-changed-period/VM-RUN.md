# VM run (model-free)

Run on the Cursor VM assigned by VM Console. No model calls, no provider imports and
no network calls other than the git fetch. Source: `epistemedeus/samedaydesk`, branch
`codex/n12-workflow-kits-changed-period-20261112`, path
`integrations/workflow-kits-n12-changed-period/`.

## Required

```sh
set -eu
node --version                      # expect v20 or later
npm --version                       # npm ships with Node; needed for test:install
BRANCH=codex/n12-workflow-kits-changed-period-20261112
git clone --filter=blob:none --no-checkout https://github.com/epistemedeus/samedaydesk.git sds-wk-n12-cp
cd sds-wk-n12-cp
git sparse-checkout set integrations/workflow-kits-n12-changed-period
git fetch origin "$BRANCH"
# HEAD_SHA: substitute the exact head reported for this run, or take the fetched branch tip.
HEAD_SHA="${HEAD_SHA:-$(git rev-parse FETCH_HEAD)}"
git checkout --detach "$HEAD_SHA"
git rev-parse HEAD                  # record this SHA with the run evidence
cd integrations/workflow-kits-n12-changed-period
node scripts/vendor-sync.mjs --check        # expect: vendor check ok: 36 files
node scripts/build-artifacts.mjs --check    # expect: artifacts up to date
node scripts/compute-effort.mjs --check     # expect: EFFORT.json up to date
node bin/workflow-kits-n12-changed-period.mjs validate
npm test 2>&1 | tee ../../wk-n12-cp-npm-test.txt
npm run test:install 2>&1 | tee ../../wk-n12-cp-test-install.txt
```

All commands after `cd integrations/workflow-kits-n12-changed-period` run from that
folder. No environment variables are needed except the optional `HEAD_SHA`.

Expected counts: `npm test` reports 146 tests, 146 pass, 0 fail, 0 skipped: 71 kit
tests plus the vendored Useful Commerce suites (recurring journey 59, job contract 16).
`npm run test:install` reports 1 test, 1 pass.

`npm test` never packs or installs anything. `npm run test:install` is the
cold-consumer install check (`install-check/cold-install.mjs`): `npm pack` into a
temporary folder, a fresh project there, `npm install --no-audit --no-fund <tgz>`
(zero dependencies, so no registry access), then from that project the bin
(`hashes`, `validate`, `simulate make`) and a fresh-operator flow through the public
exports. It removes the temporary folder afterwards and skips with a message if npm is
missing.

## Not part of this run

No Make or n8n import. Both artifacts are fixture only; see `OBSERVATIONS.md`.
