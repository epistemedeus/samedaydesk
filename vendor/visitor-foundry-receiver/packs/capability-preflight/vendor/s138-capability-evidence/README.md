# S138 capability evidence (R2-CAPABILITIES-02 / 03 / 06)

Offline package that turns **data** (manifests, declarations, partial parts) into
readiness / evidence-binding / partial-composition reports. Does not implement
Bot-owned capabilities 01/04/05/07/08 beyond the contract in `BOT-INTEGRATION.md`.

## Commands

```bash
node bin/capability-evidence.mjs resolve-prereqs --manifest fixtures/manifests/package-ready.json --catalog-listed true
node bin/capability-evidence.mjs bind-evidence --declaration fixtures/evidence/declaration-02.json \
  --source src/resolve-prerequisites.mjs --test-output fixtures/evidence/sample-tap-pass.txt --exit-code 0
node bin/capability-evidence.mjs compose-partial --job fixtures/partial/job.json \
  --parts fixtures/partial/part-a.json,fixtures/partial/part-c-ok.json
node bin/capability-evidence.mjs demo
node --test --test-concurrency=1 test/*.test.mjs
```

## Boundaries

- Catalog listing ≠ install readiness
- No trust from signer/provenance alone
- Partial composition retains schema/scope/freshness holes
- No auth/private customer inputs in fixtures
- No paid calls / publication / default merge
