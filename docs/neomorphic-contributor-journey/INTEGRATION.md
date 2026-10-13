# Exact contributor journey mount and private HTTPS receiver

Default mode is disabled and loads no service or database. The optional mount in
server/app.js runs before the host parser and closes on shutdown. Its default
ENTRY_URL is vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js.
The received compiled artifact is from Neomorphic
`5c35cc4b6405f390736e8b5de27f26d202f8cfd3`, built from the committed source
on received base2a0cbd71b0c14c124d592ed6b6b66f7f35cbacd4 and SDS
f864cadceaa7d2ee80077058992e95102ef361ae. SOURCE.json enumerates403 exact file hashes and
lengths, integrated source/base pins, build command and the unchanged SDS lock hash.
The manifest itself is committed separately. The original opportunity service keeps
its original producer plus the explicitly pinned additive continuation overlay in
CONTINUATION-SOURCE.json. Correspondence, homepages, dependencies and production
configuration are unchanged. All45 compiled desk members were rebuilt from this
source and are byte-identical to the supplied input; only their source manifest changed.

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
rounds. Private measurement selects only current configured/enrolled live task IDs
before its row cap; stale links do not admit removed tasks or rounds. No genuine installed settlement registry is supplied; badges remain absent.
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

Managed composition is now opt-in at the existing native SDS ingress; see
[MANAGED-INSTALL.md](MANAGED-INSTALL.md). The desk manifest records canonical
`/contribute/_assets/` resource URLs from its dedicated export-time build
integration. Managed serving has no root aliases; the shared immutable receiver
retains aliases only on the separate diagnostic TLS socket. An inactive managed
flag cannot expose an installed journey over the plaintext native listener.
Both manifests/source/dependencies and actual enrollment must pass before its
prefix serves; unrelated SDS routes remain usable on failure. No provider
environment, deployment, DNS, source ledger or human page was changed.

The existing single `server/index.js` listener now supplies real listener evidence
to the managed guard. Explicit native Passenger receiving requires the audited
loaded Node hook, its selected Unix request and one secure HTTPS marker; TCP and
direct TLS remain separate contracts. MANAGED-INSTALL.md owns the disabled finite
private runtime-log probe. VM native-hook replay simulates the provider core and
does not accept actual Hostinger transport. Preserve `build:managed-foundry` and
already enrolled credentials/schemas/origin during controller installation.

## Optional original-holder continuation API

The separate integration helper is
`server/lib/neomorphic-original-continuation-mount.js`. It mounts
`/api/neomorphic-original-continuation` only when a caller explicitly supplies
`enabled:true`, the existing ready journey mount, and exact canonical HTTPS
origin/round/provenance. It has no environment discovery, enrollment or account
creation. It is not added to server/app.js or any managed hosting control. Root
can mount it before the general parser/catchall when independently receiving the
actual original route. Missing account authority stays unavailable; no fallback
store or future-round adoption is used.

Read the exact producer's services/contributor-journey/ORIGINAL-CONTINUATION.md
for consent, dual authority, reference-only persistence, current session/holder
checks, canonical delivery and unknown-operation reconciliation. The original
service's added holder-only read/submit paths share its unchanged canonical
ledger and idempotency authority. Existing email/bearer delivery remains valid
without signup. Revoking the account link cannot revoke a claim or erase earned
obligations. No public work link, amount, private evidence, credential or paid
badge is projected by this adapter.

The original vendor is a mixed-source artifact: its retained producer
7d97fed8f7009b61e7b7d9ebd99f78782c554a2b plus two narrow patches and the exact
canonical helper from bf006179274d9f59596a30dc950698cf6375311e. Its manifest
reports the three explicit source differences rather than mislabelling that
closure as an entirely new producer. The new source and compiled files are
manifest-verified. No original migration, schema selection, claim terms, import,
acceptance or money authority changed.

```sh
node --test --test-concurrency=1 \
  server/scripts/test-neomorphic-contributor-journey-artifact.mjs \
  server/scripts/test-neomorphic-original-continuation-artifact.mjs
```

Root's remaining work is independent exact-source synthetic receiving, concrete
trusted HTTPS/Host/original-route receiving, and the separately reviewed optional
human preview. The compiled UI stays unchanged. This topic branch supplies no
release acceptance, deployment, recipient enrollment, invitation or payout.

Canonical readback also precedes classification of a completed submit refusal: a
producer retry can refuse after an earlier commit. A matching original receipt
confirms that delivery; revoked/unavailable read authority preserves the unknown
fence. The focused synthetic replay covers both cases without another submit.

Root's subsequent actual receiving identifies LiteSpeed's helper and inherited
Unix pipe, without the Passenger marker. Provider SSL/GET redirect facts remain
partial. [LITESPEED-HTTPS-ONLY.md](LITESPEED-HTTPS-ONLY.md) owns the named mode's
fresh signed deployment qualification, exact source/store/origin binding and
remaining actual plaintext mutation/backend isolation/hosted journey receiving.
The finite v2 diagnostic's added EventEmitter boolean supplies only the narrow
runtime identity fact; all its observations remain non-authoritative. Neither
fixtures, globals, Unix locality nor forwarding grant a provider pass. Keep the
composed Foundry/contributor build and complete settings/environment/linkage,
with existing enrollment/keys, no ledger changes and serving/public reads off.
