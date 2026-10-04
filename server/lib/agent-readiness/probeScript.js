export const PROBE_PATHS = [
    "/",
    "/llms.txt",
    "/skill.md",
    "/openapi.json",
    "/.well-known/openapi.json",
    "/.well-known/agent-card.json",
    "/.well-known/agent.json",
    "/.well-known/api-catalog",
    "/.well-known/x402",
    "/.well-known/mcp.json",
    "/mcp",
    "/robots.txt",
];
import { LATEST_MCP_VERSION } from "./checks.js";
export function probeScript(host = "example.com") {
    return `#!/usr/bin/env bash
# Agent Readiness probe - builds an agent-readiness.probe.v1 bundle.
# Usage: ./probe.sh ${host} > bundle.json
set -euo pipefail

HOST="\${1:-${host}}"
BASE="https://\$HOST"
OUT="\$(mktemp -d)"
FALLBACK_FROM=""

# www fallback: if the apex redirects or returns no content, probe www. instead
root="\$(curl -sS -m 15 -o /dev/null -w '%{http_code} %{size_download} %{redirect_url}' "\$BASE/" || echo '000 0 ')"
read -r root_code root_size root_target <<< "\$root" || true
if [[ "\$HOST" != www.* ]]; then
  switch=""
  if [[ "\$root_code" == 3* && "\$root_target" == https://www.\$HOST* ]]; then
    switch="redirect"
  elif [[ "\$root_code" == 000 || "\$root_code" == 3* || "\$root_size" == 0 ]]; then
    www_code="\$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "https://www.\$HOST/llms.txt" || echo 000)"
    [[ "\$www_code" != 000 ]] && switch="no content"
  fi
  if [[ -n "\$switch" ]]; then
    FALLBACK_FROM="\$HOST"
    HOST="www.\$HOST"
    BASE="https://\$HOST"
    echo "apex returned \$root_code (\$switch), probing \$HOST instead" >&2
  fi
fi
PATHS=(
${PROBE_PATHS.map((p) => `  "${p}"`).join("\n")}
)

for p in "\${PATHS[@]}"; do
  f="\$OUT/\$(printf '%s' "\$p" | tr '/.' '__')"
  curl -sS -m 15 -o "\$f.body" -D "\$f.head" -w '%{http_code}' "\$BASE\$p" > "\$f.code" || echo 0 > "\$f.code"
  # OPTIONS preflight as a browser agent would send it
  curl -sS -m 15 -X OPTIONS -o /dev/null -D "\$f.pre" -w '%{http_code}' \\
    -H "Origin: https://agent.example" \\
    -H "Access-Control-Request-Method: GET" \\
    "\$BASE\$p" > "\$f.precode" || echo 0 > "\$f.precode"
done

# MCP JSON-RPC probes
curl -sS -m 20 -o "\$OUT/mcp_init.json" -X POST "\$BASE/mcp" \\
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"${LATEST_MCP_VERSION}","capabilities":{},"clientInfo":{"name":"agent-readiness","version":"1"}}}' || true
curl -sS -m 20 -o "\$OUT/mcp_tools.json" -X POST "\$BASE/mcp" \\
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' || true
curl -sS -m 20 -o "\$OUT/mcp_unknown.json" -X POST "\$BASE/mcp" \\
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"__definitely_not_a_tool__","arguments":{}}}' || true

HOST="\$HOST" OUT="\$OUT" FALLBACK_FROM="\$FALLBACK_FROM" PATHS="\${PATHS[*]}" python3 - <<'PY'
import json, os, re, datetime, urllib.request

out = os.environ["OUT"]
host = os.environ["HOST"]
paths = os.environ["PATHS"].split()

def slug(p):
    return p.replace("/", "_").replace(".", "_")

def read(p, default=""):
    try:
        with open(p, "r", errors="replace") as f:
            return f.read()
    except OSError:
        return default

def headers(raw):
    h = {}
    for line in raw.splitlines():
        if ":" in line and not line.lower().startswith("http/"):
            k, v = line.split(":", 1)
            h[k.strip().lower()] = v.strip()
    return h

bundle = {
    "schema": "agent-readiness.probe.v1",
    "host": host,
    "probedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "responses": {},
    "corsPreflight": {},
}

for p in paths:
    base = os.path.join(out, slug(p))
    code = int((read(base + ".code", "0") or "0").strip() or 0)
    h = headers(read(base + ".head"))
    body = read(base + ".body")
    entry = {"status": code, "headers": h}
    if code == 0:
        entry["error"] = "connection"
    if h.get("content-type"):
        entry["contentType"] = h["content-type"]
    if len(body) > 200000:
        entry["truncated"] = True
        body = body[:200000]
    if body:
        entry["body"] = body
    bundle["responses"][p] = entry
    pre_code = int((read(base + ".precode", "0") or "0").strip() or 0)
    bundle["corsPreflight"][p] = {"status": pre_code, "headers": headers(read(base + ".pre"))}

def parse_rpc(raw):
    # tolerate SSE framing from streamable HTTP MCP servers
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            line = line[5:].strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except ValueError:
                continue
    try:
        return json.loads(raw)
    except ValueError:
        return None

def rpc(name):
    return parse_rpc(read(os.path.join(out, name)))

init = rpc("mcp_init.json")
if init:
    bundle["mcp"] = {
        "url": "https://%s/mcp" % host,
        "offeredVersion": "${LATEST_MCP_VERSION}",
        "initialize": init,
        "toolsList": rpc("mcp_tools.json"),
        "unknownToolCall": rpc("mcp_unknown.json"),
    }

if os.environ.get("FALLBACK_FROM"):
    bundle["wwwFallback"] = {"from": os.environ["FALLBACK_FROM"], "to": host}

# ---- follow MCP links from the site's own discovery files ----
# Only initialize, tools/list and the unknown-tool check. No real tool is ever called.
MCP_PATH = re.compile(r"/[\\w.-]*mcp/?$", re.I)
URL_RE = re.compile(r"""(https?://[^\\s)<>"'\\]]+|(?<![\\w.:/])/[^\\s)<>"'\\]]*)""")

def absolute(u):
    u = u.strip().rstrip(".,;:")
    if u.startswith("http"):
        return u
    return "https://%s%s" % (host, u if u.startswith("/") else "/" + u)

def is_mcp(u):
    return bool(MCP_PATH.search(re.sub(r"[?#].*$", "", re.sub(r"^https?://[^/]+", "", u)) or "/"))

links = {}
def add(u, src):
    u = absolute(u)
    links.setdefault(u, [])
    if src not in links[u]:
        links[u].append(src)

def body_of(p):
    r = bundle["responses"].get(p) or {}
    return r.get("body", "") if 200 <= r.get("status", 0) < 300 else ""

def walk(v, acc):
    if isinstance(v, str) and (v.startswith("http") or v.startswith("/")):
        acc.append(v)
    elif isinstance(v, list):
        for x in v: walk(x, acc)
    elif isinstance(v, dict):
        for x in v.values(): walk(x, acc)

def get(url):
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read(200001)
            entry = {
                "status": r.status,
                "contentType": r.headers.get("content-type", ""),
                "body": data[:200000].decode("utf-8", "replace"),
            }
            if len(data) > 200000:
                entry["truncated"] = True
            return entry
    except Exception:
        return {"status": 0, "contentType": "", "body": "", "error": "connection"}

def post(url, payload):
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST", headers={
            "Content-Type": "application/json", "Accept": "application/json, text/event-stream"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return parse_rpc(r.read(200000).decode("utf-8", "replace"))
    except Exception:
        return None

llms = body_of("/llms.txt")
catalogs = []
for line in llms.splitlines():
    m = re.match(r"\\s*(?:[-*]\\s*)?([a-z0-9-]+)\\s*:\\s*(\\S+)", line, re.I)
    if m and m.group(1).lower() == "mcp-endpoint":
        add(m.group(2), "llms.txt mcp-endpoint")
    if m and m.group(1).lower() == "mcp-catalog-json":
        catalogs.append(absolute(m.group(2)))
    for u in URL_RE.findall(line):
        if is_mcp(u.rstrip(".,;:")):
            add(u, "llms.txt link")

bundle["linkedResponses"] = {}
for cat in catalogs:
    entry = get(cat)
    bundle["linkedResponses"][cat] = entry
    try:
        acc = []; walk(json.loads(entry.get("body") or "null"), acc)
        for u in acc:
            if is_mcp(u): add(u, "MCP catalog JSON")
    except ValueError:
        pass

for p, src in (("/.well-known/api-catalog", "api-catalog linkset"), ("/.well-known/agent-card.json", "agent-card interfaces")):
    try:
        acc = []; walk(json.loads(body_of(p) or "null"), acc)
        for u in acc:
            if is_mcp(u): add(u, src)
    except ValueError:
        pass

own = "https://%s/mcp" % host
linked = []
for url, sources in links.items():
    if url.rstrip("/") == own and init:
        bundle["mcp"]["foundVia"] = sources
        continue
    i = post(url, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "${LATEST_MCP_VERSION}", "capabilities": {},
        "clientInfo": {"name": "agent-readiness", "version": "1"}}})
    entry = {"url": url, "offeredVersion": "${LATEST_MCP_VERSION}", "foundVia": sources}
    if i:
        entry["initialize"] = i
        entry["toolsList"] = post(url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        entry["unknownToolCall"] = post(url, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {"name": "__definitely_not_a_tool__", "arguments": {}}})
    linked.append(entry)
if linked:
    bundle["linkedMcp"] = linked

print(json.dumps(bundle, indent=2))
PY
`;
}
