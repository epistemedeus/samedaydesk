# Monthly bank-transfer preview

Opus's existing monthly invoice route stays intact. The two independent switches
are off by default:

| Host variable | Meaning |
| --- | --- |
| SDS_CARE_NONCARD=1 | Offer bank transfer on Keep it working, alongside card |
| SDS_CARE_STABLECOIN=1 | Also offer USDC, only when the first switch is on |

USDC remains parked. Root can ship bank transfer without enabling it. Other offers
keep their existing card routes, including Workflow at 149 USD and MCP at 349 USD.
No account, currency, price, tax, provider-event or invoice-ledger changes are made.
The bank-transfer page says international wires accepted; it does not offer SEPA.

`bash scripts/release/care-preview-test.sh` verifies both-off, bank-only, second
switch without the first (still card-only), and both-on against the restricted
Care role in disposable PostgreSQL. It retains the invoice paid/replay and month
record checks. `scripts/release/noncard-preview.mjs --methods bank_transfer`
uses the existing real Stripe test route; an explicit stablecoin test sets both
private-preview switches. Historical successful provider receipts are in the
Opus release record and are not relabelled as fresh tests.

Keep both production switches off until Root receives G1, screenshots of the
changed buy page and operator review. Root alone enrolls host values and deploys.
