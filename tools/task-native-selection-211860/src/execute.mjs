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

export async function executeSyntheticLoopback({ entry, body }) {
  if (!entry || entry.outputSchemaState === "absent" || !entry.outputSchema) {
    return {
      state: "refused",
      reason: "output_contract_absent",
      synthetic: true,
      autonomousExternalUse: false,
    };
  }
  const path = entry.path || "/";
  const server = createServer((req, res) => {
    if ((req.url || "/").split("?")[0] !== path) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "path_mismatch" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const contract = validateInstance(entry.outputSchema, parsed);
    return {
      state: "synthetic_loopback",
      synthetic: true,
      autonomousExternalUse: false,
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
