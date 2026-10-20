# ROOT129 contributor mount recovery

Recorded failure, the shared startup fix, and the rollout/rollback inputs.
This note does not install, deploy, restart, enroll, rotate keys, or read a
production secret. No new environment key is added. No schema migration runs.

## Recorded public failure

At 2026-10-17 00:21:45Z, `https://samedaydesk.com/api/neomorphic-contributor-journey/healthz`
and `https://samedaydesk.com/api/neomorphic-contributor-journey/v1/account/session`
both returned HTTP 503 before auth. The JSON object had exactly the keys
`error`, `publicEnabled`, `ready`, and `releaseAccepted`. `error.code` was
`unavailable`. The three booleans were false. The body was 92 bytes.

On the same host, `GET /api/neomorphic-opportunity/healthz` was HTTP 200 with
`ok: true`, `enabled: true`, and `store: postgres`. `GET /api/health` was HTTP 200
with `ok: true`.

The unchanged Hostinger build is `01a1416b-e9c0-7082-aa13-bb3fb8dbfe71` at SDS
`e56c4d84f1c59f02307d5aa9a2c330957a28aa6d` on `codex/ae36-307-deploy-caller`,
built 2026-10-15 21:16:36Z. Runtime shape: Node 22, Express, `server/index.js`,
`build:managed-foundry`, 71 masked environment keys. One process restart at
about 00:26Z left both routes at 503. This change does not restart that process.

At that commit, `server/lib/contributor-managed-mount.js` and
`server/lib/neomorphic-contributor-journey-mount.js` start one init and, on
failure, keep `unavailable` for the process lifetime. The managed outer catch
discards the error. The public 503 is that managed handler, not the journey
disabled router. The listening lines at 00:26:35Z and 00:27:02Z still contain
no initializer cause, because that catch logged nothing. Do not treat the 503
as a missing password, an expiring lease, a new signup, or an empty claim list.

A metadata-only read of logs that already exist can still name the stage.
Locator: Hostinger `get_node_js_runtime_logs_v1`,

`GET /api/hosting/v1/accounts/{username}/websites/samedaydesk.com/nodejs/runtime-logs?period=1d&limit=5000`

Do not combine `period` with `from_line`. Do not send `levels`. Do not call
`DELETE .../runtime-logs`. Keep only entries from `2026-10-17T00:15:00Z` through
`2026-10-17T00:40:00Z`. The deployed catch writes nothing, so the window may be
absent or unclassified. That does not change this fix.

## ROOT132 source-binding refusal

ROOT132, incorporating ROOT130, names the 503 after the 00:26Z restart. Private
health was still 503 at 00:31:34Z. This is a permanent source-binding mismatch.
It is not certificate expiry and not a transient database failure. Bounded
request retry stays in place for real transient failures. It is not this
incident's trigger.

ROOT133 keeps the evidence types distinct. The full-value read is native hPanel
at 2026-10-17 00:44:35Z. Root read all 71 unmasked values and printed or changed
nothing. Profile was live, managed was 1, public reads were 0, and human assets
were 0. HMAC, store, product, origin, and installation bindings validated.
`CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT` and the signed qualification still name SDS
`6d6c70d73d5e3fc841b9bf90cea390e948b7e4dc`, issued 2026-10-14 02:28:19Z. The
serving build is `e56c4d84f1c59f02307d5aa9a2c330957a28aa6d`. Root has not mutated
config or source on Hostinger. Host filesystem identity is still unreceived.

The source-member comparison at 2026-10-17 00:46:34Z is exact Git, recomputed
from the blobs in this repository. It is not host filesystem proof. Across the
15 qualification members at those two commits, the signed edge digest is
`bb5b9a7c2bc03f183af22ba8d1edcd6a9c46a976cf5b6478fe6b7c51686ec13d` and the
serving edge digest is
`024bb6ad40337e8751cde96b9d323b81fa95ad1bdb5a27214cbe778211565514`. The changed
members are `package.json`, `package-lock.json`, `server/index.js`, and
`server/app.js`.

