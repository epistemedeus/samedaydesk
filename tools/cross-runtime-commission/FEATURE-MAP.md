# Feature map — W3-09 E03 cross-runtime commission scaffold

SDS labelled-runtime comparison. Not Pilot F11 `tools/verify/cold-start/`. Not F08 `server/paid-useful-jobs/`. Not W2-06 `tools/cold-start-assessment/`.

| Field | Value |
| --- | --- |
| User goal | Run the same listing-repair-packet fixture on two labelled runtimes and record comparable commands/results, with `independent:true` only when environments differ by more than cwd. |
| Entrypoint | `tools/cross-runtime-commission/` (`bin/cross-runtime.mjs`) |
| Command | `cd tools/cross-runtime-commission && node bin/cross-runtime.mjs journey --fixture fixtures/ok.json` |
| Engine | SDS PR51 `5b97d1b02e786acd1895cfa1508087ae3f7a1545` free jobs archive (`listing-repair-packet`) |
| State | `commissionedCustomer: false`; `payingMaintainer: false`; `purchaseAuthority: false`; `sold` always false; live settlement out of scope |
| Honesty | SAMPLE is never commissioned customer work. Demo-labelled single-runtime cannot claim `independent: true`. |
| Tests | `tools/cross-runtime-commission/test/*.test.mjs` via `npm run test:cross-runtime-commission` |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |

Live extract `$0.005` and seller-integrity-audit `$0.01` stay unchanged.
