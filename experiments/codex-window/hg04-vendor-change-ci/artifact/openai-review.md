# Vendor change CI (no purchase authority)

Wrapper status: **actionable**
Kit status: **actionable**
Machine action: **review-list-price-fields** (ci=pass, updateBaseline=false)

List-price row scan with kit status actionable. Review field deltas; this is not a bill.

## Truth

- Schema: ok
- Unit comparable: true
- Coverage complete: true
- Membership added: (none)
- Membership removed: (none)
- Membership shared: gpt-3.5-turbo-input, gpt-3.5-turbo-output

Declared fields are present in the after snapshot.

## Independent same-unit arithmetic

- `gpt-3.5-turbo-input`: 0.0015 -> 0.0005 (USD/1K-tokens); delta -0.001 (after minus before). Not a bill.
- `gpt-3.5-turbo-output`: 0.002 -> 0.0015 (USD/1K-tokens); delta -0.0005 (after minus before). Not a bill.

## Kit actions

- (medium) review-price-field: `gpt-3.5-turbo-input`
- (medium) review-price-field: `gpt-3.5-turbo-output`

## Baseline

Matched frozen expected.json.

## Honesty

- invoiceClaim: false
- forecast: false
- purchaseAuthority: false
- updateBaseline: false

No measured usage. List-price field deltas are not a bill, invoice, or forecast.

_Supplied dated snapshots only. Not current market prices, customer demand, or a live quote._
