# RECEIPT — managed listing repair (honesty-only rebase of SDS PR56)

**Date:** 17 September 2026
**Branch:** `heavy/w0-r14-05-managed-listing-repair`
**Base:** `main` `775051602d91f42ca1aa920054cfd7a451982940` (useful-jobs 1.4.7 public kit)
**Source PR:** SDS PR56 `fable/w3-11-f05-managed-listing-repair` (Cursor-authored; not merged)

Git SHA of this rebase is the branch tip. This file is not a git pin.

## What

Managed listing repair that separates evidence, suggestion, and authorized
publishing. Journey: fixture source + packet that fixes one field →
evidence + suggestion → `publishAuthorized: false` → SAMPLE packet rejected.

Never publishes. Not F08's paid wrappers (`server/paid-useful-jobs/` is absent
on current main and writes there are still refused). B01 / neomorphic-io is
not used. Root `package.json` and `.gitignore` are not edited.

## Honesty vs PR56

PR56 documented the PR51 1.0.0 archive (2522418 bytes,
sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`)
while reading `client/src/data/usefulJobsKit.json`. On current main that JSON
is useful-jobs **1.4.7**. Following the kit without updating claims would
extract 1.4.7 and still say 1.0.0.

This rebase:

- Invokes 1.4.7 listing-repair-packet (inherited job; not reimplemented).
- Does not extract 1.0.0.
- Uses `grexal` as the 1.4.7 supported join on the ok fixture. Provider
  `fixture` with complete capture is engine-refused in 1.4.7
  (`unsupported-provider`) and is not sold as a successful repair.
- Requires engine status `actionable`. Engine `ok:true` with `status:refused`
  is not a successful journey.
- Advertises tests as `node --test` from this directory (no root npm script).
- Keeps CLI compact honesty fields: `sold: false`, `purchaseAuthorized: false`.
- Binds live MCP prices to named tools `extract` and `seller_integrity_audit`.

## Source vs brief

- Engine is **not** unpacked under `client/`, `server/`, `tools/`, or
  `experiments/`. It lives in the published archive
  `client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`
  (5255824 bytes, sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`,
  `purchaseAuthority: false`). This tool extracts that archive into a temp
  cache and invokes `node bin/useful-jobs.mjs run listing-repair-packet`.
- F08 `server/paid-useful-jobs/` is untouched. Homepage, live catalog, and
  Bazaar publish are not edited.
- Live extract `$0.005` and seller-integrity-audit `$0.01` were not changed.

## Commands / pass-fail

```bash
cd tools/managed-listing-repair
node bin/managed-listing-repair.mjs journey --fixture fixtures/ok.json
node --test --test-concurrency=1 test/*.test.mjs
```

Seeded fail-closed: auto-publish; SAMPLE as accepted correction; no-op sold as
a fix; editing F08; changing live prices; wrapping a 1.4.7 unsupported-provider
engine refusal as a successful repair; packet `publishAuthorized` true;
operator packet field not grounded in engine actions; `--out` outside
`tools/managed-listing-repair/`; missing fixture file.

## Gaps

- Live settlement, catalog publication, Bazaar publish, and deploy are out of
  scope.
- No homepage CSS/brand changes. No new account, chain, queue, or database.
- Authorized publishing remains a later owner step; this tool never sets
  `publishAuthorized` true.
- Root test script is intentionally absent (write boundary).
