# Partial pages and rate limits

The GitHub adapter records 403 / 429 / 5xx and partial page sets in the result.
It does not sleep on Retry-After and does not auto-retry in a cost-amplifying loop.

Offline fixtures under `vendor/recurring-job-recipes/fixtures/issue-evidence/`:
`http-403.json`, `http-429.json`, `http-503.json`, `99533-partial-pages.json`,
`cancelled.json`, `redirect-blocked.json`.

Agents must not spam upstream to “complete” a partial. Report partial honesty.
