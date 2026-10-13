# Contributor journey staging mount227800

SDS input pin: `d8cea059213e06d2f263be67f82e498f8052a50f`.
Isolated export branch: `codex/contributor-runtime-227800`.
Producer: `epistemedeus/neomorphic-io`, `codex/contributor-integration-227800`.
Read the producer's `services/contributor-journey/INTEGRATION.md` and exact
exported types before wiring the concurrently built account and other leaves.

`mountNeomorphicContributorJourney(app, { env?, loadService?, ports?, modules? })`
returns `{ state, ready(): Promise<void>, close(): Promise<void> }`. It registers
`/api/neomorphic-contributor-journey` before the broader SDS body parser and
retains truthful disabled health/errors. `createSdsApp` exposes the handle as
`app.get("neoContributorJourney")`; the existing listener lifecycle closes it.
The surface defaults to disabled and has no production mode.

Only `CONTRIBUTOR_JOURNEY_MODE=staging` attempts loading. Default received entry
is `vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js`.
This new closure is **not yet vendored**. A missing artifact is
`integration_pending`, not a replacement/mock service or startup of another
provider. Root must package the final exact producer plus its existing service
assets/dependencies after the leaf commits arrive. Existing opportunity vendor,
database, terms and credentials remain separate.

The loader must expose the actual `loadJourneyConfig(env)` and
`createJourneyRuntime({ config, ports, modules })`. The latter owns real
earned-work and correspondence Postgres startup, canonical migrations in new
staging schemas, errors and teardown. Mount initialization is single-flight;
close during initialization drains any result before enabling a route.
Credential/driver exception contents are never published.

Verification: three mount tests and one actual `createSdsApp`+compiled producer
HTTP/Postgres replay pass. The real replay installs fixture-only account/private
bindings; it passes seven existing-kernel stages and reports six leaf stages
pending. It proves neither signup/recovery nor full whole-journey acceptance.
The dedicated32KiB parser, old opportunity mount and unrelated SDS health are
checked. No production database, email, payout, deployment or homepage change.

```sh
node --test --test-concurrency=1 server/scripts/test-neomorphic-contributor-journey-mount.mjs

# From the exact received producer's services/contributor-journey directory:
CONTRIBUTOR_JOURNEY_TEST_PRODUCT_ROOT=/absolute/isolated/neomorphic \
CONTRIBUTOR_JOURNEY_TEST_PG_BIN=/path/to/postgresql/16/bin \
node --import tsx --test --test-concurrency=1 \
  /absolute/isolated/samedaydesk/server/scripts/test-neomorphic-contributor-journey-staging.mjs
```

Root receiving and operator preview approval remain separate from this export.
