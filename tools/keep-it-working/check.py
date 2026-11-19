"""Read-only MCP tool-definition check for one Streamable HTTP endpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import ssl
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

# Protocol version we advertise on initialize. 2025-06-18 is broadly deployed;
# servers negotiate downward/own version in the InitializeResult. We do not
# hard-fail on a mismatch. We just record what tools/list returns.
PROTOCOL_VERSION = "2025-06-18"

CLIENT_INFO = {"name": "mcp-drift-monitor", "version": "0.1.0"}

DEFAULT_TIMEOUT = 15  # seconds per HTTP request


class ProbeError(Exception):
    """Any reason a server could not be observed (network, auth, protocol)."""


@dataclass
class ProbeResult:
    ok: bool
    tools: list[dict] = field(default_factory=list)
    protocol_version: Optional[str] = None
    server_info: dict = field(default_factory=dict)
    error: Optional[str] = None  # short, human-readable reason when ok is False
    transport: Optional[str] = None  # Streamable HTTP with the observed response framing


def _parse_body(raw: str) -> Optional[dict]:
    """Parse a JSON-RPC response that may be a bare JSON object or an SSE stream."""
    raw = raw.strip()
    if not raw:
        return None
    if raw[0] == "{":
        return json.loads(raw)
    # SSE: lines like `event: message` / `data: {...}`. Take the first data
    # payload that parses as a JSON object containing an id/result/error.
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            payload = line[len("data:"):].strip()
            if payload and payload[0] == "{":
                try:
                    return json.loads(payload)
                except json.JSONDecodeError:
                    continue
    return None


def _post(
    url: str,
    body: dict,
    session_id: Optional[str],
    timeout: int,
    ctx: ssl.SSLContext,
    protocol_version: str = PROTOCOL_VERSION,
) -> tuple[str, Optional[str], str]:
    """POST one JSON-RPC message. Returns (raw_body, session_id_header, content_type)."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": protocol_version,
        "User-Agent": "mcp-drift-monitor/0.1 (read-only tool-definition observer)",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
        content_type = response.headers.get("Content-Type", "")
        raw = ""
        if "text/event-stream" in content_type:
            if "id" in body:
                for line in response:
                    message = _parse_body(line.decode("utf-8", errors="replace"))
                    if message and message.get("id") == body["id"]:
                        raw = json.dumps(message)
                        break
        else:
            raw = response.read().decode("utf-8", errors="replace")
        return raw, response.headers.get("Mcp-Session-Id"), content_type


def probe_server(
    url: str, timeout: int = DEFAULT_TIMEOUT, retries: int = 1, retry_delay: float = 1.5
) -> ProbeResult:
    """
    Perform the read-only MCP handshake against a remote Streamable-HTTP endpoint
    and return its tool definitions. Never invokes a tool.

    Transient network/TLS errors (common when bursting many hosts from one IP,
    e.g. SSL UNEXPECTED_EOF from a server dropping the connection under load) get
    one polite retry, so reachability isn't undercounted by load artifacts.
    Auth errors (401/403) and protocol errors are NOT retried. They're terminal.

    All failures are caught and returned as ProbeResult(ok=False, error=...),
    so a single dead/auth-gated server never aborts a collection run.
    """
    last = _probe_once(url, timeout)
    attempt = 0
    while (not last.ok) and attempt < retries and _is_transient(last.error):
        time.sleep(retry_delay)
        last = _probe_once(url, timeout)
        attempt += 1
    return last


def _is_transient(error: Optional[str]) -> bool:
    if not error:
        return False
    e = error.lower()
    # retry only on connection-level failures, never on auth/protocol
    return any(s in e for s in ("ssl:", "network:", "conn:", "unexpected_eof",
                                "handshake", "timed out", "reset", "503"))


