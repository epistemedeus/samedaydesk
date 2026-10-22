# Catalog-only output-contract evaluation

Reads committed SameDayDesk consumer catalog evidence and classifies whether
each paid route declares a machine-verifiable output contract. This is a local
evaluator. It does not fetch an origin, pay, publish, or write a registry.

A complete catalog output contract requires `application/json`, a typed object
schema with named properties, and at least one required path that is not an
unconstrained object. Examples, empty OpenAPI `200` objects, unpaid-402 crawl
flags, buyer-runtime path pins, and useful-jobs filenames are reported honestly
and do not make a catalog document eligible.

```bash
node tools/output-contract-evaluation/cli.mjs
node tools/output-contract-evaluation/cli.mjs --pretty
node tools/output-contract-evaluation/cli.mjs --suite
node tools/output-contract-evaluation/cli.mjs --file tools/output-contract-evaluation/fixtures/valid/complete-single-route.json
node tools/output-contract-evaluation/cli.mjs --expect-reject unconstrained_object tools/output-contract-evaluation/fixtures/invalid/unconstrained-object.json
node --test tools/output-contract-evaluation/test.mjs
```

`--consumer` (the default) evaluates the presence OpenAPI extract, x402
well-known catalog, Bazaar listing snapshot, seller-conformance crawl,
buyer-runtime pin, useful-jobs catalog, and verified-feed observations from
this repository. The committed OpenAPI extract drops response bodies, so origin
catalog eligibility is false until a catalog document itself carries the schema.

JSON Schema (`catalog.json`) is the closed vocabulary. `lib.mjs` is the
authority policy.
