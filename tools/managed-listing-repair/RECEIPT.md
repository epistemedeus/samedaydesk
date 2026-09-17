# F05 RECEIPT — managed listing repair (evidence vs publish)

**Date:** 11 September 2026
**Branch:** `fable/w3-11-f05-managed-listing-repair`
**HEAD:** `c273491f4c5a5df55748563c14ac87d1c853fd6e`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)

## What

Managed listing repair that separates evidence, suggestion, and authorized
publishing. Journey: fixture source + packet that fixes one field →
evidence + suggestion → `publishAuthorized: false` → SAMPLE packet rejected.

Never publishes. Not F08's paid wrappers. B01 (Neo listing-repair verifier) is
not edited.

## Source vs brief

- Engine is **not** unpacked under `client/`, `server/`, `tools/`, or
  `experiments/`. It lives in the published archive
  `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
  (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`,
  `purchaseAuthority: false`). This tool extracts that archive and invokes
  `node bin/useful-jobs.mjs run listing-repair-packet`.
- F08 `server/paid-useful-jobs/` is untouched. Homepage, live catalog, and
  Bazaar publish are not edited.
- Live extract `$0.005` and seller-integrity-audit `$0.01` were not changed.

## Commands / pass-fail

```bash
cd tools/managed-listing-repair
node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json
npm run test:managed-listing-repair
```

Seeded fail-closed: auto-publish; SAMPLE as accepted correction; no-op sold as
a fix; editing F08; changing live prices.

## Gaps

- Live settlement, catalog publication, Bazaar publish, and deploy are out of
  scope.
- No homepage CSS/brand changes. No new account, chain, queue, or database.
- Authorized publishing remains a later owner step; this tool never sets
  `publishAuthorized` true.
