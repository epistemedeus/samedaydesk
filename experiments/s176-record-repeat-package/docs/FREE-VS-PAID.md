# Free offline vs optional paid extract

- **Free (this package):** compare already-held local before/after artifacts with bundled
 parsers. No network fetch, no payment, no wallet.
- **Optional paid (existing merchant):** bounded `POST /extract/batch` observation purchase
 on the live gateway. Not invoked by this CLI. Not re-priced here.
- Installation grants no payment authority.
- `paidValueClaim` fields stay false for offline runs.
- Capture and next-run JSON reads are refused above 8 MiB (`MAX_CAPTURE_BYTES`).
- Parser child processes time out after 30s. No network fetch.
