import { createServer } from "node:http";
import { validateInstance } from "./schema-support.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  });
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

export async function executeSyntheticLoopback({ entry, body }) {
  const method = typeof entry?.method === "string" ? entry.method.toUpperCase() : "";
  const base = {
    synthetic: true,
    autonomousExternalUse: false,
    faithfulInvocation: false,
    fixture: "response_schema",
    methodDelivery: "declared_method",
    method: method || null,
  };
  if (!entry || entry.outputSchemaState === "absent" || !entry.outputSchema) {
    return { ...base, state: "refused", reason: "output_contract_absent" };
  }
  if (!METHODS.has(method)) {
    return { ...base, state: "refused", reason: "method_unsupported" };
  }
  const path = entry.path || "/";
  let requestMethod = null;
  const server = createServer((req, res) => {
    requestMethod = req.method;
    if ((req.url || "/").split("?")[0] !== path) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "path_mismatch" }));
      return;
    }
    if (req.method !== method) {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "method_mismatch" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  const port = await listen(server);
  try {
    const init = { method };
    if (method !== "GET" && method !== "HEAD") {
      init.headers = { "content-type": "application/json" };
      init.body = "{}";
    }
    const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const contract = validateInstance(entry.outputSchema, parsed);
    return {
      ...base,
      state: "synthetic_loopback",
      requestMethod,
      requestBody: method === "GET" || method === "HEAD" ? null : "empty_json_not_a_service_request",
      loopbackHost: "127.0.0.1",
      port,
      status: response.status,
      contract,
      usefulAcceptance: { state: "not_observed", accepted: false },
    };
  } finally {
    await close(server);
  }
}
