# Feature map — W4-commerce-03 repeat-job binder

Catalog-facing binder, not the operator product (W4-commerce-09) and not a
scheduler. Consumes published PR51 useful-jobs / vendor-pin record-repeat
through injected adapters. I01 Neo PR54 hash-terms contract is used for
`termsVersion`; the earned-work kernel is not copied. F08 / homepages /
`server/pricing.js` are not edited.

| Field | Value |
| --- | --- |
| User goal | Given a verified `repeat-job.json` (or next-run the engine accepts) plus new local input files, bind `openapi-used-ops` or `pricing-row-unit`, run catalog or vendor-pin, emit a second-run record distinct from the first. |
| Entrypoint | `tools/repeat-job-binder/` (`bin/bind.mjs`, `lib/bind.mjs`) |
| Command | `cd tools/repeat-job-binder && node bin/bind.mjs --ticket <repeat-job.json> --before <f> --after <f> --declare-after-sha256 <64-hex> --out-dir ./out/second` |
| Engine | PR51 useful-jobs CLI (`api-upgrade-brief`, `vendor-budget-impact`) and/or vendor-pin `record-repeat-job` family CLI. Archives pinned, extracted to a temp cache, not forked in this module. |
| State | `schedulerDaemon: false`; `settling: false`; `purchaseAuthority: false`; SAMPLE cannot be live recurrence; digest mismatch refuses; missing files stay informational. `termsVersion` is `sha256:`+64 hex. |
| Tests | `cd tools/repeat-job-binder && npm test` |
| Account prerequisite | None. Offline Node >= 22. No wallet, facilitator, chain, queue, cron, or new account. |

## Evidence classes

| Class | What this package ran |
| --- | --- |
| fixture | Forged daemon / SAMPLE-as-live / integer `termsVersion` tickets; I01 golden terms hasher pin |
| local-runtime | Extracted PR51 useful-jobs + record-repeat CLIs on local files; local HTTP of committed `catalog.json` |
| external acceptance | Not claimed. No live samedaydesk.com fetch, no payment, no deploy |

## Later integration owner

Root. Bind W4-commerce-09 when that sibling publishes. Do not wait on missing W4 siblings.

## Caller journey (useful)

1. `node bin/useful-jobs.mjs run repeat-job-record --next-run samples/repeat/a/next-run.json`
2. Change the after file and declare its new sha256
3. `node bin/bind.mjs --ticket repeat-job.json --before … --after … --declare-after-sha256 <new> --engine catalog`
4. Read `second-run.json` / `engine/budget-impact.json` — distinct from the first record
