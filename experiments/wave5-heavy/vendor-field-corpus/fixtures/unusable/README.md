# Unusable candidates (not corpus pairs)

These were inspected over official HTTP and then dropped. They are not engine inputs.

## google-1.5-pro-percent-only

- URL: https://developers.googleblog.com/en/updated-gemini-models-reduced-15-pro-pricing-increased-rate-limits-and-more/
- Date on page: September 24, 2024
- Quote: "a 64% price reduction on input tokens, a 52% price reduction on output tokens ... for ... Gemini 1.5 Pro, effective October 1st, 2024, on prompts less than 128K tokens"
- Why unusable: the official post does not print the prior or new absolute dollars. Percent-only is not enough to fill `value`. Current Gemini API pricing HTML lists later SKUs and calendar windows, not this cut's before/after pair.

## gemini-scheduled-2027

- URL: https://ai.google.dev/gemini-api/docs/pricing
- Fetched: 2026-09-12
- Quote pattern: "$0.75 through December 31, 2026. $1.50 starting January 1, 2027"
- Why unusable: that is a future calendar window, not a change that has already occurred on 2026-09-12. Mixing those two dollars as before/after would treat a scheduled date as a current list move.

## ada-002-vs-3-small-as-one-field

- URL: https://openai.com/index/new-embedding-models-and-api-updates/
- Why unusable as a same-field pair: the post compares $0.0001 (ada-002) to $0.00002 (3-small) across SKUs and says ada-002 is not deprecated. The accepted added-SKU pair keeps both fields.
