import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "webhook-drift.mjs");

function listen() {
  return new Promise((resolve) => {
    let hits = 0;
    const server = http.createServer((req, res) => {
      hits += 1;
      res.writeHead(200, { "content-type": "application/schema+json" });
      res.end(JSON.stringify({ type: "number" }));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        hits: () => hits,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

test("local-runtime: live HTTP $ref is refused and the server is never fetched", async () => {
  const srv = await listen();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-httpref-"));
  const before = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      amount: { $ref: `${srv.origin}/amount.json` },
    },
  };
  const after = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      amount: { type: "string" },
    },
  };
  const used = { pointers: ["/properties/amount"] };
  const beforePath = path.join(dir, "before.json");
  const afterPath = path.join(dir, "after.json");
  const usedPath = path.join(dir, "used.json");
  fs.writeFileSync(beforePath, `${JSON.stringify(before, null, 2)}\n`);
  fs.writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
  fs.writeFileSync(usedPath, `${JSON.stringify(used, null, 2)}\n`);
  try {
    const r = spawnSync(process.execPath, [BIN, "--before", beforePath, "--after", afterPath, "--used", usedPath], {
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(r.status, 2, r.stdout);
    const payload = JSON.parse(String(r.stdout || "").trim());
    assert.equal(payload.code, "remote-ref-refused");
    assert.equal(payload.ok, false);
    assert.equal(srv.hits(), 0, "CLI must not GET the local $ref URL");
  } finally {
    await srv.stop();
  }
});
