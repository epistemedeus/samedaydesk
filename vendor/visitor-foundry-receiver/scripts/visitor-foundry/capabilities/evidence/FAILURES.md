# Failure ledger

## Owned and fixed: first combined focused run

Command: `node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs`
Evidence: `focused-initial.tap`. Exit 1; 41 tests, 39 pass, 2 fail.
Both failures were `output.quote.required must be a bounded array` in S04 adapter
coverage tests. Existing S04 uses `{type:"object"}` to declare an opaque object.
The adapter now explicitly maps it to `{type:"object",required:[],properties:{}}`
and recursively preserves all declared constraints. It does not invent field
guarantees or drop unsupported constraints. The existing source was unchanged.

## Initial affected-suite prerequisites

- `npm run test:capability-market`: 25/26 pass; built catalog missing under `dist/`.
- `npm run test:scale-compose`: 4/9 pass; task-memory compiled output and site `dist/` missing.
- `npm test --prefix packs/capability-preflight`: 20 pass; acceptance file failed before tests (details in `preflight.tap`).
- `node --test tests/capability-preflight*.test.mjs`: 10/12 pass; missing `playwright-core` and site build.

These runs used a fresh source checkout before build prerequisites. Original logs
are retained; subsequent setup/reruns are separate evidence, not overwritten.

The initial preflight ENOENT was a test scheduling collision: the public
preflight suite calls `packCapabilityPreflight`, whose existing implementation
removes/recreates `packs/capability-preflight` during repack. Running that suite
alongside the source pack suite briefly removed its entry point. Run these two
suites sequentially. This was our orchestration error; no production source fix
is required. Build and lockfile setup completed successfully afterward.

## Remaining environment limitation: browser launch

After installation and successful site build, all relevant source/contract suites
pass: S04 26/26, preflight 35/35, composition 9/9. The sequential public preflight
suite passes 11/12. Its sole failure is Chrome exiting SIGTRAP during launch,
before navigation or layout assertions. Evidence: `preflight-public-rerun.tap`.
A focused retry used `NEO_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable`
instead of the VM wrapper and a repo-local temporary profile; it also exited
SIGTRAP (`preflight-layout-direct.tap`). No shared browser/process was stopped,
no system browser/profile was changed, and no UI source was altered. Receiving
Heavy should rerun the unchanged layout test on a functioning browser host.

Final owned focused suite: 50/50 pass (`focused-final.tap`). The earlier adapter
failure is fixed; no unresolved owned test failure remains.
