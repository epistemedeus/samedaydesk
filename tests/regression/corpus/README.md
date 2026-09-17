# SameDayDesk regression corpus

Executable fixtures for known past defects on samedaydesk **merchant**, **buyer**, **verifier**, and **pack** surfaces.

Shape (same as the Neo corpus):

```
tests/regression/corpus/
  catalog.json
  run.mjs
  package.json
  corpus.test.mjs
  cli-proof.test.mjs
  fixtures/seeded/
  lib/surfaces/{merchant,buyer,verifier,pack}.mjs
```

Write boundary: `tests/regression/corpus/**` only. This tree does not edit `tools/verify/**` or `verify-samedaydesk` (live reviewers).

## Run

From the repository root, Node 22.x:

```bash
node tests/regression/corpus/run.mjs --json
node --test --test-concurrency=1 tests/regression/corpus/*.test.mjs
npm test --prefix tests/regression/corpus
```

`run.mjs` exits 0 when every product case still matches live modules **and** at least one seeded false-accept/reject is caught.

## Seeded false-accept / false-reject

Hostile rows claim the wrong verdict. The catalog run records them as `caught`. Feeding one as required truth must exit 1:

```bash
node tests/regression/corpus/run.mjs --seeded-failure --json
node tests/regression/corpus/run.mjs --fixture tests/regression/corpus/fixtures/seeded/false-accept.json --json
node tests/regression/corpus/run.mjs --seeded-false-reject --json
```

`--seeded-failure` uses obtain-archive SHA mismatch **false-accept** (claimed `accept`, product `wrong-digest`). Exit 1, `error.code` `SEED_REJECT`.

`--seeded-false-reject` uses a valid evidence record claimed invalid (claimed `reject`, product `valid_record`). Exit 1, `error.code` `SEED_REJECT`.

## Surfaces

| surface | examples |
| --- | --- |
| merchant | complete_issue not paid extract; SPA unknown 404; invented MCP tool; hcdn challenge; unpaid 402 |
| buyer | obtain-archive SHA mismatch / missing args; result-reuse `--out`; unpaid offline fixture; 1.1.0 negative control |
| verifier | valid evidence control; organic label on controlled traffic; payment replay blocked |
| pack | useful-jobs missing inputs / HTML lockfile; s185 missing input / forbidden revenue; missing input path |

Catalog: [catalog.json](./catalog.json). Pointers: [fixtures/seeded/](./fixtures/seeded/).

No payment, no MCP `tools/call`, no edits to live reviewers.
