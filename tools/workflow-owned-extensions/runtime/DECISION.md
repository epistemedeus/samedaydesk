# Runtime choice: Ghost 6.75.0 local (SQLite)

Chosen runtime: Ghost 6.75.0, installed locally with SQLite through ghost-cli 1.34.1.
No Docker. Admin API JWT from a locally provisioned custom integration. The Admin
API key is written to a 0600 file under `$ROOT/runtime-home` and is never placed
in argv, logs, or git.

This file records the source decision. It does not report that a runtime ran.

## Why Ghost, not Dify or native

1. Ghost is the cheapest fitting supported runtime on a Cursor VM. `npm view ghost`
   on 2026-11-05 reports Ghost 6.75.0 engines `node: ^22.23.1 || ^24.20.0`. Ghost
   6.73.0 (the named target in H64313) declares the same engines. ghost-cli 1.34.1
   declares `node: ^22.13.0 || ^24.0.0`. A local install uses SQLite and node 22,
   with no compose stack.
2. Dify is heavier and already had a closed portable-install path. H64314 and
   H80300 install a self-hosted Dify engine (pin 1.18.0 /
   50abea97062110044f15d0e03ccecadd9ccc87ca) with Docker Compose and a plugin
   daemon. H80300 measured that stack at 1360.6MiB. STATE.md records Dify 0.1.2
   as a maintained package and Dify 0.1.1 as having no cold-install exit 0.
   H10200 notes Ghost has no comparable in-source state-path defect. Repeating
   Dify table-csv or document-to-CSV work would replay the closed simple-extraction
   comparison (E02 / H64314 / H80300), not embed result-reuse.
3. Native Tasks is not a durable runtime here. STATE.md and the existing package
   README record it as wire-only, with no durable TaskStore recovery.

Ghost was not rejected. H64313 named Ghost 6.73 as the installed-runtime target
and distinguished a real instance from an in-process fixture. H64332 received
that completed installed work and used disposable Ghost/SQLite. GRAND-PLAN B5
and NEXT-FANOUT-PLAN E02/E03 ask for a useful embedding on an existing
Dify/Ghost/native foundation, with fitting and non-fitting input, update/remove,
and no new catalog. The existing package already projects an unpublished Ghost
draft. Driving the real Ghost Admin API is the remaining cheapest actual
embedding.

Prior inventory did not show a warm Dify Docker stack waiting on the destination
VM, so cost ranking follows the assignment: Ghost local first, Dify Docker later
only if Ghost cannot fit.

## Pilot files read

- overview/self-evaluations/2026-11-04-useful-reuse/GRAND-PLAN.md
- overview/self-evaluations/2026-11-04-useful-reuse/NEXT-FANOUT-PLAN.md
- overview/self-evaluations/2026-11-04-useful-reuse/INTEGRATED-DECISIONS.md
- overview/self-evaluations/2026-11-04-useful-reuse/ASSESSMENT.md
- overview/self-evaluations/2026-11-04-useful-reuse/WORKFLOW-RECEIVING.md
- overview/self-evaluations/2026-11-04-useful-reuse/PILOT-SOURCE-INTEGRATION.md
- overview/self-evaluations/2026-11-04-useful-reuse/LIVE-EXECUTION.md
- overview/self-evaluations/2026-11-04-useful-reuse/README.md
- overview/self-evaluations/2026-11-04-useful-reuse/ROOT-RESEARCH.md
- overview/self-evaluations/2026-11-04-useful-reuse/ADVISORY-RUNS.md
- overview/self-evaluations/2026-11-04-useful-reuse/ARGON-CLI-ANSWER.md
- overview/STATE.md
- overview/remote-worker/assignments/H64313-GHOST-INSTALLED-DELIVERY-20261029.md
- overview/remote-worker/assignments/H64332-PUBLIC-GHOST-INTEGRATION-20261029.md
- overview/remote-worker/assignments/H64314-DIFY-USEFUL-WORKFLOW-20261029.md
- overview/remote-worker/assignments/H10200-DIFY-INSTALLER-STATE-BOUNDARY-20261030.md
- overview/remote-worker/assignments/H80300-DIFY-PORTABLE-DISTRIBUTION-20261030.md
- overview/remote-worker/scale1158-cohort/we-run.sh (ref 51f584ac)

That useful-reuse directory has no file named inventory, accepted, or rejected.
The accepted/rejected evidence used above comes from those planning files, STATE,
and the named assignment notes. The closed simple-extraction comparison is the
already received Dify table-csv / document-to-CSV versus direct-reader work
(E02, H64314, H80300, STATE Dify 0.1.1/0.1.2). This embedding uses result-reuse
page-change, n45, and before-work decision fixtures instead.

## What the VM run is supposed to prove

run-runtime.sh installs Ghost 6.75.0 under `$ROOT/runtime-home`, starts it on
localhost, provisions a custom integration through the local admin setup/session
APIs, and runs `test/runtime/acceptance.mjs` (outside the default unit-test glob).
Acceptance reads posts back from the Ghost Admin API:

