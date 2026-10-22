# Vendor change CI (no purchase authority)

Wrapper status: **partial**
Kit status: **actionable**
Machine action: **resolve-partial-capture** (ci=fail, updateBaseline=false)

Capture or unit evidence is non-final. Do not treat missing fields as retirements or bills.

## Truth

- Schema: ok
- Unit comparable: true
- Coverage complete: false
- Membership added: (none)
- Membership removed: gpt-3.5-turbo-output
- Membership shared: gpt-3.5-turbo-input

After snapshot is an incomplete capture; missing fields are coverage holes, not retirements.

## Independent same-unit arithmetic

- `gpt-3.5-turbo-input`: 0.0015 -> 0.0005 (USD/1K-tokens); delta -0.001 (after minus before). Not a bill.

## Kit actions

- (medium) review-price-field: `gpt-3.5-turbo-input`

## Baseline

Matched frozen expected.json.

## Honesty

- invoiceClaim: false
- forecast: false
- purchaseAuthority: false
- updateBaseline: false

No measured usage. List-price field deltas are not a bill, invoice, or forecast.

_Supplied dated snapshots only. Not current market prices, customer demand, or a live quote._
