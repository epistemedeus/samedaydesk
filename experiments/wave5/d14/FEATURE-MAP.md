# Feature map — W5-D14 thin HTTP consumer

| Field | Value |
| --- | --- |
| User goal | An independent process POSTs its own JSON bytes to D01 and GETs that execution's result. |
| Entrypoint | `experiments/wave5/d14/bin/http-consumer.mjs` |
| Command | `node experiments/wave5/d14/bin/http-consumer.mjs submit \| fetch \| health` |
| State | No local engine, no settlement. Talks to D01 `POST /execute` and `GET /results/:id`. |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d14/test/*.test.mjs` |
| Account prerequisite | None. Loopback only. No wallet or live catalog. |
