# Bounded response receiving

The JSON writer frames one buffer with its exact Content-Length and ends it
after the handler returns (after COMMIT for mutations). Request stream completion
is not a socket disconnect. A Node `finish` means local handoff, not downstream
receipt. An empty 200 is never an accepted operation result.

For one controlled private receiving window, set BOTH process variables before
the ordinary configured startup:

```
HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT=8
HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_EXPIRES=<absolute UTC ISO timestamp>
```

Expiry must be in the future, at most ten minutes away when the market opens.
Unset, invalid, expired or count-only configuration stays off. The process can
reserve at most 32 response IDs; restarting cannot extend the absolute expiry.
Use the normal credential-local owner **GET** receiving command once, within
this window. Do not repeat an unknown mutation to diagnose its response. Disable
both variables at the next ordinary configuration change. This adds no route,
monitor, migration, request retry or authority.

`x-ae-completion` identifies the same response in the existing structured
`installed_response_completion` summary and `installed_response_lifecycle`
records. The ID is random and server-generated; it is not a request ID or secret.
Only the fixed scalar lifecycle fields are emitted. No URL, body, credential,
cookie, arbitrary header, error message, address or customer input is recorded.
The trace starts on vendor-handler entry, before body consumption and authority
work. A pre-vendor guard refusal is outside this trace. No headers are flushed at
entry. Existing count-only summary diagnostics now also require an expiry.

Expected success: `entered`, `intended` (status and buffer byte count),
`headers_written`, `end_call`, `end_return`, `finish`, `end_callback`, `close`,
`socket_close`. Event ordering can vary. `request_end` is ordinary input-stream
completion; `request_aborted` and socket events are separate observations.
`actualStatus` before headers are sent is only Node's default status.
`bodyAllowed` observes Node's internal body-suppression flag; it grants no
authority. A normal HEAD or 204/304 can suppress a body, whereas admitted native
GET/POST JSON responses use a body-bearing status.

Expected local failures: early `socket_close` followed by `suppressed` identifies
a late writer after disconnection; `send_error`, `response_error` or
`socket_error` locates the corresponding local stage without exposing the error
text. `entered` without intent identifies an incomplete handler or dependency.
`end_call` without completion identifies a local response that did not finish.
At expiry, `window_end` removes observers from remaining responses; it neither
ends nor cancels them. Ordinary shutdown uses `diagnostic_closed`. Diagnostic
sink errors cannot change the response. These are finite, unreferenced one-shot
timers, not periodic workers.

A positive intended count plus successful Node finish/socket handoff alongside
an independently verified empty edge response moves the unresolved boundary
beyond this writer. `bytesWrittenDelta` includes HTTP framing and headers; it is
not a delivered-body count. Preserve the controller's TLS status, response byte
count, completion ID and provider request ID separately, then ask the provider
to correlate its Unix upstream/edge response logs for that one request. Absence
of application logs or the diagnostic header is inconclusive: the request may
have failed before vendor entry, the window may have expired, logs may be
unavailable, or the intermediary may have changed the response. A process killed
before logging cannot produce its own terminal record.

The inherited-Unix loader fixture models the received Node/listen shape, not
the proprietary provider edge or its live configuration. A controlled body-drop
fixture demonstrates this receiving limit; it does not attribute a live cause.

Focused verification (reuse the exact locked SDS dependency store):

```
node --test --test-concurrency=1 vendor/hosted-wallet-market/test/response-completion.test.mjs vendor/hosted-wallet-market/test/response-lifecycle.test.mjs server/scripts/test-installed-response-ingress.mjs server/scripts/test-installed-response-ready.mjs
```
