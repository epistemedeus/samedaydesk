# Feature map — extract unpaid honesty (W5-D23)

| Field | Value |
| --- | --- |
| User goal | Detect a payment-shaped extract/batch/seller-integrity or PAYMENT-SIGNATURE attempt on the JS/PATH intercept where that check is promised. Never claim OS isolation. |
| Entrypoint | `tools/extract-unpaid-honesty/` (`bin/honesty.mjs`, `lib/honesty.mjs`, `lib/enforcement.mjs`) |
| Command | `node tools/extract-unpaid-honesty/bin/honesty.mjs journey` and `probe-extract` |
| State | `purchaseAuthority` false; `sold` false; `settled` false; `osIsolation` false; `outcomeClass` valid-unpaid or payment-attempt-detected |
| Tests | `cd tools/extract-unpaid-honesty && node --test --test-concurrency=1 test/*.test.mjs` |
| Account prerequisite | None. No wallet, facilitator, chain, or live merchant GET. Local HTTP intercept plus the committed PR51 archive. Postgres is not part of this interface. |

Enforcement is `js-hooks+path-stub+proxy-env`. Distinct from `tools/buyer-runtimes/` (unpaid 402 stop, no useful-jobs spawn), F18 (live GET/HEAD of SDS pages), and SDS PR52 `server/paid-useful-jobs` (D01 wrapper; not imported here).
