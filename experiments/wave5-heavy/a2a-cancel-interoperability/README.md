# A2A cancel interoperability (local fixture)

A maintained `@a2a-js/sdk` client cancels the exact server-issued task and
observes the disposable child exit. Not the production discovery card.

## Commands

From this directory after `npm ci`:

```sh
node --test --test-concurrency=1 --test-timeout=120000 tests/*.test.mjs
node bin/a2a-cancel-interoperability.mjs
```

Loopback JSON-RPC only. One work child per long job. Strict teardown.

## What is in bounds

- Official ClientFactory + JsonRpcTransportFactory + createAuthenticatingFetchWithRetry
- Official DefaultRequestHandler, InMemoryTaskStore, jsonRpcHandler
- Bearer `User` via the SDK UserBuilder seam (not a full IdP)
- Server-issued task id; local UUID is TaskNotFound
- Owner cancel confirmed only after SIGTERM child exit + TASK_STATE_CANCELED
- Wrong id, foreign owner, replay, and cancel-after-complete
- Direct getTask current-read baseline next to the stream notice
- Documented SDK default: `UserBuilder.noAuthentication` shares owner `unknown`

## What is out of bounds

Production card, payment, webhook, filing, E01 reject/payout wiring, C01
store, invented savings, merge, deploy.
