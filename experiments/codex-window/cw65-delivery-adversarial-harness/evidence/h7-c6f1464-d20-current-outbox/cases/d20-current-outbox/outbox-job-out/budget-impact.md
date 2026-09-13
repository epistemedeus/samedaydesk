# Vendor budget impact (no purchase authority)

Status: **actionable**

Pricing-row scan: added=1 removed=0 fieldChanges=2 unitChanges=0 conflicting=0 unknown=0

## Recommended reviews
- (medium) review-price-field: `desk-chat-input` - Same-unit list-price field change in supplied snapshots. Delta is after minus before per stated unit, not a bill change or live quote.
- (medium) review-price-field: `desk-chat-output` - Same-unit list-price field change in supplied snapshots. Delta is after minus before per stated unit, not a bill change or live quote.
- (medium) review-added-price-field: `desk-embed` - Field appears in the after snapshot. Check source coverage and SKU identity; this does not establish a new vendor offering, a replacement, or a bill increase.

desk-chat-input: before=1; after=1.5; unit=USD/1M-tokens.
List-price delta per stated unit: 0.5 (after minus before).

desk-chat-output: before=4; after=6; unit=USD/1M-tokens.
List-price delta per stated unit: 2 (after minus before).

desk-embed: after=0.12; unit=USD/1M-tokens.

_Supplied pricing rows only. No live quote, unit conversion, bill calculation, or customer-demand evidence. Packaged examples are labeled samples._
