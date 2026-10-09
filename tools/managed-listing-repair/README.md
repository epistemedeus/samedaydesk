# Managed listing repair

Honesty-only rebase of SDS PR56 onto current `main`.

Separates **evidence**, **suggestion**, and **authorized publishing**.

This directory never publishes a listing. `publishAuthorized` stays false.
Suggestion is not a publish. SAMPLE packets cannot become
`accepted_correction`. F08 paid wrappers, the homepage, the live catalog, and
Bazaar publish are out of scope. Root `package.json` and `.gitignore` are not
edited.

The engine is the current public useful-jobs kit job `listing-repair-packet`
from `client/src/data/usefulJobsKit.json` (this rebase: **1.4.7**,
`client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`, 5255824 bytes,
sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`,
`purchaseAuthority: false`). The job originated in PR51 / useful-jobs 1.0.0
and is **inherited** in 1.4.7. It is not reimplemented here. This tool does
not extract the 1.0.0 archive.

A complete-capture fixture must use a 1.4.7 supported join (`grexal` or
`agensi`). Provider `fixture` is refused by the engine and is not sold as a
successful repair.

## Literal user journey (copy-paste, offline)

From this directory, Node >= 22:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json
```

Expect JSON with `evidence` (source observation + digest), `suggestion` (one
field, `notAPublish: true`), `publishAuthorized: false`, `sold: false`, and
`purchaseAuthorized: false`. Engine status on the ok fixture is `actionable`.

A SAMPLE packet that claims `accepted_correction` is rejected:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/invalid/sample-as-accepted.json
# exit 1, code sample_accepted_correction_rejected
```

A complete-capture unsupported provider is rejected:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/invalid/unsupported-provider.json
# exit 1, code engine_refused
```

A packet that sets `publishAuthorized` without `--publish` is rejected:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/invalid/packet-publish-authorized.json
# exit 1, code auto_publish_rejected
```

An operator packet field the engine did not diagnose is rejected:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/invalid/packet-engine-mismatch.json
# exit 1, code suggestion_not_grounded
```

## Tests

From this directory (no root `package.json` script):

```bash
node --test --test-concurrency=1 test/*.test.mjs
```

or `npm test` using this directory's `package.json`.

Seeded fail-closed:

1. auto-publish
2. SAMPLE as accepted correction
3. no-op sold as a fix
4. editing F08 (`server/paid-useful-jobs/`)
5. changing live prices
6. wrapping a 1.4.7 unsupported-provider engine refusal as a successful repair
7. packet `publishAuthorized` true (authority flag on the packet, not only CLI)
8. operator packet field not grounded in engine actions
9. `--out` into a sibling tools directory
10. missing fixture file (JSON `fixture_not_found`, not an ENOENT crash)
