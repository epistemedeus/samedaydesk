# Feature map — W5-D14 thin HTTP consumer (CW70 current runtime)

| Field | Value |
| --- | --- |
| User goal | Independent processes POST caller JSON bytes and GET that execution's result on CURRENT 1.4.3 HTTP. |
| Entrypoint | `experiments/wave5/d14/bin/http-consumer.mjs` |
| Command | `node experiments/wave5/d14/bin/http-consumer.mjs submit \| fetch \| health` |
| State | No local engine, no settlement, no artifact HTTP server. Talks to in-tree `POST /execute` and `GET /results/:id`. |
| Ticket | Caller `executionId` is chosen and persisted atomically before POST. |
| Acquisition | Host `path` is not authority. Default `unsupported-portable-acquisition`. Optional `--local-artifacts` / `--acquire-to`. `httpArtifactsDelivered` is always false. |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d14/test/*.test.mjs experiments/codex-window/cw70-cold-http-consumer-current/test/*.test.mjs` |
| Runtime pin | `8a811bbadba7edc6c926b319b0839cd2f01e5896` (catalog 1.4.3 unpublished) |
| Account prerequisite | None. Loopback only. No wallet or live catalog. |
