# Feature map — W5-D25 buyer journey harness

Thin owner-QA harness around current public interfaces. Not a second
paid-wrapper, binder, or catalog kernel.

| Field | Value |
| --- | --- |
| User goal | Complete two controlled real jobs through public offer, supplied input, delivery and return, labelled owner QA. |
| Entrypoint | `experiments/wave5/d25/` (`bin/buyer-journey.mjs`, `lib/journey.mjs`) |
| Command | `cd experiments/wave5/d25 && node bin/buyer-journey.mjs journey` |
| Offer | HTTP GET of published `catalog.json` / discovery JSON plus D01 `cli list` |
| Execute | D01 `node server/paid-useful-jobs/bin/cli.mjs run` (library `runPaidOffer` only for the supplied-JSON case) |
| Return bind | D09 `node tools/repeat-job-binder/bin/bind.mjs` from the W4 Co03 pin, read-only |
| State | `sold` always false; `purchaseAuthority` false; live settlement out of scope; owner-QA is not a customer |
| Tests | `cd experiments/wave5/d25 && npm test` |
| Account prerequisite | None. Offline Node >= 22. No wallet, facilitator, chain, queue, or new account. |

## Evidence classes

| Class | What this package ran |
| --- | --- |
| owner-qa | Two CLI jobs with caller files in `fixtures/owner-qa/`; not customers or demand |
| local-http | GET of committed public catalog/discovery from a process serving `client/public` |
| local-runtime | D01 paid CLI + D09 binder subprocess against frozen input digests |
| external acceptance | Not claimed. No live samedaydesk.com fetch, payment, deploy, or message |

## Later integration owner

W5-D01. Rebase this consumer when D01 publishes a later execution contract.
D09 Wave5 and M01 Wave5 exports are remaining bindings, recorded in PINS.json.