- fitting: reused observation creates an unpublished draft (`status=draft`)
- non-fitting: unrecognized or missing-identity input is refused and no draft appears
- retained reuse: `decideOrReuse` with the producer absent (`producerInvoked=false`) and identical content
- update: version 0.1.1 writes the same draft, confirmed by readback
- remove: the draft is deleted and absent on list/read
- fallback: an unreachable Ghost URL plus the same fitting input through the existing CLI, labeled as fallback, not runtime

Committed manifests stay `source_only_not_installed` / `not yet executed on runtime`.
A VM output file may record `runtime-executed`. That output is not source.

## Risks recorded, not resolved here

- Ghost 6.75.0 engines require node >= 22.23.1 (not 22.23.0). The run script
  fails early if the VM node is older.
- `ghost install --local` may compile `better-sqlite3` if a prebuild is missing.
  The VM then needs ordinary node-gyp tooling. This host did not run that install.
- First-time owner setup is stored in `$ROOT/runtime-home/owner.secret` mode 0600
  so a later key file can be recreated. If both that file and the key file are
  missing after Ghost is already set up, provision refuses rather than guessing.
- Ghost local may bind as `localhost` even when `--url http://127.0.0.1:PORT` is
  passed. The script reads `config.development.json` and probes both hosts.

## pnpm toolchain (2026-11-05)

Cause: Cursor VM job 16161 (bc-e9a6af36) failed ghost-cli check
"Checking pnpm installation" because PATH had pnpm v10.33.4. Ghost 6.75.0
declares `packageManager` `pnpm@12.16.1` plus its sha512 pin
(`npm view ghost@6.75.0 packageManager` on registry.npmjs.org). ghost-cli
1.34.1 (`lib/utils/pnpm.js` `MINIMUM_PNPM_VERSION`, and the doctor check
`lib/commands/doctor/checks/pnpm.js`) requires a bootstrap pnpm >= 11.10.0
to install that pin. installMs was 7942. Unit tests and cli_manifests
passed. The failure is not sqlite and not a missing API key.

Fix: `run-runtime.sh` installs a task-local pnpm 11.28.11 (latest pnpm 11.x
>= 11.10.0 on registry.npmjs.org; both 11.28.11 and 12.16.1 return HTTP 200
for their registry tarballs) under `$ROOT/toolchain` with
`npm install --prefix $ROOT/toolchain pnpm@11.28.11`. Integrity comes from
npm's registry metadata. That `node_modules/.bin` directory is prepended to
PATH for the ghost install step only, so ghost-cli's `execa('pnpm')` sees
the bootstrap first. No global `npm -g`, no `corepack enable` on system
paths, and no `~/.npmrc` edits. The default npm prefix is never used; every
`npm install` passes an explicit `--prefix` under `$ROOT`. A capability
preflight runs after the toolchain and ghost-cli are present and before
`ghost install`, writes `$OUT/runtime-preflight.json` (node version,
engines match against `^22.23.1 || ^24.20.0`, `command -v pnpm` and
`pnpm --version` as seen on that PATH, ghost-cli version, free disk), and
fails with a named reason plus the EXITS key `runtime_preflight`.

## Admin API JWT invalid signature (2026-11-05)

Cause: Cursor VM requalification at tip adda648d failed `runtime_acceptance`
with `Invalid token: invalid signature` in 144ms. None of the case keys were
produced because `listPosts` failed before any fixture ran. Ghost 6.75.0
`core/server/api/endpoints/utils/serializers/output/mappers/integrations.js`
rewrites each admin API key `secret` to `id:secret` (the same form shown in
Ghost Admin). `provision-ghost.mjs` then wrote `${admin.id}:${admin.secret}`,
producing `id:id:hex`. `parseAdminKey` splits on the first colon, so `kid`
was the real key id (Ghost found the key; the error was not
`Unknown Admin API Key`) and the "secret" was `id:hex`.
`Buffer.from(secret, 'hex')` silently truncates at the first non-hex
character, so the JWT was HMAC-signed with the key id bytes instead of the
database secret. Ghost verifies with `Buffer.from(apiKey.get('secret'), 'hex')`
in `core/server/auth/api-key/admin.js`. The database value is the raw hex
secret, not the mapper form.

Fix: `provision-ghost.mjs` writes the Admin API key as `id:secret` without
double-prefixing when Ghost has already combined them. JWT minting rejects a
non-hex secret instead of truncating at a colon. Acceptance failures now
record key id, endpoint, and HTTP status, and never print the secret.
`test/admin-key.test.mjs` covers a raw secret, a mapper-prefixed secret, and
invalid or double-prefixed secrets at `formatAdminKey` and `ghostAdminToken`.
Invalid secrets are refused and are not truncated into a signature. The local
install command passes `--ip 127.0.0.1` so the disposable runtime stays on
loopback. The default in ghost-cli 1.34.1 is already that address.

## Runtime clock (2026-11-06)

`node -p "Date.now()"` prints an ANSI-colored number when `FORCE_COLOR` is set.
Arithmetic expansion rejects that value, the stage still continues, and
`runtime-timings.json` records 0 for every duration. `now_ms` uses
`date +%s%3N` and keeps only digits.
