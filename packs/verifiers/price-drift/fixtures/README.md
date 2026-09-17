# Price-drift fixtures

Recorded SameDayDesk live x402 amounts. These files are observations and pins,
not catalog writes.

- `pin.json` — recorded extract `0.005` / `5000` and seller-integrity-audit `0.01` / `10000`.
- `ok-observation.json` — matches the pin.
- `ok-x402-items.json` — same amounts in committed catalog `items[]` shape.
- `reject/` — seeded failures the verifier must refuse.

This pack never rewrites live SDS prices.
