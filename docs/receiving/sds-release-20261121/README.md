# SDS release acquisition proposal

The composed runtime has source fingerprint
`8be8dd13f995bf9d814a3efdd9b965a9d9a613bffc0069605b6615dce813cdf5`
and host fingerprint
`41d48be4e584635ab4f29c6c7213b819e553232e0f78d3498e0d72f0f06219df`.
The host pin checks every current member and retains the original caller records.
Its base is a verified ancestor, rather than the exact parent of a historical export.

The former current proposal in `docs/receiving/sds392-late-discharge-20261109`
still names its own `7bc03150` host. Its bytes and all eight approved catalog slots
are preserved. This directory is a new unreceived proposal, with no funding,
qualification, installation or publication authority.

The exact workflow regression command is now also a local release gate:

```sh
AE14_PG_BIN="$(pg_config --bindir)" \
ROOT10940_CI_CATALOG=server/scripts/fixtures/root10940-approved-ci-packets \
node --test --test-concurrency=1 \
  server/scripts/test-h147010-source-bound-ci-input.mjs \
  server/scripts/test-h145010-measurement-runtime-pin.mjs
```

That command validates the actual configured participation path and the refusal
controls. Its disposable fixture receiving blocks are not approval of this export.
The next workflow step still requires Root's independent replay and ordinary
enrollment from `ENROLLMENT.json`. Until then, selecting this fingerprint from the
committed catalog must return `stale`; an older approved slot cannot authorize it.
