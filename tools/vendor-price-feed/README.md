# Vendor price/API feed (W3-13 H02)

Offline observation ledger for vendor price facts. Original source, prior
observation, units, and effective date are first-class. Stale vs current is
explicit. SAMPLE cannot be `upstream`.

The engine is **PR51 `vendor-budget-impact` price facts as fixtures** (the
published useful-jobs 1.0.0 archive). That job is a **subject**, not F14’s
Pilot brief. This directory does not unpack or reimplement the job, restyle
the homepage, change live SDS catalog prices, or touch H3 Neo
`packs/licensed-artifacts/` or F08 `server/paid-useful-jobs/`.

Live extract `$0.005` and seller-integrity-audit `$0.01` stay unchanged.

## Literal user journey

From this directory, Node >= 22:

```sh
cd tools/vendor-price-feed
node bin/vendor-price-feed.mjs journey --fixture fixtures/ok.json
```

The command:

1. Ingests the PR51 `gpt-4.1-input` fixture observation (`provenance: fixture`).
2. Lists current (that digest is `current`).
3. Ingests a later observation chained with `priorObservationId`.
4. The older digest is `stale`, not current.
5. SAMPLE labelled as `upstream` is rejected (`sample-not-upstream`).

Stdout is one JSON object. `purchaseAuthority` is false. `liveCatalogWritten`
is false.

## Observation shape

```ts
type VendorObservation = {
  sourceUrl: string;
  observedAt: string;
  unit: string;
  amount: string; // decimal
  effectiveDate: string;
  priorObservationId: string | null;
  provenance: "fixture" | "test" | "upstream";
};
```

`amount` must be a decimal **string**. JSON numbers (PR51 row `value: 2.0`)
are refused. Units are the PR51 pricing-row units (`USD/1M-tokens`,
`USD/1K-images`, `USD/1K-queries`). The after.json spelling `USD/1M-Tokens`
is refused as wrong units.

## Tests

```sh
cd tools/vendor-price-feed
npm test
```

Seeded fail-closed:

1. missing source URL
2. wrong units / float
3. SAMPLE as upstream
4. overwriting history
5. changing live SDS prices

## Out of scope

No deployment, payment, secrets, live catalog writes, homepage CSS, F08 paid
wrappers, H3 Neo pack ledger, or Wave 1/2 owned directories.
