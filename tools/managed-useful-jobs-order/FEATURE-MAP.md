# Feature map: F13 managed useful-jobs order runner (local)

Local CLI and 127.0.0.1 test listener for the proposed payable-order contract.
Not a production Express route. Not a live catalog item. sold and charged stay false.

| Surface | User-visible behavior | Verify |
| --- | --- | --- |
| CLI `orders create --request order.json` | Bind engineId, archive pin, buyer-echoed input digests, immutable orderId, catalog output names; spawn useful-jobs CLI | `test/journey.test.mjs` |
| `api-upgrade-brief` journey | ord-1 + OpenAPI triple from archive `samples/openapi/a`; receipt orderId matches; outputs `upgrade-brief.json` / `upgrade-brief.md` | CLI spawn, local-runtime |
| Order immutability (F-ORDER) | Same orderId with swapped files refuses; same files replay | journey + Postgres |
| Archive pin (F-PIN) | Requested sha256/bytes must match published 2522418-byte archive | seeded sha-mismatch |
| SAMPLE / `--example` (F-SAMPLE) | example:true is not payable; labeled SAMPLE hashes cannot be claimed as customer | seeded failures |
| Extract relabel (F-EXTRACT) | Request with agents extract URL refuses; not GET /extract | seeded + HTTP POST |
| 127.0.0.1 listener | POST `/managed/useful-jobs/v1/orders` on loopback only | `test/http-listener.test.mjs` |
| Postgres store | Real local initdb cluster stores terms hash | `test/postgres.test.mjs` |
| Consumer contract v1 | Result schema `samedaydesk.useful-jobs-consumer.v1`; does not fork F08 receipt | hygiene + journey |
| Price / brand | No `server/pricing.js`, homepage, or live catalog edits | hygiene + ownedPaths |

## Test map

| ID | Class | Command surface | Expected |
| --- | --- | --- | --- |
| J1 | local-runtime | CLI create ord-1 | ok, orderId ord-1, two catalog outputs |
| J2 | local-runtime | CLI create same request | replayed true |
| J3 | local-runtime | CLI create swapped used.json | F-ORDER, charged false |
| S1 | fixture | example-true.json | F-SAMPLE |
| S2 | fixture | sha-mismatch.json | F-PIN |
| S3 | fixture | omit-order-id.json | F-ORDER |
| S4 | fixture | extract-url.json | F-EXTRACT |
| S5 | fixture | sample-as-customer.json | F-SAMPLE |
| H1 | local-runtime | HTTP 127.0.0.1 POST | 201 + extract 400 |
| P1 | local-runtime | disposable Postgres | persist + swap refuse |
| Z1 | fixture | git/path hygiene | owned path only |

## Hash terms (I01 lesson, not a kernel copy)

Order identity is `termsHash`: canonical JSON of engineId, orderId, engine pin
(package/version/sha256/bytes), and input flag+sha256+bytes. Paths are not
terms. Changed bytes need a new orderId. This is the integrated hash-terms
contract; original F01/F13 `inputSha256[]` is still echoed on the receipt.
