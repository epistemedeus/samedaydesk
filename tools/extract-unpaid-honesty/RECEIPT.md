# W4-commerce-19 RECEIPT — extract unpaid honesty join

**Repo:** epistemedeus/samedaydesk  
**Branch:** `codex/w4-commerce-19-20260911`  
**HEAD:** `codex/w4-commerce-19-20260911` (implementation `e4063fd6a8ee58fba8ea2125feb3c76638d1ce38`; receipt on this tip)  
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`  
**Owned path:** `tools/extract-unpaid-honesty/`  
**Next integration owner:** Root  

## Source heads consumed

| Input | Ref | SHA | Class |
| --- | --- | --- | --- |
| SDS catalog, discovery, buyer-runtimes, offer matrix, useful-jobs archive | `main` | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | fixture + local spawn of committed archive |
| F18 SDS live-journey writeup + merchant 402 JSON | `fable/f18-live-journeys` | `5e9fd3fc5e13989ef2cd45cf08f01cfe60c296cb` | fixture contrast only; no live GET |
| useful-jobs 1.0.0 archive | in-tree | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 B | local-runtime extract/spawn |
| I01 hashTermsVersion | Neo PR54 `fable/integration-earned-work` | absent here (neomorphic-io not readable) | later binding: `sha256:` + 64 hex; F01 integer `termsVersion` rejected |

cursor/plugins@main verified `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d`. Swarm Frame / independent ownership / aggregate / test-map applied inside this one assignment. No extra Cloud agents.

## Commands / counts

Node v22.14.0. From the repository root, no extra install, no root `package.json` change:

```bash
cd tools/extract-unpaid-honesty
node --test --test-concurrency=1 test/*.test.mjs
node bin/honesty.mjs journey
node bin/honesty.mjs probe-extract
node bin/honesty.mjs refuse-paid-retry
```

`node --test --test-concurrency=1 test/*.test.mjs`: **15 pass, 0 fail, 0 skip** (`duration_ms` 1579).

Public CLI: `journey` ok; `probe-extract` caught; `refuse-paid-retry` exits 2 `paid_retry_wrap_refused`.

## Useful caller journey

`node tools/extract-unpaid-honesty/bin/honesty.mjs journey` spawns `listing-repair-packet --example` from the committed archive under a 127.0.0.1 intercept (fetch guard + PATH `curl`/`wget` stubs). Observed: `purchaseAuthority` false (catalog + discovery), `sold`/`settled` false, no extract URL, no `PAYMENT-SIGNATURE`, agent402 `mustNotRun` preserved (`payX402 paid retry`, `Agent402 route-execute`, `wrapFetchWithPayment second fetch`). Engine status `actionable`. Terms hash `sha256:00a6cae4535d1ec0efc94e30100e0df58f8f15d2f3197b6353e52307fd98a971`.

A second local-runtime caller path uses the kit sample via `--input` (not the `--example` flag) and still records no extract URL.

## Seeded failures

- Stub `fixtures/probes/fetch-extract.mjs` fetching `https://agents.samedaydesk.com/extract` is caught (`honesty_forbidden_request`); it does not live-GET.
- Wrapping useful-jobs with a paid extract retry (`fixtures/probes/paid-retry-wrap.json`) is refused. F08 is not imported.
- Local HTTP `GET /extract` and `PAYMENT-SIGNATURE` on the intercept return 403, not a payment.
- Integer F01 `termsVersion` is rejected.

## Evidence classes

| Path | Class |
| --- | --- |
| Catalog / discovery / stop.json / offer matrix | fixture |
| Spawned useful-jobs + intercept HTTP/PATH | local-runtime |
| F18 merchant-extract-402.json | fixture contrast |
| Live SDS/merchant GET | not run (F18 already did) |
| Postgres | not used (no listener on 5432/55432; not in this public interface) |

## Honestly untested / later bindings

- External acceptance: live `GET` of `agents.samedaydesk.com/extract` (F18 contrast; unpaid 402 is not success).
- Real Postgres persistence (no local server; this join does not store IOUs).
- I01 Neo PR54 `hashTermsVersion` implementation import (repo not reachable). This module uses the documented `sha256:` contract only.
- F08 CLI spawn as a paid wrapper (out of scope; wrapping extract retry is refused here).
- Coinbase-x402 `mustNotRun` union is loaded but the preserved fixture list is agent402 `stop.json` as specified.

No deploy, purchase, live payment, account change, or customer messages. Homepages and brands untouched.
