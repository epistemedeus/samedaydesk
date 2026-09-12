# Feature map — W5-D14 thin HTTP consumer (CW70 current runtime)

| Field | Value |
| --- | --- |
| User goal | Independent processes POST caller JSON bytes and GET that execution's result on CURRENT 1.4.4 HTTP. |
| Entrypoint | `experiments/wave5/d14/bin/http-consumer.mjs` |
| Command | `node experiments/wave5/d14/bin/http-consumer.mjs submit \| fetch \| health` |
| State | No local engine, no settlement, no artifact HTTP server. Talks to in-tree `POST /execute` and `GET /results/:id`. |
| Ticket | Caller `executionId` is chosen and persisted atomically before POST. |
| Acquisition | Host `path` is not authority. Default `unsupported-portable-acquisition`. Optional `--local-artifacts` / `--acquire-to`. `httpArtifactsDelivered` is always false. |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d14/test/*.test.mjs experiments/codex-window/cw70-cold-http-consumer-current/test/*.test.mjs` |
| Runtime pin | `c6f1464222169f2d32247c978dc5007d82a2aa03` (catalog 1.4.4 unpublished; 1.4.3 `8a811bba` / `a18ab918` remains immutable and does not contain wrapper.mjs) |
| Account prerequisite | None. Loopback only. No wallet or live catalog. |
