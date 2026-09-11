# Managed listing repair (F05 / W3-11)

Separates **evidence**, **suggestion**, and **authorized publishing**.

This directory never publishes a listing. `publishAuthorized` stays false.
Suggestion is not a publish. SAMPLE packets cannot become
`accepted_correction`. F08 paid wrappers, the homepage, the live catalog, and
Bazaar publish are out of scope.

The engine is PR51 `listing-repair-packet` from the committed archive
`client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz` (2522418 bytes,
sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`,
`purchaseAuthority: false`). It is not reimplemented here.

## Literal user journey (copy-paste, offline)

From this directory, Node >= 22:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json
```

Expect JSON with `evidence` (source observation + digest), `suggestion` (one
field, `notAPublish: true`), and `publishAuthorized: false`.

A SAMPLE packet that claims `accepted_correction` is rejected:

```bash
node bin/managed-listing-repair.mjs journey --fixture fixtures/invalid/sample-as-accepted.json
# exit 1, code sample_accepted_correction_rejected
```

## Tests

```bash
npm run test:managed-listing-repair
```

Seeded fail-closed:

1. auto-publish
2. SAMPLE as accepted correction
3. no-op sold as a fix
4. editing F08 (`server/paid-useful-jobs/`)
5. changing live prices
