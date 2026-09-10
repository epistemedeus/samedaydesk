# Free offline vs optional paid extract

- **Free (this package):** compare already-held local before/after artifacts with S134
  parsers. No network fetch, no payment, no wallet.
- **Optional paid (existing merchant):** bounded `POST /extract/batch` observation purchase
  on the live gateway. Not invoked by this CLI. Not re-priced here.
- Installation grants no payment authority.
- `paidValueClaim` / `paidValueClaim` fields stay false for offline runs.
