# work-terms-dataset

Maintained catalog of **named public work-platform terms**: versions,
invalidation, attribution, and explicit republication rights.

This pack does **not** scrape. It does **not** ingest private or
auth-gated terms. It does **not** claim universal coverage. It is
**disjoint from H04** licensed regression packs.

Dataset root: `data/work-terms`.

```
node packs/work-terms-dataset/bin/work-terms.mjs verify
node packs/work-terms-dataset/bin/work-terms.mjs seeded-failure
node --test packs/work-terms-dataset/test/*.test.mjs
```

## Acceptance

| Check | Command |
| --- | --- |
| Versions and republication rights explicit | `verify` (`versionsAndRepublicationExplicit.ok`) |
| Invalidation works | `verify` copies the store, invalidates a current record, proves it is not republishable |
| Seeded failure: private terms scrape accepted | `seeded-failure` must **reject** (`code: private_terms_scrape`, `accepted: false`) |

## Coverage

See `data/work-terms/COVERAGE.txt`. Included platforms are named in
`data/work-terms/catalog.json`. Gaps (TaskForce, WORQ, and every unnamed
work platform) are listed so silence cannot be read as completeness.

## Republication

Every record has a `republication` object (`right`, `statement`,
`mayStoreFullBody: false`, `mayCommerciallyResell: false`). Full terms
bodies are not stored. Cite the canonical URL.

## Invalidation

`invalidate --id <id> --reason <reason> --note <text> [--write]`

Reasons: `rights_withdrawn`, `access_became_private`, `no_longer_public`,
`placeholder_not_operative`, `operator_error`, `robots_disallow`,
`source_requested_removal`.

A new ingest of the same `(platformId, documentKind)` supersedes the
previous current version.

## Kill conditions this pack refuses

- Scraping private terms
- Claiming universal coverage
- H04 licensed regression / hidden evaluator material
