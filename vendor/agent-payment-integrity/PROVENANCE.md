# Public checker provenance

Ordinary task readiness used to fetch private Neo `de9c23b5d19de30874e432e7ef1193d0d02d6702` (`https://github.com/epistemedeus/neomorphic-io.git`) and then spawn public S14 `00267aeb03c3ce01b9b318f5ee0172aee34d7e34`.

Neo is a private repository. Its package manifest is `private: true` and the tree has no root license that grants redistribution. `experiments/s19-receipt-referral/src/receiving/engines.mjs` `runS14` was inspected. That function only spawns `integrity.catalog-repair.test.mjs` with `CATALOG_ROW_CHECK=1`. No Neo source, owner state, or credential was copied.

S14 `agent-payment-integrity` is public MIT, copyright 2026 SameDayDesk contributors. The files named in `PROVENANCE.json` are unmodified bytes from commit `00267aeb03c3ce01b9b318f5ee0172aee34d7e34`. `integrity.mjs` is the checker core and is not rewritten here. The catalog-row entry contains the upstream sentinel `gho_must_not_leak` inside a negative test that asserts the value is not retained. It is not an owner credential. Direct dependencies resolve from `https://registry.npmjs.org` (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, Unlicense in the lockfile). Install with `npm ci --ignore-scripts --prefix vendor/agent-payment-integrity`.

`publicHostActivated` stays false. Running this package is not a public-host readback.
