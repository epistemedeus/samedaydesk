# ROOT-INTAKE-READINESS-104130

## Identity

- model: grok-4.7, effort xhigh
- session: fc2d669b-da9c-4934-bf35-8afedcb1e5b7
- branch: codex/intake-readiness-104130
- base: 08b90bdef8dbd198023be447942a3119cb268235
- head: PENDING_MEASUREMENT
- VM: Node v22.22.2, PostgreSQL 16.15. Hostinger's Node 22.23.3 probe is build evidence, not this process and not the serving process.

`head` is the repair commit. The branch tip is the child commit that records this measured hash.

## Change

`IntegrationStore.checkReady` now checks storage and schema only. A historical portable profile stays project-scoped execution evidence. `checkInstalledVerification`, installed fingerprints (`process.version` included), serving-runtime publication checks, host binding, and per-operation admission, execution, and publication checks are unchanged. No pool was deleted, resealed, renewed, or given a new generation or budget.

## Old failure, unedited source

Disposable PostgreSQL, `server/foundry/install.mjs --migrate --install`, valid host `host:vf12-qa` (`configId` `sha256:b12b0f33d296a39b0859a40aab816ce027c417f37e90491d262795fcc7b4dd00`), charged 0, plus a stale portable pool whose `runtimePin` differed from `installation().runtimePin`. Store bytes were still `b728ce736eece8bd3fdab6ad0865117e486b82103a833a1deabcf876ac0e35eb`.

- `GET /api/health` 200, service `samedaydesk`
- correspondence healthz 200, `enabled: false`, `reason: store_unavailable`
- `GET /api/correspondence/v1/operator/original-tasks` 503, `store_unavailable`
- stderr: `correspondence_store_unavailable { stage: 'entry_readiness', code: 'installed_verification_changed' }`
- pool, attempt, invocation, admission, and charge rows were identical before and after that startup

## Corrected proof

`server/scripts/test-intake-readiness.mjs` uses that same disposable PostgreSQL shape and the real `server/index.js` foundry opt-in mount.

- Startup, empty operator collection, and restart stay up. Health stays 200. Collection is an empty 200, not 503. Stderr does not report `installed_verification_changed`.
- Submit, private `readOriginalTask`, operator collection, and a same-port restart work. The stale row is not treated as a database failure.
- The stale pool's `loadPortableAttempt`, `reserve`, `admit`, and `publish` return `installed_verification_changed` with no child launch. A current pool reaches `stale_attempt_fence` and `stale_cell_fence`. Its publication passes verification and then returns `installed_source_changed` from later eligibility, without a write.
- Reader, wrong project, and expired grant still return `forbidden`, `not_found`, and `unauthorized`. Changed verification bytes return `installed_verification_changed` and are restored.
- Wrong host binding still logs `entry_readiness` / `host_installation_mismatch`. A closed database port logs `base_readiness` / `ECONNREFUSED`. A dropped vf04 table logs `entry_readiness` / `42P01`. Schema `public` stays `invalid_config`. None of these are reported as healthy.
- Startup and private readback do not change historical verification, generation, attempts, grants, allowances, or invocation count. Original-task submit on the disposable schema charges one new enrollment only. Invocations stay 0. The historical pools are unchanged.

## Closure

Prior caller-pin members stay (253 files). All 11 received tuples stay, and the pre-edit closure was appended:

`{base: 32d029b3130c79672a5629aa355892d31ad5e4db, sourcePinSha256: c33ed15f3b7e47361a83dc5fe1ebae8beaba3a5f543d9f5d01da865d815adcda, closureDigest: sha256:9814323d166563cfe9338a5d3c826af1aa9e46a8fbc15b8ef0ae67f37525f9b3}`

Reviewed current closure:

`{base: 08b90bdef8dbd198023be447942a3119cb268235, sourcePinSha256: 02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15, closureDigest: sha256:7c5d16672e263c2f8672bbfe0a1065dac94f2cb057d6fe6e44b8a8a37ceb0a61}`

`SOURCE-PIN.json` amendment `ROOT-INTAKE-READINESS-104130` binds `store.mjs` from `b728ce736eece8bd3fdab6ad0865117e486b82103a833a1deabcf876ac0e35eb` to `6c2fd20ada759876543229b65a8c50bc3865bd9de493a0dd4a275819b8435547` at sdsBase `08b90bdef8dbd198023be447942a3119cb268235`. `npm run test:proxy-addr` replayed caller-closure tamper refusal (`caller_source_changed`) and retained every received tuple. A mutated closure digest is refused.

## Gates

Local runtime-startup workflow, after `npm ci --omit=dev --ignore-scripts`. Disposable PostgreSQL via `PULSE_PG_BIN=/usr/lib/postgresql/16/bin`.

| command | tests | pass | fail | skipped |
| --- | ---: | ---: | ---: | ---: |
| `npm run test:proxy-addr` | 7 | 7 | 0 | 0 |
| `node --test server/scripts/test-correspondence-startup-diagnostic.js` | 7 | 7 | 0 | 0 |
| `npm run test:hosted-startup` | 4 | 4 | 0 | 0 |
| `npm run test:machine-discovery` | 4 | 4 | 0 | 0 |
| `PULSE_PG_BIN="$(pg_config --bindir)" npm run test:pulse` | 80 | 80 | 0 | 0 |
| `PULSE_PG_BIN="$(pg_config --bindir)" npm run test:original-task` | 8 | 8 | 0 | 0 |
| `npm run test:agent-readiness` | 150 | 150 | 0 | 0 |
| `npm run test:l08-agent-repair` | 28 | 28 | 0 | 0 |
| `npm run test:mcp` | 46 | 46 | 0 | 0 |
| `node --test server/scripts/test-public-readiness-load-failure.js` | 1 | 1 | 0 | 0 |
| total | 335 | 335 | 0 | 0 |

Cancelled 0. The original-task count includes `test-intake-readiness.mjs`.

## Files

- `vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/store.mjs`
- `server/scripts/test-intake-readiness.mjs`
- `package.json`
- `vendor/visitor-foundry-receiver/SOURCE-PIN.json`
- `server/foundry/activation/private-control-pin.json`
- `RESULT.md`

## Limits

- Not merged and not deployed. No production migration, paid task, TLS change, or owner-QA refill.
- This VM did not measure the Hostinger serving-process Node version.
- The local l08 gate rewrote `tools/l08-agent-repair/MAINT-HANDOFF.json` and `TASK-READINESS-RECEIPT.json`. Those rewrites are not part of this repair and are not in the commit.
- `intake-startup-104110/ROOT-RECEIVING.md` was not in the pilot tree. The closure follows the original-task and retained-host receiving pattern already in the pin.
- Reference runtime materialization wrote gitignored `execution/.runtime` on this VM.
