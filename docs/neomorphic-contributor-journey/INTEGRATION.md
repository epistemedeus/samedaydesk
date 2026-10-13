# Exact private journey staging mount

Default mode is disabled and loads no service or database. The optional mount in
server/app.js runs before the host parser and closes on shutdown. Its default
ENTRY_URL is vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js.
The received compiled artifact is from Neomorphic78b2544175d880290879775127b5fd97402f48a6,
built from the committed source. SOURCE.json enumerates396 exact file hashes and
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
Select a dedicated synthetic staging DB and canonical HTTPS preview origin, stable
keys and explicit test/fixture future-round allowlist. Root must keep MODE=disabled
until independent receiving and operator preview. No mail, payment or production
signup/offer activation is authorized by this export.

Operator preview: serve the Neomorphic opt-in noindex build at /contribute/ and
reverse-proxy /api/neomorphic-contributor-journey to this loopback SDS service on
that same origin. This preserves Neomorphic's own styles and SDS's separate brand.
The backend runtime does not install a homepage or preview UI into SDS.

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
Worker assertions do not replace Root228000 independent receiving or operator review.

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
