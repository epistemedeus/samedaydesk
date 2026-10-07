# Source and read contract

A caller names one supported source and the `material-change` predicate. The adapter builds a change-monitor subscription the pinned monitor can subscribe:

```json
{
  "taskId": "moltjobs-hold",
  "source": { "kind": "source-projection", "scope": "source-projection:moltjobs" },
  "predicate": "material-change",
  "cadenceMs": 3600000,
  "expiresAt": "2026-10-14T00:00:00.000Z",
  "budget": {
    "maxChecks": 24,
    "maxBodyBytes": 262144,
    "maxTimeMs": 8000,
    "maxOperations": 24,
    "maxUsefulEvents": 8
  }
}
```

Allowed scopes are only `source-projection:moltjobs`, `source-projection:x402stats`, and `source-projection:smithery_mcp`. The read URL is the pinned `https://samedaydesk.com/api/observatory/snapshot`. Caller URLs, redirects, prompts, and wallets are rejected. Private, loopback, link-local, and metadata addresses are refused before a socket.

Defaults when a field is omitted: cadence 3600000 ms, expiry 7 days, budgets 24 checks, 262144 body bytes, 8000 ms, 24 operations, 8 useful monitor events. Cadence must be from 60000 to 604800000. Expiry must be after now and within 30 days. Negative or zero cadence and a past expiry are rejected.

Outcomes keep the monitor words: `baseline_established`, `unchanged` (useful negative, not a delivery), `content_changed`, `service_restored`, `evidence_unavailable`, `budget_exhausted`. Unavailable, malformed, and partial coverage stay non-numeric. `naturalCustomerDemand` is false. `paidServiceLaunch` and `subscriptionOffered` are false. `proposedManagedPrice` is null.

States: `scheduled`, `running`, `paused`, `cancelled`, `expired`. Cancel and expiry are terminal. A paused or cancelled watch is not read. Two due workers claim one lease. A lost reply with a stored body finishes that operation id. A lost reply without a body is `unknown` and is not fetched again.
