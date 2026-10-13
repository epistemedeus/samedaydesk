# Exact contributor journey mount and private HTTPS receiver

Default mode is disabled and loads no service or database. The optional mount in
server/app.js runs before the host parser and closes on shutdown. Its default
ENTRY_URL is vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js.
The received compiled artifact is from Neomorphic
`ccad608b548c1098f3b9cfc40eee5317cda11840`, built from the committed source
on received base2a0cbd71b0c14c124d592ed6b6b66f7f35cbacd4 and SDS
f864cadceaa7d2ee80077058992e95102ef361ae. SOURCE.json enumerates403 exact file hashes and
lengths, integrated source/base pins, build command and the unchanged SDS lock hash.
The manifest itself is committed separately. No existing opportunity/correspondence
vendor, homepage, package dependency or production configuration was changed.

Use existing SDS npm ci. Required host versions are express5.2.1, pg8.23.0 and
zod3.25.76, already present in its lock. Internal F01 and funded-terms runtime
closures are included; their explicit node_modules files are part of the artifact,
not downloaded dependencies. Node imports the installed runtime without a TS loader.

The producer's services/contributor-journey/INTEGRATION.md and preview.env.example
at the exact source commit define complete configuration, migrations, API paths,
controller enrollment and preview. All service credentials/keys remain server-side.
Staging selects a dedicated synthetic DB, canonical HTTPS preview origin, stable
keys and explicit test/fixture future-round allowlist. Live instead requires the
source's LIVE-PROFILE.md and live.env.example: explicitly enrolled durable
store/origin/keys and exact existing production round/terms/task/requester bindings.
It refuses fixture-port adapters, unqualified account-store promotion and legacy
rounds. No genuine installed settlement registry is supplied; badges remain absent.
Public derivative reads are separately disabled by default. The SDS live mount
requires CONTRIBUTOR_JOURNEY_SOURCE_COMMIT equal to the exact manifest and
validates the compiled closure and unchanged lock before importing it. Root must keep MODE=disabled
until independent receiving and operator preview. No mail, payment or production
signup/offer activation is authorized by this export.

Operator preview: serve the Neomorphic opt-in noindex build at /contribute/ and
reverse-proxy /api/neomorphic-contributor-journey to this loopback SDS service on
that same origin. This preserves Neomorphic's own styles and SDS's separate brand.
The separate opt-in HTTPS runner described in [HOSTING.md](HOSTING.md) receives
45 exact unchanged operator desk/asset members from the same product commit.
It serves the default SDS mount and those bytes on one loopback TLS socket,
without changing the original entrypoint, homepages or any customer-visible route.
This is tested local-hosted composition; a concrete HTTPS ingress origin/binding
remains a Root input, not an assumed Hostinger proxy or public-domain pass.

Tests from SDS root, one worker:

node --test --test-concurrency=1 server/scripts/test-neomorphic-contributor-journey-mount.mjs server/scripts/test-neomorphic-contributor-journey-artifact.mjs

CONTRIBUTOR_JOURNEY_TEST_PRODUCT_ROOT=/absolute/exact/neomorphic \
CONTRIBUTOR_JOURNEY_TEST_PG_BIN=/path/to/postgresql/16/bin \
node --test --test-concurrency=1 server/scripts/test-neomorphic-contributor-journey-staging.mjs

The latter runs the actual installed compiled producer through SDS's DEFAULT
loader, disposable Postgres/HTTPS and Chrome with two private accounts/requester,
race, lost responses, restart/recovery, one original future IOU, preserved old IOU,
source tampering, synthetic proof/refused counter, withdrawal and referred signup.
It supplies no loader, fake kernel, Map account binding or mock persistence.
Synthetic settlement verification remains labelled; public paid status stays false.
Worker assertions do not replace final Root receiving or the existing operator review.

Browser receiving correction: the exact source clears private DOM on account/session
changes, partitions uncertain commands by account and exact body/key, and reads
actual enrolled task authority at GET /v1/desk. Review/moderation controls require
that authority and the actual ReviewView.viewer. No new permission issuer, store,
account migration, dependency or headless client-pack change is included.

After building the source's noindex operator preview with the documented flags,
run the focused browser receiving from the exact Neomorphic root:

CONTRIBUTOR_JOURNEY_TEST_SDS_ROOT=/absolute/this/samedaydesk \
CONTRIBUTOR_JOURNEY_TEST_PG_BIN=/path/to/postgresql/16/bin \
CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR=1 \
CONTRIBUTOR_JOURNEY_TEST_DESK_HOST=1 \
CONTRIBUTOR_JOURNEY_BROWSER_EVIDENCE=/absolute/task-owned/evidence \
node --import ./services/contributor-journey/node_modules/tsx/dist/loader.mjs \
  --test --test-concurrency=1 tests/contributor-journey/browser.test.ts

This is a separate browser regression replay; do not count the older thirteen
whole-path cases as testing these transitions. The new cases use actual HTTPS/
Postgres/Chrome, a committed partial-response loss, account switching and recovery,
logout/revocation/expiry, viewer roles, moderation/withdrawal, reload and mobile.
All task/account/share data is synthetic owner QA. The original export and red
observations remain in Pilot227800. Human publication awaits operator preview
review and independent receiving; the default mount remains disabled.
