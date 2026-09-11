# Feature map: W5-D04 managed useful-jobs order client

Thin order client over the D01 execution contract. Not a competing useful-jobs
runner. Not a production Express route. Not a live catalog item. sold and charged
stay false.

| Surface | User-visible behavior | Verify |
| --- | --- | --- |
| CLI `orders create --request order.json` | Bind engineId, archive pin, buyer-echoed input digests, immutable orderId; call D01 `createExecutor`/`runPaidOffer` | `test/journey.test.mjs` |
| `api-upgrade-brief` journey | ord-1 + OpenAPI triple; receipt orderId matches; outputs `upgrade-brief.json` / `upgrade-brief.md` | CLI spawn, local-runtime |
| Order immutability (F-ORDER) | Same orderId with swapped files refuses; same files replay | journey + Postgres |
| Concurrent reserve | Two processes, one execution journal line, one order | `test/concurrent-resume.test.mjs` |
| Interrupted resume | Dead reserved holder is adopted once; no second order | concurrent-resume |
| Archive pin (F-PIN) | Requested sha256/bytes must match published archive pin | seeded sha-mismatch |
| SAMPLE / `--example` (F-SAMPLE) | example:true is not payable; labeled SAMPLE hashes cannot be claimed as customer | seeded failures |
| Extract relabel (F-EXTRACT) | Request with agents extract URL refuses | seeded + HTTP POST |
| Omitted funding vs omitted terms | reserved-fixture without payment ≠ missing enginePin | seeded failures |
| Missing / corrupt JSON | Invalid request file and corrupt store refuse without executing | seeded + contract-boundaries |
| Stale caller outDir | Foreign/stale files are not this run's outputs | contract-boundaries |
| D01 HTTP `/execute` | Optional `--execute-url` posts to D01 loopback; retrieval id matches | contract-boundaries |
| 127.0.0.1 listener | POST `/managed/useful-jobs/v1/orders` on loopback only | `test/http-listener.test.mjs` |
| Postgres store | Two clients, one reservation; swapped files refuse | `test/postgres.test.mjs` |
| Consumer contract v1 | Result schema `samedaydesk.useful-jobs-consumer.v1`; D01 receipt nested, hashes not forced equal | journey + hygiene |
| Price / brand | No `server/pricing.js`, homepage, or live catalog edits | hygiene + ownedPaths |

## Test map

| ID | Class | Command surface | Expected |
| --- | --- | --- | --- |
| J1 | local-runtime | CLI create ord-1 | ok, orderId ord-1, two catalog outputs, D01 contract nested |
| J2 | local-runtime | CLI create same request | replayed true |
| J3 | local-runtime | CLI create swapped used.json | F-ORDER, charged false |
| C1 | local-runtime | two CLI processes same orderId | one execution, one replay |
| C2 | local-runtime | reserved dead-pid resume | one complete order |
| S1 | fixture | example-true.json | F-SAMPLE |
| S2 | fixture | sha-mismatch.json | F-PIN |
| S3 | fixture | omit-order-id.json | F-ORDER |
| S4 | fixture | extract-url.json | F-EXTRACT |
| S5 | fixture | sample-as-customer.json | F-SAMPLE |
| S6 | fixture | reserved-fixture-no-payment.json | reserved-fixture-requires-payment |
| S7 | fixture | omit-engine-pin.json | missing-engine-pin |
| S8 | fixture | invalid.json | invalid-json |
| B1 | local-runtime | stale outDir | published brief is this run; foreign.txt not an output |
| B2 | fixture | corrupt store JSON | corrupt-replay, no execution journal |
| H1 | local-runtime | HTTP 127.0.0.1 POST | 201 + extract 400 |
| H2 | local-runtime | D01 POST /execute | same contract, retrieval ok |
| P1 | local-runtime | disposable Postgres | persist + swap refuse |
| P2 | local-runtime | two Postgres clients | one execution row |
| Z1 | fixture | git/path hygiene | owned paths only; no competing CLI |

## Hash terms (I01 lesson, not a kernel copy)

Order identity is `termsHash`: canonical JSON of engineId, orderId, engine pin
(package/version/sha256/bytes), and input flag+sha256+bytes. Paths are not
terms. Changed bytes need a new orderId. D01 `receipt.inputsDigest` is a
different document (`samedaydesk.paid-useful-jobs.receipt.v1`) and is nested
under `wrapper.receipt`. Do not force those hashes equal.

## D01 binding

This client loads `server/paid-useful-jobs/index.mjs` from the current tree or
`MANAGED_ORDER_WRAPPER_ROOT`. Tested pin is in `lib/d01-pin.json`. Missing
wrapper is `missing-execution-contract`, not a skipped pass.
