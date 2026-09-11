# W5-M18 changed-page trial (SameDayDesk)

Copyright (c) 2026 SameDayDesk. MIT License. See LICENSE.

This directory is a thin consumer. It does not copy
`tools/page-change-offline-job/` (W4-commerce-13 / W5-M05 pin) or merchant
`examples/customer-x402/src/page-change/compare.mjs`.

Consumed contracts (read-only):

- `samedaydesk.extract-batch.v0` captured JSON
- `pilot/page-change-brief/v1` from the pinned SDS-local engine CLI
- I01 content-hash `termsVersion` (`sha256:` + 64 hex) as emitted by that engine
- offer-routing `sdd.page_change_offline` (artifact still names the merchant skill)

Published SDS52 customer-job snapshots are referenced by path and SHA-256, not
re-vendored. Owner-labelled captures in `captures/` are trial controls, not
customer demand or live page currency.
