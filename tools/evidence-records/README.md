# Traffic and settlement evidence records

Closed typed records for every traffic and settlement source SameDayDesk
reads. One record is one producer, one provider, one observation window, one
completeness state, and one authority class.

This is a typing and validation layer. It does not collect live analytics,
call a facilitator, or change Stripe objects.

```
npm run test:evidence-records
node tools/evidence-records/validate.mjs --suite
node tools/evidence-records/validate.mjs tools/evidence-records/fixtures/valid/cloudflare-analytics.json
```

## Record fields

| Field | Closed set / rule |
| --- | --- |
| `producer` | Exact producer, provider, adapter, and observed surface |
| `scope.providerId` | Must equal `producer.providerId`; a second provider is rejected |
| `observationWindow` | Inclusive RFC3339 start, exclusive end, reporting delay |
| `completeness` | `complete`, `sampled`, `truncated`, `unknown` |
| `authorityClass` | `seller_observed`, `provider_returned`, `independently_reconciled`, `provider_authoritative` |
| `unknownWhenAbsent` | What remains unknown if this adapter is missing or stale |
| `prohibitedInferences` | Must include the four required codes below |

## Sources

Each source kind maps to exactly one provider. Cloudflare analytics and
hosting analytics are different records. IndexNow receipts and Search Console
rows are different records. Bazaar listings and registry listings are
different records. Operator validation traffic and incentivized-trial traffic
are different records.

## Required prohibited inferences

Every record must list:

- `cross_source_join_without_exact_key`
- `sum_across_authority_classes`
- `organic_label_for_controlled_or_incentivized_traffic`
- `collapsed_provider_scope`

The validator also rejects those inferences when a record attempts them:

- a join to another `sourceKind` without an exact key declared on `scope.joinKeys`
- an aggregate whose parts mix authority classes
- `labels.acquisition` of `organic` on operator-validation or incentivized-trial sources
- `producer.providerId` and `scope.providerId` naming two different providers

JSON Schema (`schema/evidence-record.v1.json`) is the shape contract.
`lib.mjs` is the authority policy. TypeScript types live in
`types/evidence-record.v1.ts`.