`loadContributorHttpsQualification` keeps the static refusal
`qualified source/origin/store differs`. When the SDS commit or a source
identity field differs, the error code is `installed_source_changed`. A
profile, origin, installation, or store-only mismatch uses
`installed_verification_changed`. The public body stays `unavailable`. The log
is `{stage, code}` only. A later request does not retry it. This 503 is not an
empty claim list. Commit `21d9deda9cf53eacce6445d4d05a24ffe9366ab1` (draft PR
311) is received source. It is not restored production.

A preserve-values deployment must not keep a qualification bound to another SDS
commit and report the old private service as preserved. The Pilot preflight at
`bc041c06cb813fd4a2b4d1602af174e65cc333e0` now refuses before a provider write
unless `CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT` and the decoded qualification
payload `binding.sdsCommit` both equal `manifest.commit`. It decodes the
payload only. It does not check or forge a signature, and it does not restamp
the retained bytes. Root owns the fresh four-policy HTTPS qualification, the
provider, TLS, and the production install. Allocations and debt stay reserved.

## Fix

`server/lib/contributor-mount-recovery.js` is the one startup policy for both
mounts. The first attempt still runs when the mount is created. After a
transient failure, the next request to an owned route is the only thing that
starts another attempt. One initializer is in flight. Callers that arrive during
that attempt share it. Backoff is `1000, 2000, 4000, 8000, 16000, 30000`
milliseconds, measured with the caller clock. There is no `setTimeout`,
`setInterval`, resident loop, or watchdog.

The log line is `contributor_journey_unavailable` or
`contributor_managed_unavailable` and a copied `{stage, code}` only. The public
body stays the existing coarse code. Journey `ERR_MODULE_NOT_FOUND` or
`MODULE_NOT_FOUND` stays `integration_pending`. A journey `service_config`
refusal stays `invalid_config`. Every other journey failure stays `unavailable`.
The managed route keeps `unavailable` until the inner runtime is ready, including
when the inner reason is `invalid_config`.

These stages stay closed for the process: `source_verify`, `qualification_load`,
`ingress_profile`, `asset_load`, `service_config`. These codes stay closed:
`28P01`, `28000`, `42501`, `3D000`, `3F000`, certificate refusals,
`ERR_MODULE_NOT_FOUND`, `MODULE_NOT_FOUND`, `ENOENT`, `ENOTDIR`, `EACCES`,
`EPERM`, `EROFS`, `installed_source_changed`, `installed_verification_changed`,
and `INVALID_INPUT`. Exact source, qualification, enrollment, and config refusal
sentences stay closed and are not logged. A later request does not retry them.

Source verification, origin checks, store binding, HTTPS edge checks, money
gates, and human asset publication are unchanged. A store outage does not mount
desk assets and does not report claims. `createJourneyRuntime` and
`createPostgresStore` still close a pool when init throws. After the runtime is
ready, a later database restart uses the existing pool. Recovery does not build
a second runtime. Shutdown sets the mount closed, waits for the in-flight init,
and closes the runtime. A request after shutdown does not become ready.

`server/lib/contributor-https-qualification.js` now includes
`server/lib/contributor-mount-recovery.js` in `MEMBERS`. An existing
`CONTRIBUTOR_DESK_HTTPS_QUALIFICATION` for `litespeed-https-only` does not match
these bytes. That mode stays closed until Root issues a fresh qualification for
the successor commit. `trusted-tcp` and `passenger-native` do not load that
qualification. The caller pin in
`server/foundry/activation/private-control-pin.json` records the new bytes and
retains the previous closure.

## Focused proof on this VM

