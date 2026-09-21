# w823 receipt-forge fixtures

`valid/` — unpaid SDS claims whose canonical digest matches. Accepts copy the
committed `/extract` pin (amount `5000`).

`reject/` — seeded forges. `manifest.json` names the code each file must
produce. `forged-digest.json` is the designated naive-accept / honest-reject
seed (`receipt_forged`). Also rejects bound-identity settlement copies,
`request.url` join mismatches, `X-PAYMENT-RESPONSE`, and restamped extract
amount `1`.

Regenerate with `node scripts/build-fixtures.mjs`.
