import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import http from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = join(here, "..");
export const REPO = join(TOOL_DIR, "../..");
export const CLI = join(TOOL_DIR, "bin/honesty.mjs");

export function runCli(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: opts.cwd || REPO,
    timeout: opts.timeout || 180_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  if (!text) throw new Error(`empty stdout; stderr=${result.stderr}`);
  return JSON.parse(text);
}

export function tmpOut() {
  return join(mkdtempSync(join(tmpdir(), "honesty-out-")), "report.json");
}

export async function startDummyJsonServer(handler) {
  const server = http.createServer((req, res) => {
    const body = handler ? handler(req) : { ok: true, dummy: true, url: req.url };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(`${JSON.stringify(body)}\n`);
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const addr = server.address();
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    async stop() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
