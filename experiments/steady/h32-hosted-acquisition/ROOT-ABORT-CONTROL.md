# H32 Root abort control — in-flight disconnect falsification

This is durable **test retention** of a falsified product defect, not a listener rewrite.
Product `acquisition-http.mjs` is unchanged. Tested source of the original control:
`e1ec5c6fe426e1699c983b8cecd5c91eee8f08c9`.

Controller: `bc-ec55ab26-6e23-4562-9c7a-649331bdba1f`. Native H32 session
`e42464bb-4447-4207-8871-5352a264a06f` ended `2026-09-13T15:05:08Z`. No native Grok
resume for this amendment. Node **v22.22.2**.

## Suspected defect (not reproduced)

`res.on("close")` aborts only when `!res.writableEnded && !res.destroyed`. A
disconnected `ServerResponse` is often already `destroyed`, so a blocked reader
might survive client disconnect. The pre-amendment HTTP test aborted `fetch`
**before** the request (`AbortController.abort()` then `fetch({signal})`) and
cannot prove in-flight server cancellation. That case remains in
`server/paid-useful-jobs/tests/acquisition-http.test.mjs` under an explicit
name: it only shows local client rejection.

## Negative control on original e1ec (2026-09-13T15:16Z)

Loopback Node HTTP. `hooks.beforeOpen` held after **real gate admission**
(`active === 1`). Client disconnected **after** the handler started. Bound 400ms
≪ handler `openTimeoutMs` 2000.

| Mode | admitted | reader `abort` | active+queued | follow-up GET |
| --- | --- | --- | --- | --- |
| `http.request` then `req.destroy()` | yes | yes, 12ms | 0+0 | 200 |
| raw `net.Socket` `resetAndDestroy()` | yes | yes | 0+0 | (permits already 0) |
| raw `net.Socket` `end()` (FIN) | yes | yes | 0+0 | (permits already 0) |

Cancel path observed: `req.on("aborted")` (still emitted on this Node when the
client socket dies). The `res.close` predicate was **not** shown to leak a
blocked reader. Prior native `last_sample.stop_reason=error` / OpenTelemetry
export network errors are unrelated.

Also exercised in the same probe session: raw `sock.destroy()` (same abort/permits
outcome). The three modes retained as TAP are destroy / resetAndDestroy / end.

## In-tree regression

`server/paid-useful-jobs/tests/acquisition-http.test.mjs`:

1. Wait until `beforeOpen` with `maxConcurrentReads.active === 1`.
2. Disconnect after handler start (`destroy` / `resetAndDestroy` / `end`).
3. Assert reader signal abort, permits `0+0`, follow-up GET 200, all before the
   400ms bound (not the 30s HA1 default, not a 30s waiter).
4. Destroy leftover sockets and close the server in `finally`.

No speculative product listener change.
