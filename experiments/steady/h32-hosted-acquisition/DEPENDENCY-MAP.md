# H32 compact dependency chain

```
H21 declaration (hosted-acquisition.d.ts)
  -> HA1 durable reader/writer (repaired: deadlines, FIFO O_NONBLOCK, spies, maxQueued, statement_timeout)
    -> HA2 createAcquisitionHttpHandler injected into createExecutionServer
      -> HA3 D14 ticket.requestHash + acquireHttpArtifacts + fetch --acquire-to
```

Not rewritten: public archives, catalog, pages, auth provider, payment rail, D14 local fallback.

HTTP frozen-request hash and acquisition `samedaydesk.acquisition-frozen-request.v1` stay distinct unless `hashesReconciled`.