def _probe_once(url: str, timeout: int) -> ProbeResult:
    ctx = ssl.create_default_context()

    try:
        # 1) initialize
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": CLIENT_INFO,
            },
        }
        raw, session_id, ct = _post(url, init_req, None, timeout, ctx)
        init = _parse_body(raw)
        if not init or "result" not in init:
            err = (init or {}).get("error", {}).get("message", "no initialize result")
            return ProbeResult(ok=False, error=f"initialize failed: {err}")

        result = init["result"]
        negotiated = result.get("protocolVersion")
        server_info = result.get("serverInfo", {})
        transport = "streamable-http+sse" if "text/event-stream" in ct else "streamable-http+json"

        # 2) initialized notification (best-effort; some stateless servers 202/ignore)
        try:
            note = {"jsonrpc": "2.0", "method": "notifications/initialized"}
            _post(url, note, session_id, timeout, ctx, negotiated or PROTOCOL_VERSION)
        except Exception:
            pass

        # 3) tools/list
        tools = []
        cursors = set()
        params = {}
        while True:
            list_req = {"jsonrpc": "2.0", "id": 2 + len(cursors), "method": "tools/list", "params": params}
            raw, _, content_type = _post(url, list_req, session_id, timeout, ctx,
                                         negotiated or PROTOCOL_VERSION)
            listing = _parse_body(raw)
            if not listing or "result" not in listing:
                err = (listing or {}).get("error", {}).get("message", "no tools/list result")
                return ProbeResult(ok=False, error=f"tools/list failed: {err}",
                                   protocol_version=negotiated, server_info=server_info,
                                   transport=transport)
            page = listing["result"]
            tools.extend(page.get("tools", []) or [])
            cursor = page.get("nextCursor")
            if not cursor:
                break
            if cursor in cursors:
                return ProbeResult(ok=False, error="tools/list repeated a pagination cursor",
                                   protocol_version=negotiated, server_info=server_info,
                                   transport=transport)
            cursors.add(cursor)
            params = {"cursor": cursor}
        return ProbeResult(
            ok=True,
            tools=tools,
            protocol_version=negotiated,
            server_info=server_info,
            transport="streamable-http+sse" if "text/event-stream" in content_type else "streamable-http+json",
        )

    except urllib.error.HTTPError as e:
        # 401/403 => auth-gated (very common). 404/405 => not a Streamable-HTTP MCP endpoint.
        return ProbeResult(ok=False, error=f"http {e.code} {e.reason}")
    except urllib.error.URLError as e:
        return ProbeResult(ok=False, error=f"network: {e.reason}")
    except ssl.SSLError as e:
        return ProbeResult(ok=False, error=f"ssl: {e}")
    except (TimeoutError, ConnectionError) as e:
        return ProbeResult(ok=False, error=f"conn: {e}")
    except json.JSONDecodeError as e:
        return ProbeResult(ok=False, error=f"bad json: {e}")
    except Exception as e:  # last-resort: never let one server kill the run
        return ProbeResult(ok=False, error=f"{type(e).__name__}: {str(e)[:120]}")


def tool_hash(name: str, description: str, input_schema: dict) -> str:
    """
    Stable fingerprint for a tool definition.
    Sorting JSON keys preserves the historical M1 fingerprint rule.
    """
    payload = json.dumps(
        {"name": name, "description": description, "inputSchema": input_schema},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def tool_definition(tool):
    if not isinstance(tool, dict):
        # Keep malformed entries observable in the registry panel.
        tool = {"name": str(tool), "description": "<malformed: non-dict tool entry>"}
    return (str(tool.get("name", "<unnamed>")), str(tool.get("description", "") or ""),
            tool.get("inputSchema", {}) or {})


def same_json(before, after):
    if isinstance(before, bool) or isinstance(after, bool):
        return before is after
    if isinstance(before, dict) and isinstance(after, dict):
        return before.keys() == after.keys() and all(same_json(before[k], after[k]) for k in before)
    if isinstance(before, list) and isinstance(after, list):
        return len(before) == len(after) and all(same_json(a, b) for a, b in zip(before, after))
    return before == after


def compare_tools(before, after):
    old = {tool["name"]: tool for tool in before}
    new = {tool["name"]: tool for tool in after}
    changes = []
    for name in sorted(old.keys() | new.keys()):
        if name not in old:
            kind = "added"
        elif name not in new:
            kind = "gone"
        else:
            schema = not same_json(old[name]["inputSchema"], new[name]["inputSchema"])
            description = old[name]["description"] != new[name]["description"]
            if not (schema or description):
                continue
            kind = "both" if schema and description else "schema" if schema else "description"
        changes.append({"name": name, "change": kind})
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("address", help="MCP Streamable HTTP address")
    parser.add_argument("baseline", type=Path, nargs="?", help="earlier JSON result from this check")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="seconds per HTTP request")
    args = parser.parse_args()
    result = probe_server(args.address, timeout=args.timeout)
    if not result.ok:
        print(json.dumps({"error": result.error}))
        return 1
    tools = []
    for name, description, schema in sorted(map(tool_definition, result.tools), key=lambda tool: tool[0]):
        tools.append({"name": name, "description": description, "inputSchema": schema,
                      "fingerprint": tool_hash(name, description, schema)})
    changes = []
    if args.baseline is not None:
        try:
            before = json.loads(args.baseline.read_text(encoding="utf-8"))["tools"]
            changes = compare_tools(before, tools)
        except (OSError, KeyError, TypeError, ValueError) as exc:
            parser.error(f"invalid baseline: {exc}")
    print(json.dumps({"protocol_version": result.protocol_version, "tools": tools, "changes": changes},
                     ensure_ascii=False, indent=2))
    return 2 if changes else 0


if __name__ == "__main__":
    sys.exit(main())
