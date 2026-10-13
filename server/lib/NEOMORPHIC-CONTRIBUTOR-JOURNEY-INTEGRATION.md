# Exact private journey staging mount

Default mode is disabled and loads no service or database. The optional mount in
server/app.js runs before the host parser and closes on shutdown. Its default
ENTRY_URL is vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js.
The received compiled artifact is from Neomorphic86779187cb0b03afee06dd9bb52fcdcdbeb0ebfd,
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
