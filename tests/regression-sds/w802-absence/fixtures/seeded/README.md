Seeded failure for w802: `fixtures/cases/x402scan-unavailable-as-demand.json`.

x402scan data endpoints require micropayment; SDS documents the source as unavailable and never calls it as success. Treating that documented absence as demand is the defect.

Feeding that fixture with `--expect accept` (or `run.mjs --seeded-failure`) must exit 1 (`SEED_REJECT`).
