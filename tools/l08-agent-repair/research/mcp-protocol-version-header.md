# Protocol edge: MCP-Protocol-Version

Status: repaired on `server/routes/mcp.js`. The disposable unknown-tool target still ignores the header.

## What the current transport requires

Model Context Protocol, Streamable HTTP, revision 2025-11-25, “Protocol Version Header”, and revision 2026-07-28, “Protocol Version Header” and “Backward Compatibility”:

- After initialize, an HTTP client sends `MCP-Protocol-Version`. The value should be the version negotiated at initialize.
- A server that receives an invalid or unsupported `MCP-Protocol-Version` responds with HTTP 400.
- A server that still supports clients earlier than 2025-06-18 may treat a missing header as `2025-03-26`. This server supports `2024-11-05` and `2025-03-26`, so a missing header stays accepted.
- Initialize negotiates `protocolVersion` in the JSON-RPC body. An unsupported body version is answered with a supported version. It is not an HTTP 400.

The TypeScript SDK `validateProtocolVersion` matches that split. It returns HTTP 400 and JSON-RPC `-32000` when the header is present and not in the server's supported list, and it skips that check on an initialize request. A missing header is accepted.

## What this server does

Supported versions, newest first: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`. `2025-11-25` is the canonical version this server speaks.

- `tools/list` with `MCP-Protocol-Version: 2025-11-25` returns HTTP 200 and the tool list.
- The same call with the header omitted returns HTTP 200. The readiness probe sends no protocol header.
- `tools/list` or a batch with `MCP-Protocol-Version: 1999-01-01` returns HTTP 400, JSON-RPC `-32000`, and no `result`.
- `initialize` still echoes a supported body version, including when the header is `1999-01-01`.
- A JSON-RPC method that is not implemented stays HTTP 200 and `-32601`.
- `GET /mcp` is unchanged.

This server does not implement the later stateless request shape. A header naming a version outside the four above is unsupported and is HTTP 400. That is the same rule as an unknown date. It is not a second protocol implementation.
