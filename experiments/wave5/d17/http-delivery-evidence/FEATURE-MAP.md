# Feature map — W5-D17 HTTP delivery evidence

| Field | Value |
| --- | --- |
| User goal | After paid GET /extract, tell declared-contract capture, source refusal, truncation, and transport failure apart without calling that useful delivery or revenue. |
| Entrypoint | `experiments/wave5/d17/http-delivery-evidence/` |
| Command | `node --test --test-concurrency=1 experiments/wave5/d17/http-delivery-evidence/test/*.test.mjs` |
| State | `deliveryClass` plus historical v1 `not_checked` join |
| Tests | contract, store restart/readback, disposable merchant + fake facilitator |
| Account prerequisite | None. Fake facilitator only. No live billing, wallet, or deploy. |