`node --test --test-concurrency=1 server/scripts/test-contributor-mount-recovery.mjs`
drives `createSdsApp` with the managed mount. The injected store is a disposable
Postgres 16 cluster with a local CA, `sslmode=verify-full`, and a localhost
certificate. The first observation, before the database was started, was:

```text
ROOT129_INITIAL stage=store_create code=ECONNREFUSED attempts=1 inits=1
```

Both healthz and `/v1/account/session` were HTTP 503 with the same four keys and
`error.code=unavailable`. Eight concurrent callers shared the next init
(`initializations` 2) and stayed on 503. After the database started and the
backoff elapsed, one request reached ready:

```text
ROOT129_RECOVERED status=ready inits=3
```

Further requests did not start another init. Signup, session, one claim, its
terms version, reservation status `completed`, and obligation `payout_state`
`owed` were then read back. Stopping that database made session and
`/v1/claims/claims` return 503 `unavailable` with no claims array and did not
start another init. Starting it again returned the same account id, terms
version, completed reservation, and owed obligation, without a process restart.
After close, other backends on that database were 0.

Shutdown during a paused verified-TLS handshake left the mount `disabled` and
terminal. A later request did not resume it. A bad artifact
(`source_verify` / `installed_source_changed`), a bad LiteSpeed qualification
(`qualification_load`), mode `production` (`ingress_profile` / `INVALID_INPUT`),
and a SCRAM authentication refusal (`28P01`) stayed terminal. A direct journey
mount in mode `production` with an injected loader stayed `invalid_config` and
did not init. The three recovery sources contain no timer call. This
amendment's recovery suite was 7 passed, 0 failed. The prior export of that
file was 6 passed, 0 failed.

`server/scripts/test-neomorphic-contributor-journey-mount.mjs` passed.
`server/scripts/test-correspondence-startup-diagnostic.js` passed, including the
added stages. `server/scripts/test-contributor-https-qualification.mjs` passed
the edge-hash load, the older-edge refusal, and the other admission cases.
The unsafe-input case now sets mode `0644` after the private write, so umask
`0077` cannot hide the rejection. `readPrivateJson` is unchanged. The caller
closure check `verifyCallerClosure()` accepts the updated pin. The focused
recovery suite still records the transient store outage and its recovery, and
it also keeps the older-edge qualification closed at `qualification_load` /
`installed_source_changed` with session and claims on 503 `unavailable` and no
claims array.

## Installed journey regression

The first replay of the received product's
`tests/contributor-journey/installed.test.ts` against this worktree ran before
`dist/contribute/index.html` existed. Its receipt had 11 passed checks and one
failure: "actual styled browser preview uses HTTPS HttpOnly session and the
installed producer, including mobile and reload". That page is emitted only when
`CONTRIBUTOR_JOURNEY_PREVIEW=1` and
`PUBLIC_CONTRIBUTOR_JOURNEY_PREVIEW_API=/api/neomorphic-contributor-journey`.
The preview was built in the received product tree. Compiled desk assets were
not copied into this SDS checkout.

After that build, the same replay passed all 12 checks. Node TAP was 13 passed
and 0 failed. `wholePrivateJourneyPassed` is true. `releaseAccepted` is false,
`publicEnabled` is false, and `settlement` is `synthetic_fixture_only`.

`server/scripts/test-neomorphic-contributor-journey-staging.mjs` then passed its
one test (0 failed) with `CONTRIBUTOR_JOURNEY_TEST_PRODUCT_ROOT` set to that
product and `CONTRIBUTOR_JOURNEY_TEST_PG_BIN=/usr/lib/postgresql/16/bin`. The
script sets `CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR=1` and this worktree as
`CONTRIBUTOR_JOURNEY_TEST_SDS_ROOT`. The focused recovery suite was run again
after the signup helper was reduced to one request, and again reported
`ROOT129_INITIAL stage=store_create code=ECONNREFUSED attempts=1 inits=1` and
`ROOT129_RECOVERED status=ready inits=3`, with 6 passed and 0 failed.

