# Same-origin HTTPS contributor desk preparation

This is a private hosting recipe, with the original SDS entrypoint and both
human homepages untouched. It does not deploy, bind DNS or assert that a domain
is already configured. Static Hostinger assets cannot be assumed to proxy the
SDS Node API. Keep the existing human preview review and public activation off.

## Exact topology

`server/contributor-desk-host.mjs` opens **one loopback HTTPS socket**. It serves
the unchanged Astro operator desk from `vendor/neomorphic-contributor-desk` at
`/contribute/`, compiled `/_astro` bundles, exact `/styles`, `/fonts`, the existing
`/scripts/office.js` and icons. On that same socket it dispatches only
`/api/neomorphic-contributor-journey` through the **existing SDS app and default
compiled mount**. It does not expose unrelated merchant routes or a replacement
homepage. `/` and missing assets return404, never a SPA or success-shaped HTML.

The runner is disabled unless `CONTRIBUTOR_DESK_HOST_ENABLED=1` and the installed
profile is explicitly selected. Its configured origin is exact HTTPS. Host
headers must match it; forwarded host/proto/IP cannot widen authority. Stable
account cookies remain `__Host-neo_contributor`, Secure, HttpOnly, SameSite=Strict,
Path=/, with no Domain. Same-origin session/CSRF checks remain in the producer.
No cross-origin manifest URL, cookie downgrade or wildcard origin is supported.
Live public derivative reads must stay off in this private runner.

Both artifact manifests must name the same exact product source, equal to
`CONTRIBUTOR_JOURNEY_SOURCE_COMMIT`. Before listening, the runner and mount
verify all file hashes/lengths, reject unlisted/symlink members, check the runtime
source stamp and SDS locked dependency identity. A source/hash mismatch or an
unenrolled live store stops this runner; the normal SDS mount leaves only its
own prefix unavailable. An unavailable API never becomes an Astro page.

## Executable private receiving

From the owned Neomorphic clone, use its existing locks and build/export commands
in `services/contributor-journey/LIVE-PROFILE.md`. This exports a committed
runtime, then rebuilds the unchanged opt-in Astro desk with the exact relative
API path. From the owned SDS clone, run `npm ci`. Save the environment privately
with mode0600; secret-store keys and TLS private keys are not artifacts.

A local privately received origin is `https://127.0.0.1:6443`. For a bounded
private check, create a task-owned certificate and explicitly trust it in the
receiving client:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 \
  -keyout /private/desk-key.pem -out /private/desk-cert.pem
```

Configure these values in the private environment, together with either the
source's `preview.env.example` or `live.env.example` profile:

```text
CONTRIBUTOR_DESK_HOST_ENABLED=1
CONTRIBUTOR_DESK_PORT=6443
CONTRIBUTOR_DESK_TLS_KEY_FILE=/private/desk-key.pem
CONTRIBUTOR_DESK_TLS_CERT_FILE=/private/desk-cert.pem
CONTRIBUTOR_JOURNEY_SOURCE_COMMIT=EXACT_EXPORTED_PRODUCT_COMMIT
# Staging: CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN=https://127.0.0.1:6443
# Live: CONTRIBUTOR_JOURNEY_ORIGIN=https://127.0.0.1:6443
CONTRIBUTOR_JOURNEY_PUBLIC_READS=0
```

Live additionally requires explicit migration/enrollment with the stable source
environment. Empty source bindings prepare signup/delivery without advertising
invented work; fixture/task tests remain staging. Then run:

```sh
node --env-file=/private/desk.env server/scripts/enroll-contributor-journey.mjs migrate
node --env-file=/private/desk.env server/scripts/enroll-contributor-journey.mjs enroll
node --env-file=/private/desk.env server/scripts/enroll-contributor-journey.mjs inspect
node --env-file=/private/desk.env server/contributor-desk-host.mjs
curl --cacert /private/desk-cert.pem https://127.0.0.1:6443/contribute/
curl --cacert /private/desk-cert.pem https://127.0.0.1:6443/api/neomorphic-contributor-journey/healthz
```

Read back the actual JSON readiness, exact source and release flags. Stop the
owned runner with SIGTERM to drain listener/stores. It has no background timer,
DNS client, payment adapter or mail sender. Restart with the same private
environment and selected store. Recovery preserves the account/principal FKs
and canonical obligations; it does not rotate server keys or copy ledgers.

## One remaining ingress input

Root needs **one concrete HTTPS desk ingress binding**: its exact origin and a
TLS route forwarding all of the desk asset paths and the unchanged API prefix
to this Node receiver on the same host. A supported existing ingress with a
branded desk host may supply that binding; it must retain the selected Host and
exact origin, serve a valid certificate and isolate the loopback receiver.
The certificate/origin must be selected before durable enrollment. A static
hosting account alone does not provide it. No public origin or provider route
was available or configured in this assignment; only the exact loopback TLS
topology is proved. Do not treat these tests as hosted receiving for an
unconfigured domain. A deployment to a different origin requires explicit
fresh deployment enrollment, not an alias/CORS exception to an existing store.

Actual production account/task/requester bindings and independent qualified
settlement are separate source inputs. This package does not fabricate them.
Paid badges stay absent and no funded round, live account or legacy import is
created by preparation. Existing221400 email terms/grants/obligations continue
under their exclusive original authority.

## Private verification commands

The existing thirteen-test journey and four-test browser suite can replay this
real serving topology by selecting the test-host recipe. All identities/tasks
in those suites stay synthetic staging, including preserved legacy fixture IOUs:

```sh
CONTRIBUTOR_JOURNEY_TEST_SDS_ROOT=/absolute/owned/samedaydesk \
CONTRIBUTOR_JOURNEY_TEST_PG_BIN=/usr/lib/postgresql/16/bin \
CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR=1 \
CONTRIBUTOR_JOURNEY_TEST_DESK_HOST=1 \
node --import ./services/contributor-journey/node_modules/tsx/dist/loader.mjs \
  --test --test-concurrency=1 tests/contributor-journey/installed.test.ts tests/contributor-journey/browser.test.ts
```

These commands run from the exact Neomorphic source. Its separate
`live-profile.test.ts` checks actual PG migrations, idempotent enrollment,
fixture refusal and backup/restore without creating a production customer.
`hosted-live-empty.test.ts` uses the committed SDS receiver/artifacts on actual
HTTPS/PG, verifies every served artifact byte, missing enrollment, Host/origin
failures, no live accounts/rounds, cold restart and corrupted-enrollment refusal.
Those scopes remain separate from genuine production-task receiving and public
release. Root handles final receiving and the already pending human review.
