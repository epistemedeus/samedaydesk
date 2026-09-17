# E3 changed-data job second run

Actual caller of the **existing** `page-change-offline-job`. Failures are
explicit.

This pack does **not** reimplement page-change, add a scheduler, or own a
desk UI. It extracts the committed useful-jobs 1.4.7 archive and spawns:

```text
node bin/useful-jobs.mjs run page-change-offline-job --job <held.json> --out-dir <dir>
```

twice, with **changed input** on the second run. Each run is labelled
`owner_qa` or `independent`. Same fixture twice is replay, not repeat demand.

Disjoint from J6 `packs/useful-job-desk/**` and from E4
`packs/e4-maintained-runtime-discovery/**`. Write boundary is this directory
only.

## What success is

`ok: true` only when:

1. The real useful-jobs CLI ran `page-change-offline-job` twice.
2. The two held job documents have different input fingerprints (changed input).
3. Catalog-promised outputs (`page-change.json`, `page-change.md`) exist for
   both runs.
4. Evidence classes are present and not collapsed into repeat demand.

Pack-authored extracts are `owner_qa`. A declared-independent caller uses a
distinct identity and distinct files. Neither is organic demand. `repeatDemand`
stays `false`.

## Commands

From the repository root, Node 22, no install:

```bash
node packs/e3-changed-data-second-run/bin/run.mjs --owner-qa-vs-independent
node packs/e3-changed-data-second-run/bin/run.mjs --owner-qa
node packs/e3-changed-data-second-run/bin/run.mjs --pair packs/e3-changed-data-second-run/fixtures/pairs/owner-qa-vs-independent.json
node packs/e3-changed-data-second-run/bin/run.mjs --seeded-fixture
node --test packs/e3-changed-data-second-run/test/*.test.mjs
```

`--owner-qa-vs-independent` is the acceptance journey: changed input, second
run, owner QA vs independent labelled. `--owner-qa` is two sequenced owner-QA
observations of the same watched source with a new after file. `--seeded-fixture`
is the kill case.

Exit 0: both caller runs completed and labels are honest. Exit 2: explicit
failure JSON on stdout.

## Seeded failure

`fixtures/pairs/same-fixture-repeat-demand.json` points at the same held job
twice and sets `demandClass: "repeat_demand"`. A naive "ran the job twice,
therefore repeat demand" would accept it. This caller does not.

Failure class: `same_fixture_labelled_repeat_demand` (exit 2).

## Kill / out of scope

- Same fixture twice labelled as repeat demand
- J6 `packs/useful-job-desk/**` implementation
- E4 `packs/e4-maintained-runtime-discovery/**` implementation
- Payment, publish, deploy, SKU/price changes, live fetch, scheduler daemon