## Rollout

Root installs through the existing controller. This packet does not.

1. Receive the successor commit on `codex/root129-contributor-mount-recovery`.
   Do not reset `codex/ae36-307-deploy-caller` or `main` from here.
2. Keep the current full authoritative environment. Resolve it from the
   restricted store, not from masked GET values. The existing preparer is
   `server/scripts/prepare-contributor-environment.mjs` with `--existing`,
   `--listed`, `--overlay`, `--install`, and `--rollback`. Do not send a
   provider PUT from this change.
3. There are no new keys. Preserve at least:
   `CONTRIBUTOR_JOURNEY_MODE`, `CONTRIBUTOR_JOURNEY_INSTALLED`,
   `CONTRIBUTOR_JOURNEY_SOURCE_COMMIT`, `CONTRIBUTOR_JOURNEY_DATABASE_URL`
   (`sslmode=verify-full` and a relative `sslrootcert` under
   `server/certificates/contributor-database-ca.crt` when that is the enrolled
   form), `CONTRIBUTOR_JOURNEY_STORE_ID`,
   `CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA`,
   `CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA`,
   `CONTRIBUTOR_JOURNEY_REPLAY_KEY`, `CONTRIBUTOR_JOURNEY_INTEGRITY_KEY`,
   `CONTRIBUTOR_JOURNEY_CURSOR_KEY`, `CONTRIBUTOR_JOURNEY_OWNER_TOKEN`,
   `CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN`,
   `CONTRIBUTOR_JOURNEY_PUBLIC_READS` (`0`), `CONTRIBUTOR_DESK_MANAGED_ENABLED`,
   `CONTRIBUTOR_DESK_ASSETS_ENABLED`, `CONTRIBUTOR_DESK_INGRESS_MODE`,
   `CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS`, `CONTRIBUTOR_DESK_HTTPS_QUALIFICATION`,
   `CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF`, `CONTRIBUTOR_JOURNEY_ORIGIN`,
   `CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN`, `CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS`,
   and `CONTRIBUTOR_JOURNEY_TRUST_PROXY` (`0`).
4. If `CONTRIBUTOR_DESK_INGRESS_MODE` is `litespeed-https-only`, leave serving
   closed until Root signs a fresh qualification for this SDS commit. The
   serving qualification names `6d6c70d73d5e3fc841b9bf90cea390e948b7e4dc` while
   the serving build is `e56c4d84f1c59f02307d5aa9a2c330957a28aa6d`. Reusing it
   is a permanent `qualification_load` / `installed_source_changed` refusal.
   Do not preserve-values deploy a new commit while that qualification, or
   `CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT`, names a different commit. The Pilot
   preflight refuses that pair before a provider write.
5. After Root's own install, read healthz and `/v1/account/session`. A transient
   store failure is 503 `unavailable` and can become ready on a later request
   without another process start. A source, qualification, credential, or config
   refusal stays closed for that process. Do not report an empty claim from
   either 503.
6. Optional: the runtime-log read in the first section. Return only allowlisted
   stage and code tokens. Do not copy message text, stacks, SQL, paths, URLs,
   environment, cookies, or account ids.

Build locator for the bytes now serving: `01a1416b-e9c0-7082-aa13-bb3fb8dbfe71`.
Source locator for those bytes: `e56c4d84f1c59f02307d5aa9a2c330957a28aa6d`.

## Rollback

Restore the retained full prior environment and the prior exact source
`e56c4d84f1c59f02307d5aa9a2c330957a28aa6d` through the existing controller.
If a replacement qualification was installed, restore the prior qualification
value with that full environment. Do not down-migrate schemas, rotate the stable
keys, or rewrite an obligation. No rollback was executed here.

The prior build id is `01a1416b-e9c0-7082-aa13-bb3fb8dbfe71` on
`codex/ae36-307-deploy-caller`.
