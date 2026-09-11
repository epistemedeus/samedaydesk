# Feature map — W5-D09 Co03 repeat-job binder

Catalog-facing binder, not the operator product and not a scheduler. Consumes
published PR51 useful-jobs / vendor-pin record-repeat through injected adapters.
Optional `--paid-wrapper-bin` points at the current D01/PR52 wrapper CLI; that
source is not copied here. I01 Neo PR54 hash-terms contract is used for
`termsVersion`; the earned-work kernel is not copied. Homepages /
`server/pricing.js` are not edited.

| Field | Value |
| --- | --- |
| User goal | Given a verified `repeat-job.json` (or next-run the engine accepts) plus new local input files, freeze previous and current input references, bind `openapi-used-ops` or `pricing-row-unit`, run catalog / vendor-pin / D01 wrapper on the frozen copies, emit a second-run record distinct from the first. Previous outputs cannot be reused as new work. |
| Entrypoint | `tools/repeat-job-binder/` (`bin/bind.mjs`, `lib/bind.mjs`, `lib/contract.mjs`) |
| Command | `cd tools/repeat-job-binder && node bin/bind.mjs --ticket <repeat-job.json> --before <f> --after <f> --declare-after-sha256 <64-hex> --out-dir ./out/second` |
| Engine | PR51 useful-jobs CLI (`api-upgrade-brief`, `vendor-budget-impact`) and/or vendor-pin `record-repeat-job` family CLI. Optional D01 pin `aeef964fa188443078958d9d6d393afae1d542ee` `server/paid-useful-jobs/bin/cli.mjs`. Archives pinned, extracted to a temp cache, not forked in this module. |
| State | `schedulerDaemon: false`; `settling: false`; `purchaseAuthority: false`; SAMPLE cannot be live recurrence; digest mismatch refuses; missing files stay informational. `termsVersion` is `sha256:`+64 hex. Transport failure is distinct from analysis refused / no-change. |
| Tests | `cd tools/repeat-job-binder && npm test` |
| Account prerequisite | None. Offline Node >= 22. No wallet, facilitator, chain, queue, cron, or new account. |

## Evidence classes

| Class | What this package ran |
| --- | --- |
| fixture | Forged daemon / SAMPLE-as-live / integer `termsVersion` / unchecked next-run / parser mismatch; I01 golden terms hasher pin; seeded nonzero engine CLI |
| local-runtime | Extracted PR51 useful-jobs + record-repeat CLIs on frozen local files; local HTTP of committed `catalog.json` |
| external acceptance | Not claimed. No live samedaydesk.com fetch, no payment, no deploy |

## Later integration owner

W5-D01. Consumed PR52 wrapper CLI `aeef964fa188443078958d9d6d393afae1d542ee` as an injected binary when present. D01 may amend that wrapper; this binder does not claim a future sibling's behavior.

## Caller journey (useful)

1. `node bin/useful-jobs.mjs run repeat-job-record --next-run samples/repeat/a/next-run.json`
2. Change the after file and declare its new sha256
3. `node bin/bind.mjs --ticket repeat-job.json --before … --after … --declare-after-sha256 <new> --engine catalog`
4. Read `frozen-current/` plus `second-run.json` / `engine/budget-impact.json` — current after bytes are the frozen copy, not a previous output
