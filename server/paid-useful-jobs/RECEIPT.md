# F08 RECEIPT — paid wrappers of existing useful jobs

**Date:** 11 September 2026
**Branch:** `fable/f08-paid-wrappers`
**HEAD:** `e935bd8` on `fable/f08-paid-wrappers`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)

## What

Paid-offer adapters around the six already-useful offline jobs. Journey:
supplied input → existing engine → usable outputs + receipt. Funding states:
`unfunded | reserved-fixture | rejected`. `sold` is always false. Live
settlement is out of scope.

Continuity (merchant PR54 `a143898dd1ec35c097ca7eb0b472f30dad1ee319`, module
`indexing-payload-continuity.mjs`) fills omitted `paymentPayload.resource` and
`extensions.bazaar` from declared route metadata via ResourceServer
`onBeforeVerify` / `onBeforeSettle`. Does not reassign `verifyPayment` /
`settlePayment`. Fixture / test payments are labelled `fixture` /
`purchaseAuthority: false`.

## Source vs brief

- Engines are **not** unpacked source under `client/`, `server/`, `tools/`, or
  `experiments/`. They live in the published archive
  `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
  (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`,
  `purchaseAuthority: false`). Wrappers extract that archive and invoke
  `node bin/useful-jobs.mjs run <id>`.
- SDS Express has **no** x402 ResourceServer. Implemented a local non-settling
  envelope. Live settlement is out of scope.
- Live extract `$0.005` and seller-integrity-audit `$0.01` were not changed.
- Wrapper prices are labelled non-live fixtures (`0.02` USDC) and are not in
  the live catalog.

## Commands / pass-fail

```bash
npm run test:paid-useful-jobs
```

**PASS** — 22 tests, 0 fail (`node --test server/paid-useful-jobs/test/*.test.mjs`).

Literal journey: `server/paid-useful-jobs/README.md`.

Seeded fail-closed: SAMPLE/`--example` as live sale; missing required input;
fixture payload that would settle if the fixture guard were omitted.

## Gaps

- Live settlement, facilitator, catalog publication, and deploy are out of scope.
- Declared `https://samedaydesk.com/paid-useful-jobs/<id>` URLs are indexing
  hints, not live routes.
- No homepage CSS/brand changes. No new account, chain, queue, or database.
