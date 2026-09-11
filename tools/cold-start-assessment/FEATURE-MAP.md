# Feature map — W2-06 E01 proposed cold-start assessment

SDS assessment offer adapter. Not Pilot `tools/verify/cold-start/`. Not F08 `server/paid-useful-jobs/`.

| Field | Value |
| --- | --- |
| User goal | Confirm a public package is a usable offline reproduction, then get a bounded explanation. Fixture only. |
| Entrypoint | `tools/cold-start-assessment/` (`bin/assess.mjs`) |
| Command | `node tools/cold-start-assessment/bin/assess.mjs --fixture-dir fixtures/ok --out /tmp/w2-06-out` |
| Primary target | Neo PR37 capability-preflight public archive (143275 B, sha256 `477e31cb…45e551`) |
| Optional second target | SDS PR51 useful-jobs archive (`--target useful-jobs`) |
| State | `fundingState: fixture`; `purchaseAuthority: false`; `cannotSettle: true`; proposed `5.000000` USDC on network `fixture` (5000000 atomic), not posted |
| Honesty | SAMPLE/demo is not `actual_completion` or paid. Wrong digest/size is not usable. |
| Tests | `tools/cold-start-assessment/test/*.test.mjs` via `npm run test:cold-start-assessment` |
| Account prerequisite | None. No wallet, facilitator, chain, queue, GitHub token, or new account. |

Merchant PR54 `a143898d` is a metadata-continuity reference only. EIN kit is out of scope. Live extract `$0.005` and seller-integrity-audit `$0.01` stay unchanged.
