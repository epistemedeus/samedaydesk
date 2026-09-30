import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectRequest } from "./inspect.mjs";
import { appendInterceptLog } from "./fetch-guard.mjs";
import { TOOL_ROOT } from "./pins.mjs";
import { enforcementContract } from "./enforcement.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
    server.on("error", reject);
  });
}

export function loadLog(logPath) {
  if (!existsSync(logPath)) return [];
  const text = readFileSync(logPath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function startIntercept({ logPath } = {}) {
  const dest = logPath || join(mkdtempSync(join(tmpdir(), "honesty-log-")), "intercept.ndjson");
  writeFileSync(dest, "");

  const server = http.createServer((req, res) => {
    const host = req.headers.host || "127.0.0.1";
    const url = `http://${host}${req.url || "/"}`;
    const hit = inspectRequest({ url, method: req.method, headers: req.headers });
    appendInterceptLog({ kind: "local-http", ...hit }, dest);
    const body = {
      ok: false,
      refused: true,
      blocked: true,
      code: hit.forbidden ? "honesty_forbidden_request" : "honesty_unexpected_network",
      reasons: hit.reasons,
      intercept: true,
      notAPayment: true,
    };
    res.writeHead(403, { "content-type": "application/json" });
    res.end(`${JSON.stringify(body)}\n`);
  });

  const addr = await listen(server);
  const origin = `http://127.0.0.1:${addr.port}`;

  const binDir = mkdtempSync(join(tmpdir(), "honesty-path-"));
  const netStub = pathToFileURL(join(TOOL_ROOT, "lib/net-stub.mjs")).href;
  const stubSource = `#!/usr/bin/env node
import { runNetStub } from ${JSON.stringify(netStub)};
const tool = process.argv[1] ? process.argv[1].split(/[\\\\/]/).pop() : "net";
await runNetStub(tool, process.argv.slice(2));
`;
  for (const name of ["curl", "wget"]) {
    writeFileSync(join(binDir, name), stubSource, { mode: 0o755 });
  }

  const guardHref = pathToFileURL(join(TOOL_ROOT, "lib/fetch-guard.mjs")).href;
  const nodeOptions = [process.env.NODE_OPTIONS, `--import ${guardHref}`].filter(Boolean).join(" ");

  const childEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`,
    NODE_OPTIONS: nodeOptions,
    HONESTY_INTERCEPT_LOG: dest,
    HONESTY_INTERCEPT_ORIGIN: origin,
    HTTP_PROXY: origin,
    HTTPS_PROXY: origin,
    ALL_PROXY: origin,
  };

  return {
    kind: "local-http+fetch-guard+path",
    osIsolation: false,
    enforcement: enforcementContract(),
    port: addr.port,
    origin,
    logPath: dest,
    binDir,
    guardHref,
    childEnv,
    async stop() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
