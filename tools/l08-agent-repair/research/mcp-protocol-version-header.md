# Unresolved protocol edge: MCP-Protocol-Version

Status: unresolved. This package does not patch it.

Spec: Model Context Protocol, revision 2025-11-25, Streamable HTTP, “Protocol Version Header”.

- After initialize, an HTTP client must send `MCP-Protocol-Version` on later requests. The value should be the version negotiated at initialize.
- If that header is missing and the server has no other way to know the version, a stateless server should assume `2025-03-26`.
- An invalid or unsupported header must be answered with HTTP 400.

## What the received code does

`server/routes/mcp.js` negotiates `protocolVersion` inside the initialize JSON-RPC body (`negotiateProtocolVersion`). The same router lists `MCP-Protocol-Version` in `Access-Control-Allow-Headers` and then never reads the header. A follow-up `tools/list` with `MCP-Protocol-Version: 1999-01-01` returns HTTP 200 and a normal tool list. The apex server stores no session, so a missing header is not treated as `2025-03-26` either. Every later request is handled as the current tool surface.

`server/lib/agent-readiness/probe.js` `rpc()` posts initialize, `tools/list`, and the unknown-tool call with `content-type` and `accept` only. It does not send `MCP-Protocol-Version`.

`mcp.version` in `server/lib/agent-readiness/checks.js` compares `initialize.result.protocolVersion` to the offered version. It does not look at the header on the later calls. A server that returns 400 for a missing or bad header, or that changes `tools/list` because it assumed `2025-03-26`, is recorded as a tools failure rather than a version-header failure.

## Why it matters

The apex endpoint is stateless. The header is the only version signal the spec gives that server after initialize. Clients that negotiated `2025-11-25` and then omit the header are served the newest tool surface, including fields older clients do not understand. Clients that send a version this server does not implement are not rejected. The readiness probe has the same hole, so it will mis-label a strict peer.

## Evidence

`node tools/l08-agent-repair/cli.mjs prove` mounts the received app and records the follow-up status on `POST /mcp`. The handoff field `protocolEdge.apex.observedStatus` is 200 and `requiredStatus` is 400. The disposable target leaves the same header unenforced in both its broken and fixed modes, so the unknown-tool repair is not a fix for this edge.

Owned paths for that repair stay under `tools/l08-agent-repair/`. `server/routes/mcp.js` and `server/lib/agent-readiness/` stay as received from `9cc816e13bfea448d68a26380efe2a91c88773dd`.

## Continuation

`L08-MAINT-093083` leaves this edge unresolved. Prior seal `ac7e0c75c224a062d9ed4e58332e9c2f34b90895`. The cold client records the same 200-versus-400 evidence on `protocolEdge` and does not patch the apex router or the readiness probe.

`L08-JOURNEY-RECV-093093` does not repair this header. The seller-repair journey's useful result is the catalog maintenance scope for two ordinary callers. A request that asks for this header as the result is refused with `echo_header_refused`.
