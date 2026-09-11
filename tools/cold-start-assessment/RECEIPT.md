# W2-06 RECEIPT — proposed $5 cold-start assessment

**Date:** 11 September 2026
**Branch:** `fable/w2-06-e01-cold-start-assessment`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)

## What

An SDS **assessment offer adapter** in `tools/cold-start-assessment/`. It acquires a public package (or a local fixture archive), checks HTTP status / size / sha256 **before extract**, runs documented first commands in a temp dir, and writes `assessment.json` + `explanation.md`.

Proposed price is labelled `5.000000` USDC on network `fixture` (5000000 atomic). It is **not posted**, **not live**, and **cannot settle**. `purchaseAuthority: false`. `fundingState: fixture`. A usable reproduction is not `actual_completion`.

This is not Pilot F11 `tools/verify/cold-start/` and does not edit F08 `server/paid-useful-jobs/`. PR37 is not reimplemented; public acquisition + digest checks are reused.

## Live/source checked first

Public HTTPS GETs (no credentials, no payment headers) before coding:

| Probe | Result |
| --- | --- |
| `https://neomorphic.io/labs/capability-preflight/` | 200. Documented first commands: `status`, `cold-start --probe`, `journey`. |
| `https://neomorphic.io/downloads/capability-preflight/release-status.json` | 200. `hostedAcquisitionVerified: false`, `readyForRelease: false`, bytes 143275, sha256 `477e31cb09818409ff9fe81b9d8401bc227591be100a2aca7edf73ca1a45e551`. |
| `https://neomorphic.io/downloads/capability-preflight/capability-preflight.tar.gz` | 200, `application/gzip`, `content-length: 143275`. Local sha256 matched the pin. Unpacked first commands exited 0 (`status` `readyForRelease: false` / `paidCalls: false`; `cold-start --probe` `mode: "demo"`; `journey` demo input). |
| SDS PR51 archive (committed + live headers) | 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`. Discovery `purchaseAuthority: false`. |
| Live extract / seller-integrity-audit | Unchanged in `client/public/x402/verified.json` (`5000` / `0.005 USDC`) and seller-conformance crawl (`10000` / `$0.01`). |

No existing SDS cold-start assessment directory was present. Acquisition follows the s260/s227 obtain-archive contract (status/size/digest, then `tar`). EIN kit is out of scope.

## Contradictions (brief vs live/source)

Followed live/source:

1. Neo PR37 packaged `hostedAcquisitionVerified: false` remains in live status JSON after a dated public GET of these exact bytes. Follow the live flag; a GET is not hosted job execution.
2. SDS PR51: STATE/brief pin is SameDayDesk merge `5b97d1b0…`. Live discovery `pins.sourceCommit` is `0e473974…` on `epistemedeus/pilot`, `archiveFreeze` `318130da…`. Archive bytes/sha256 still match.
3. SDS `client/src/data/machineEntry.mjs` `MERCHANT_PIN` is `ef46e2b5…`. Assignment merchant PR54 is `a143898dd1ec35c097ca7eb0b472f30dad1ee319`. This adapter records PR54 as a **metadata-continuity reference only** and does not probe merchant HTTP or change SDS merchant pins.

Fixture tests pack stub archives whose size/digest match `origin.json`, not the live public bytes. Live pins stay in `src/catalog.mjs` for `--live`.

Independent `--live` replay on 11 September 2026 (after coding): archive 143275 B, sha256 `477e31cb09818409ff9fe81b9d8401bc227591be100a2aca7edf73ca1a45e551`, extracted, first commands exit 0, `usableReproduction: true`. Still `purchaseAuthority: false`, `fundingState: fixture`, `cannotSettle: true`.

## Literal journey

```sh
node tools/cold-start-assessment/bin/assess.mjs --fixture-dir fixtures/ok --out /tmp/w2-06-out
```

Optional live (not CI):

```sh
node tools/cold-start-assessment/bin/assess.mjs --target capability-preflight --live --out /tmp/w2-06-live
```

Optional second target (SDS PR51 useful-jobs):

```sh
node tools/cold-start-assessment/bin/assess.mjs --target useful-jobs --fixture-dir fixtures/ok --out /tmp/w2-06-jobs
```

## Seeded failures

| Fixture | Must reject |
| --- | --- |
| `fixtures/fail-digest` | wrong digest still marked usable |
| `fixtures/fail-size` | wrong size still marked usable |
| `fixtures/fail-sample-paid` | SAMPLE / demo labelled `actual_completion` or paid |
| `--settle` | live settle / payment headers |
| GitHub archive URL | requiring GitHub credentials for the public path |

## Tests

```bash
npm run test:cold-start-assessment
```

Tests pack local fixtures and do not call live DNS.

## Hard stops honored

No deployment, payment, price change, new account, chain, or queue. Homepage CSS untouched. No secrets. Node 22. SDS brand preserved.
