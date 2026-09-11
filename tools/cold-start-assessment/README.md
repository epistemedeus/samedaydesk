# Proposed $5 cold-start assessment

SameDayDesk **assessment offer adapter**. Fixture / non-settling. Node 22. No install.

It acquires a public package (or a local fixture archive), checks status, size, and sha256 **before extract**, runs the documented first commands in a temp directory, and writes `assessment.json` plus `explanation.md`.

Proposed price is labelled `5.000000` USDC on network `fixture` (5000000 atomic). It is not posted, not a live catalog price, and cannot settle. `purchaseAuthority` is false. `fundingState` is fixture. A usable reproduction is not customer completion.

Existing extract `$0.005` and seller-integrity-audit `$0.01` stay unchanged.

## Literal user journey

From the repository root:

```sh
node tools/cold-start-assessment/bin/assess.mjs --fixture-dir fixtures/ok --out /tmp/w2-06-out
```

Then read `/tmp/w2-06-out/assessment.json` and `/tmp/w2-06-out/explanation.md`. The explanation names the exact commands. A stranger can rerun them offline after a matching digest extract.

## Targets

`--target capability-preflight` (default) uses Neo PR37 public pins:

- Guide: `https://neomorphic.io/labs/capability-preflight/`
- Archive: `https://neomorphic.io/downloads/capability-preflight/capability-preflight.tar.gz`
- 143275 bytes, sha256 `477e31cb09818409ff9fe81b9d8401bc227591be100a2aca7edf73ca1a45e551`

`--target useful-jobs` is an optional second target (SDS PR51 useful-jobs archive). EIN is out of scope.

## Optional live

Public HTTPS, no credentials, no GitHub host. CI does not depend on live DNS.

```sh
node tools/cold-start-assessment/bin/assess.mjs --target capability-preflight --live --out /tmp/w2-06-live
```

## Tests

```sh
npm run test:cold-start-assessment
```

Or from this directory: `npm test`. Tests pack seeded fixtures and do not call live DNS.

## Out of scope

No deployment, payment, live catalog change, merchant settle, F08 paid wrappers, or Pilot F11 verifier tree.
