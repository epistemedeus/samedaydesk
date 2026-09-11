# Feature map — W4-commerce-19 extract unpaid honesty join

| Field | Value |
| --- | --- |
| User goal | Prove a useful-jobs run never starts extract/batch or seller-integrity payment. |
| Entrypoint | `tools/extract-unpaid-honesty/` (`bin/honesty.mjs`, `lib/honesty.mjs`) |
| Command | `node tools/extract-unpaid-honesty/bin/honesty.mjs journey` |
| State | `purchaseAuthority` false; `sold` false; `settled` false; no extract URL; `PAYMENT-SIGNATURE` absent; agent402 `mustNotRun` preserved |
| Tests | `cd tools/extract-unpaid-honesty && node --test --test-concurrency=1 test/*.test.mjs` |
| Account prerequisite | None. No wallet, facilitator, chain, or live merchant GET. Local HTTP intercept plus the committed PR51 archive. Postgres is not part of this interface. |

Distinct from `tools/buyer-runtimes/` (unpaid 402 stop, no useful-jobs spawn) and F18 (live GET/HEAD of SDS pages, merchant 402 fixtures on Pilot).
