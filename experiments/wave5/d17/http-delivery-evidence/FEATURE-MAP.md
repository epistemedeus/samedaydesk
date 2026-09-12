# Feature map — W5-D17 HTTP delivery evidence

| Field | Value |
| --- | --- |
| User goal | After paid GET /extract, tell merchant HTTP status, declared-schema conformance, source refusal, truncation, and transport failure apart without calling that useful delivery or revenue. |
| Entrypoint | `experiments/wave5/d17/http-delivery-evidence/` |
| Canonical HTTP schemas | `extractMcpOutputSchema`, `readMcpOutputSchema`, `extractBatchOutputSchema()` at merchant `a143898d` |
| Command | `node --test --test-concurrency=1 experiments/wave5/d17/http-delivery-evidence/test/*.test.mjs` |
| State | `deliveryClass` plus historical v1 `not_checked` join |
| Tests | contract layers, canonical-source vs live Zod, store restart/readback, disposable merchant + fake facilitator |
| Account prerequisite | None. Fake facilitator only. No live billing, wallet, or deploy. |
