# Root receiving verification, 2026-09-26

Source: VF12 export `77d6fb86f906f06424eeda8a956ce1fe2fce5aa2`, tested
implementation `f2b4ce6c3df23508774319350c72fbdbe8e852c0`, plus this amendment.
VF11 source `32b43dde486139ae63782a71fd4825fc4525ccf3` supplies the canonical
fresh-replay design and differential scenarios. Its original pinned performance
measurements are not reasserted as measurements of this combined receiver.

## Received changes

- Fresh replay uses the existing canonical reducer in a private accumulator,
  checks every recorded response and discards all partial state on failure.
  Public live dispatch preserves cloning and rollback.
- Store reconstruction preserves the actual VF12 runner/reviewer identities,
  installed portable bindings and live-clock restoration.
- Correspondence host closes its extension and base once, including concurrent
  close calls, readiness failures and a throwing extension close.
- Fifteen differential scenarios now run directly against the current receiver,
  comparing ordinary dispatch with fresh replay. They do not archive or import
  an old pinned reducer.

## Independent replay on actual Cursor Cloud E

`VF02_PG_BIN=/usr/lib/postgresql/16/bin` selects actual PostgreSQL 16.

| Command | Passed | Failed/skipped |
| --- | ---: | --- |
| `node scripts/visitor-foundry/integration/run-local.mjs entry` | 20 | 0/0 |
| `node scripts/visitor-foundry/integration/run-local.mjs test` | 29 | 0/0 |
| `node scripts/visitor-foundry/integration/run-local.mjs compound` | 14 | 0/0 |
| `node --test scripts/visitor-foundry/validation/tests/*.test.mjs` | 80 | 0/0 |
| built correspondence `foundry-host-cleanup.test.js` | 2 | 0/0 |

Correspondence TypeScript build exits 0. In total, 145 tests passed with no
failures or skips; the earlier 65-test validation run is superseded, not added
again. Logs are `/tmp/root-vf12-{entry-test,legacy,compound,validation-final,host-test}.log`.
These are remote integration tests, not Hostinger acceptance, independent
customer utility, public enrollment, payment or production activation.

## Next owner

Heavy receives this branch into existing SameDayDesk PR254. Read
`VF12-HEAVY-RECEIVING-DELTA.md`; replace the raw base mount with the entry facade
rather than exposing both. Preserve the already amended worker-drain behavior
and test actual claimed-task shutdown before a coherent final pilot-chat review.
