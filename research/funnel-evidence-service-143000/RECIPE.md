# Funnel evidence request recipe

Machine recipe for one free, nonpersistent projection. Caller observations stay declared. This call does not fetch URLs, query customers, store the packet, or spend.

## HTTP

```
POST /api/funnel-evidence
Content-Type: application/json
```

Core-only body:

```json
{
  "schema": "neomorphic.funnel-decision-request.v1",
  "asOf": "2026-10-10T03:42:00.000Z",
  "sources": []
}
```

Success body uses schema `samedaydesk.funnel-evidence.v1`. `evidenceAuthority` is `caller-declared`. `inputFetched` is false. `hostedAcquisitionVerified` is false. `recognizedIncomeAtomic` and `independentCustomers` are null. `projection` is the accepted funnel decision. `nextAction.action` and `nextAction.changes` are the next measurement.

A live-measurement packet uses schema `neomorphic.live-measurement-input.v1` with `payment`, `ein`, and `qualified`. Aggregates stay aggregates. `rowsMaterialized` is 0.

Rejected bodies are `{ "error": { "code": "<safe_code>" } }` with no request echo. Byte overflow is HTTP 413 `oversize`. Other rejections are HTTP 400. Response headers are `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## MCP

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "project_funnel_evidence",
    "arguments": {
      "packet": {
        "schema": "neomorphic.funnel-decision-request.v1",
        "asOf": "2026-10-10T03:42:00.000Z",
        "sources": []
      }
    }
  }
}
```

`structuredContent` is the same typed result. The text block is decision, reasons, next, changes, and authority. An error result is `isError` true and `structuredContent.error.code` only.

## Bounds

Body limit 262144 bytes. Depth 32. Nodes 4000. Sources 24. Records 400. Fetch keys `readPublic`, `readPublicOnce`, `publicPayment`, `fetchUrl`, `fetch`, and `readBounded` are refused before any read.
