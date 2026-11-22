# Source-bound acquisition tests

A retained proposal is an immutable statement about its original source and host.
It does not become a proposal for each later product commit. Keep its hashes and
all historical approved slots intact.

Current positive tests use `writeMeasuredProposalFixture` in a disposable directory,
built with the measured source/host pair and the unchanged client. The ordinary
producer, selector and decoder consume those bytes. A test-only receiving record
stays qualified=false and installed=false; no fixture enters the committed catalog.
The normal `--propose --measure` case must match the freshly generated pair and
still refuses a mismatched measurement or enrollment without Root receiving.

The workflow runs selector/decoder regression tests with the fixture catalog.
It does not require a real newly received packet on every product change. Current
negative tests keep missing, tampered, stale, wrong-repository, wrong-source,
self-stamped and conflicting-index inputs closed. The retained release proposal
has its own explicit changed-source refusal regression.

Run the exact workflow step on Node 22:

```sh
AE14_PG_BIN="$(pg_config --bindir)" \
ROOT10940_CI_CATALOG=server/scripts/fixtures/root10940-approved-ci-packets \
node --test --test-concurrency=1 \
  server/scripts/test-h147010-source-bound-ci-input.mjs \
  server/scripts/test-h145010-measurement-runtime-pin.mjs
```

The November 22 repair changes fixtures and their assertions. It does not change
production measurement, packet acceptance, the workflow or any retained receipt.
